import { v4 as uuid } from 'uuid';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as feishuPushService from './feishuPush.js';

function pct(value) {
  return `${Math.round(Number(value || 0))}%`;
}

const BOSS_REPORT_PROMPT = `你是总 PM 办公室的项目管理顾问。请根据 PM Board 的部门大盘数据，写一份发给指定读者的飞书进度简报。
要求：
1. 用中文，语气专业、直接、少废话。
2. 不要写成机械列表，要先给整体判断，再讲关键进展、风险/阻塞、需要老板拍板或协调的事项。
3. 必须基于输入数据，不要编造不存在的人、金额、日期或结论。
4. 控制在 500 字以内，适合直接发到飞书群。
5. 如果读者是老板，重点写判断、风险、资源协调和需要拍板的事项。
6. 如果读者是主编，重点写选题/内容/发布节奏/跨团队配合。
7. 最后给出 3 条以内的下一步建议。`;

function currentWeekKey() {
  const now = new Date();
  const oneJan = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayMs = 24 * 60 * 60 * 1000;
  return `${now.getUTCFullYear()}-W${Math.ceil((((now - oneJan) / dayMs) + oneJan.getUTCDay() + 1) / 7)}`;
}

function shanghaiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    weekday: weekMap[values.weekday] || 1,
    hour: Number(values.hour || 0),
    minute: Number(values.minute || 0),
  };
}

function isFridayReportWindow() {
  const now = shanghaiNow();
  return now.weekday === 5 && (now.hour > 15 || (now.hour === 15 && now.minute >= 0));
}

function alreadySentThisWeek(lastSentAt) {
  if (!lastSentAt) return false;
  const sent = new Date(lastSentAt);
  if (Number.isNaN(sent.getTime())) return false;
  const oneJan = new Date(Date.UTC(sent.getUTCFullYear(), 0, 1));
  const dayMs = 24 * 60 * 60 * 1000;
  const sentWeek = `${sent.getUTCFullYear()}-W${Math.ceil((((sent - oneJan) / dayMs) + oneJan.getUTCDay() + 1) / 7)}`;
  return sentWeek === currentWeekKey();
}

function normalizeAudience(value = '') {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('主编') || text.includes('editor')) return 'editor';
  return 'boss';
}

function audienceLabel(audience) {
  return audience === 'editor' ? '主编' : '老板';
}

export function subscribeReport({ chatId, audience = 'boss', label = '', createdBy = '' }) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) throw new Error('缺少飞书群 chat_id');
  const cleanAudience = normalizeAudience(audience);
  db.prepare(`
    INSERT INTO feishu_report_subscriptions (id, chat_id, audience, label, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(chat_id, audience) DO UPDATE SET
      label = excluded.label,
      created_by = excluded.created_by,
      updated_at = datetime('now')
  `).run(uuid(), cleanChatId, cleanAudience, String(label || '').trim(), String(createdBy || '').trim());
  return getSubscription(cleanChatId, cleanAudience);
}

export function unsubscribeReport({ chatId, audience = '' }) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) throw new Error('缺少飞书群 chat_id');
  const cleanAudience = String(audience || '').trim();
  if (cleanAudience) {
    db.prepare('DELETE FROM feishu_report_subscriptions WHERE chat_id = ? AND audience = ?')
      .run(cleanChatId, normalizeAudience(cleanAudience));
  } else {
    db.prepare('DELETE FROM feishu_report_subscriptions WHERE chat_id = ?').run(cleanChatId);
  }
}

export function listSubscriptions() {
  return db.prepare(`
    SELECT * FROM feishu_report_subscriptions
    ORDER BY audience, created_at
  `).all();
}

export async function sendSubscriptionReply(chatId, text) {
  return feishuPushService.sendTextToChat(chatId, text);
}

function getSubscription(chatId, audience) {
  return db.prepare('SELECT * FROM feishu_report_subscriptions WHERE chat_id = ? AND audience = ?')
    .get(chatId, audience);
}

export function updateProjectFeishuSync(projectId, fields = {}) {
  const allowedFrequency = new Set(['daily', 'weekly']);
  const frequency = allowedFrequency.has(fields.frequency) ? fields.frequency : 'weekly';
  db.prepare(`
    UPDATE projects
    SET
      feishu_progress_enabled = ?,
      feishu_progress_chat_id = ?,
      feishu_progress_frequency = ?,
      feishu_boss_enabled = ?,
      feishu_boss_chat_id = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    fields.enabled ?? fields.feishu_progress_enabled ? 1 : 0,
    String(fields.chatId ?? fields.chat_id ?? fields.feishu_progress_chat_id ?? '').trim(),
    frequency,
    fields.bossEnabled ?? fields.feishu_boss_enabled ? 1 : 0,
    String(fields.bossChatId ?? fields.boss_chat_id ?? fields.feishu_boss_chat_id ?? '').trim(),
    projectId
  );
  return getProjectFeishuSync(projectId);
}

export function getProjectFeishuSync(projectId) {
  return db.prepare(`
    SELECT
      id,
      feishu_progress_enabled,
      feishu_progress_chat_id,
      feishu_progress_frequency,
      feishu_progress_last_sent_at,
      feishu_boss_enabled,
      feishu_boss_chat_id,
      feishu_boss_last_sent_at
    FROM projects
    WHERE id = ?
  `).get(projectId);
}

export function buildProjectProgressReport(projectId) {
  const project = db.prepare(`
    SELECT p.*, u.name as pm_name
    FROM projects p JOIN users u ON u.id = p.pm_user_id
    WHERE p.id = ?
  `).get(projectId);
  if (!project) throw new Error('项目不存在');

  const tasks = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tasks t LEFT JOIN users u ON u.id = t.owner_id
    WHERE t.project_id = ? AND t.is_published = 1
    ORDER BY t.sort_order, t.created_at
  `).all(projectId);
  const subtasks = db.prepare(`
    SELECT s.*, t.title as task_title
    FROM subtasks s JOIN tasks t ON t.id = s.task_id
    WHERE t.project_id = ? AND t.is_published = 1
  `).all(projectId);
  const doneTasks = tasks.filter((task) => task.status === '已完成' || Number(task.progress || 0) >= 100).length;
  const unclaimed = tasks.filter((task) => !task.owner_id).length;
  const reviewing = tasks.filter((task) => task.status === '审核中').length;
  const submittedSubtasks = subtasks.filter((item) => item.status === '已提交').length;
  const avgProgress = tasks.length
    ? tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length
    : 0;
  const topRisks = tasks
    .filter((task) => !task.owner_id || Number(task.progress || 0) < 30)
    .slice(0, 5);
  const activeTasks = tasks
    .filter((task) => task.owner_id && task.status !== '已完成')
    .slice(0, 6);

  return [
    `PM Board 项目进度：${project.name}`,
    `总 PM：${project.pm_name || '未设置'}｜整体进度：${pct(avgProgress)}`,
    `任务：${tasks.length} 个｜已完成：${doneTasks}｜待认领：${unclaimed}｜审核中：${reviewing}｜子任务待确认：${submittedSubtasks}`,
    '',
    '进行中：',
    ...(activeTasks.length
      ? activeTasks.map((task) => `- ${task.title}｜${task.owner_name || '未认领'}｜${pct(task.progress)}｜${task.status || '待开始'}`)
      : ['- 暂无进行中的任务']),
    '',
    '需要关注：',
    ...(topRisks.length
      ? topRisks.map((task) => `- ${task.title}｜${task.owner_name || '未认领'}｜${pct(task.progress)}`)
      : ['- 暂无明显风险']),
    '',
    `项目进度看板：${config.clientUrl}/projects/${projectId}/commander`,
    `部门大盘：${config.clientUrl}/projects/${projectId}/boss`,
  ].join('\n');
}

export function buildBossDashboardReport(chatId = '', audience = 'boss') {
  const snapshot = getBossDashboardSnapshot(chatId, audience);
  if (!snapshot.projects.length) return '';
  return formatBossDashboardFallback(snapshot);
}

function getBossDashboardSnapshot(chatId = '', audience = 'boss') {
  const targetChatId = String(chatId || config.feishuBossChatId || '').trim();
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name
    FROM projects p JOIN users u ON u.id = p.pm_user_id
    WHERE p.feishu_boss_enabled = 1
      AND COALESCE(NULLIF(p.feishu_boss_chat_id, ''), ?) = ?
    ORDER BY p.updated_at DESC
  `).all(config.feishuBossChatId, targetChatId);

  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(AVG(progress), 0) as progress,
      SUM(CASE WHEN owner_id IS NULL THEN 1 ELSE 0 END) as unclaimed,
      SUM(CASE WHEN status = '审核中' THEN 1 ELSE 0 END) as reviewing,
      SUM(CASE WHEN status = '已完成' OR progress >= 100 THEN 1 ELSE 0 END) as completed
    FROM tasks
    WHERE project_id = ? AND is_published = 1
  `);
  const riskTasks = db.prepare(`
    SELECT t.title, t.progress, t.status, u.name as owner_name
    FROM tasks t LEFT JOIN users u ON u.id = t.owner_id
    WHERE t.project_id = ? AND t.is_published = 1
      AND (t.owner_id IS NULL OR t.progress < 30 OR t.status = '审核中')
    ORDER BY t.owner_id IS NULL DESC, t.progress ASC, t.updated_at DESC
    LIMIT 5
  `);
  const recentUpdates = db.prepare(`
    SELECT pu.content, pu.created_at, u.name as user_name, t.title as task_title
    FROM progress_updates pu
    JOIN users u ON u.id = pu.user_id
    JOIN tasks t ON t.id = pu.task_id
    WHERE t.project_id = ?
    ORDER BY pu.created_at DESC
    LIMIT 5
  `);

  const enrichedProjects = projects.map((project) => {
    const stats = taskStats.get(project.id);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      pmName: project.pm_name || '',
      description: project.description || '',
      progress: Math.round(Number(stats.progress || 0)),
      taskTotal: Number(stats.total || 0),
      taskCompleted: Number(stats.completed || 0),
      unclaimed: Number(stats.unclaimed || 0),
      reviewing: Number(stats.reviewing || 0),
      riskTasks: riskTasks.all(project.id),
      recentUpdates: recentUpdates.all(project.id),
      boardUrl: `${config.clientUrl}/projects/${project.id}/boss`,
    };
  });

  return {
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    chatId: targetChatId,
    audience: audienceLabel(normalizeAudience(audience)),
    projects: enrichedProjects,
    boardUrl: enrichedProjects[0] ? `${config.clientUrl}/projects/${enrichedProjects[0].id}/boss` : '',
  };
}

function formatBossDashboardFallback(snapshot) {
  const lines = snapshot.projects.map((project) => (
    `- ${project.name}｜PM：${project.pmName || '未设置'}｜进度 ${pct(project.progress)}｜任务 ${project.taskTotal}｜待认领 ${project.unclaimed}｜审核中 ${project.reviewing}`
  ));

  return [
    'PM Board 老板看板',
    `订阅读者：${snapshot.audience}｜项目数：${snapshot.projects.length}｜更新时间：${snapshot.generatedAt}`,
    '',
    ...lines,
    '',
    `部门大盘：${snapshot.boardUrl}`,
  ].join('\n');
}

async function callDeepSeekBossReport(snapshot) {
  if (!config.deepseekApiKey) throw new Error('DeepSeek API Key 未配置');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  let res;
  try {
    res = await fetch(`${config.deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: BOSS_REPORT_PROMPT },
          { role: 'user', content: JSON.stringify(snapshot, null, 2) },
        ],
        temperature: 0.35,
        max_tokens: 1800,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(controller.signal.aborted ? `DeepSeek 响应超时（${config.aiTimeoutMs / 1000}秒）` : '无法连接 DeepSeek 服务');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek 返回错误（${res.status}）：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!content) throw new Error('DeepSeek 未返回老板总结');
  return [
    content.replace(/^```(?:markdown|text)?\s*/i, '').replace(/```\s*$/, '').trim(),
    '',
    `部门大盘：${snapshot.boardUrl}`,
  ].join('\n');
}

export async function sendProjectProgress(projectId, chatId) {
  const text = buildProjectProgressReport(projectId);
  await feishuPushService.sendTextToChat(chatId, text);
  db.prepare("UPDATE projects SET feishu_progress_last_sent_at = datetime('now') WHERE id = ?").run(projectId);
  return text;
}

export async function sendBossDashboard(chatId) {
  return sendAudienceDashboard({ chatId, audience: 'boss' });
}

export async function sendAudienceDashboard({ chatId, audience = 'boss', subscriptionId = '' }) {
  const targetChatId = String(chatId || config.feishuBossChatId || '').trim();
  if (!targetChatId) throw new Error('缺少老板看板飞书群 chat_id');
  const cleanAudience = normalizeAudience(audience);
  const snapshot = getBossDashboardSnapshot(targetChatId, cleanAudience);
  if (!snapshot.projects.length) return '';
  let text;
  try {
    text = await callDeepSeekBossReport(snapshot);
  } catch (err) {
    console.error('[feishu-progress] DeepSeek boss report failed, using fallback:', err.message);
    text = formatBossDashboardFallback(snapshot);
  }
  if (!text) return '';
  await feishuPushService.sendTextToChat(targetChatId, text);
  if (subscriptionId) {
    db.prepare("UPDATE feishu_report_subscriptions SET last_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(subscriptionId);
  } else {
    db.prepare(`
      UPDATE projects
      SET feishu_boss_last_sent_at = datetime('now')
      WHERE feishu_boss_enabled = 1
        AND COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) = ?
    `).run(config.feishuBossChatId, targetChatId);
  }
  return text;
}

async function sendDueProjectProgressOnce() {
  if (!isFridayReportWindow()) return;
  const rows = db.prepare(`
    SELECT id, feishu_progress_chat_id, feishu_progress_frequency, feishu_progress_last_sent_at
    FROM projects
    WHERE feishu_progress_enabled = 1
      AND feishu_progress_chat_id != ''
  `).all();

  for (const row of rows) {
    if (alreadySentThisWeek(row.feishu_progress_last_sent_at)) continue;
    try {
      await sendProjectProgress(row.id, row.feishu_progress_chat_id);
    } catch (err) {
      console.error('[feishu-progress] Project push failed:', err.userMessage || err.message);
    }
  }
}

async function sendDueBossDashboardOnce() {
  if (!isFridayReportWindow()) return;
  const rows = db.prepare(`
    SELECT DISTINCT COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) as chat_id, MAX(feishu_boss_last_sent_at) as last_sent_at
    FROM projects
    WHERE feishu_boss_enabled = 1
      AND COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) != ''
    GROUP BY chat_id
  `).all(config.feishuBossChatId, config.feishuBossChatId);

  for (const row of rows) {
    if (alreadySentThisWeek(row.last_sent_at)) continue;
    try {
      await sendBossDashboard(row.chat_id);
    } catch (err) {
      console.error('[feishu-progress] Boss dashboard push failed:', err.userMessage || err.message);
    }
  }

  const subscriptions = listSubscriptions();
  for (const sub of subscriptions) {
    if (alreadySentThisWeek(sub.last_sent_at)) continue;
    try {
      await sendAudienceDashboard({
        chatId: sub.chat_id,
        audience: sub.audience,
        subscriptionId: sub.id,
      });
    } catch (err) {
      console.error('[feishu-progress] Subscription push failed:', err.userMessage || err.message);
    }
  }
}

export function startProjectProgressSyncWorker() {
  const intervalMs = 10 * 60 * 1000;
  const tick = async () => {
    await sendDueProjectProgressOnce();
    await sendDueBossDashboardOnce();
  };
  setTimeout(tick, 20_000);
  setInterval(tick, intervalMs);
}
