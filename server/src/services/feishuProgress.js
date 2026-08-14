import db from '../db/connection.js';
import { config } from '../config.js';
import * as feishuPushService from './feishuPush.js';

function pct(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentWeekKey() {
  const now = new Date();
  const oneJan = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayMs = 24 * 60 * 60 * 1000;
  return `${now.getUTCFullYear()}-W${Math.ceil((((now - oneJan) / dayMs) + oneJan.getUTCDay() + 1) / 7)}`;
}

function alreadySent(lastSentAt, frequency) {
  if (!lastSentAt) return false;
  const sent = new Date(lastSentAt);
  if (Number.isNaN(sent.getTime())) return false;
  if (frequency === 'daily') return lastSentAt.slice(0, 10) === todayKey();
  const oneJan = new Date(Date.UTC(sent.getUTCFullYear(), 0, 1));
  const dayMs = 24 * 60 * 60 * 1000;
  const sentWeek = `${sent.getUTCFullYear()}-W${Math.ceil((((sent - oneJan) / dayMs) + oneJan.getUTCDay() + 1) / 7)}`;
  return sentWeek === currentWeekKey();
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

export function buildBossDashboardReport(chatId = '') {
  const targetChatId = String(chatId || config.feishuBossChatId || '').trim();
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name
    FROM projects p JOIN users u ON u.id = p.pm_user_id
    WHERE p.feishu_boss_enabled = 1
      AND COALESCE(NULLIF(p.feishu_boss_chat_id, ''), ?) = ?
    ORDER BY p.updated_at DESC
  `).all(config.feishuBossChatId, targetChatId);
  if (!projects.length) return '';

  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(AVG(progress), 0) as progress,
      SUM(CASE WHEN owner_id IS NULL THEN 1 ELSE 0 END) as unclaimed,
      SUM(CASE WHEN status = '审核中' THEN 1 ELSE 0 END) as reviewing
    FROM tasks
    WHERE project_id = ? AND is_published = 1
  `);
  const lines = projects.map((project) => {
    const stats = taskStats.get(project.id);
    return `- ${project.name}｜PM：${project.pm_name || '未设置'}｜进度 ${pct(stats.progress)}｜任务 ${stats.total || 0}｜待认领 ${stats.unclaimed || 0}｜审核中 ${stats.reviewing || 0}`;
  });

  return [
    'PM Board 老板看板',
    `项目数：${projects.length}｜更新时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
    ...lines,
    '',
    `部门大盘：${config.clientUrl}/projects/${projects[0].id}/boss`,
  ].join('\n');
}

export async function sendProjectProgress(projectId, chatId) {
  const text = buildProjectProgressReport(projectId);
  await feishuPushService.sendTextToChat(chatId, text);
  db.prepare("UPDATE projects SET feishu_progress_last_sent_at = datetime('now') WHERE id = ?").run(projectId);
  return text;
}

export async function sendBossDashboard(chatId) {
  const targetChatId = String(chatId || config.feishuBossChatId || '').trim();
  if (!targetChatId) throw new Error('缺少老板看板飞书群 chat_id');
  const text = buildBossDashboardReport(targetChatId);
  if (!text) return '';
  await feishuPushService.sendTextToChat(targetChatId, text);
  db.prepare(`
    UPDATE projects
    SET feishu_boss_last_sent_at = datetime('now')
    WHERE feishu_boss_enabled = 1
      AND COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) = ?
  `).run(config.feishuBossChatId, targetChatId);
  return text;
}

async function sendDueProjectProgressOnce() {
  const rows = db.prepare(`
    SELECT id, feishu_progress_chat_id, feishu_progress_frequency, feishu_progress_last_sent_at
    FROM projects
    WHERE feishu_progress_enabled = 1
      AND feishu_progress_chat_id != ''
  `).all();

  for (const row of rows) {
    if (alreadySent(row.feishu_progress_last_sent_at, row.feishu_progress_frequency)) continue;
    try {
      await sendProjectProgress(row.id, row.feishu_progress_chat_id);
    } catch (err) {
      console.error('[feishu-progress] Project push failed:', err.userMessage || err.message);
    }
  }
}

async function sendDueBossDashboardOnce() {
  const rows = db.prepare(`
    SELECT DISTINCT COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) as chat_id, MAX(feishu_boss_last_sent_at) as last_sent_at
    FROM projects
    WHERE feishu_boss_enabled = 1
      AND COALESCE(NULLIF(feishu_boss_chat_id, ''), ?) != ''
    GROUP BY chat_id
  `).all(config.feishuBossChatId, config.feishuBossChatId);

  for (const row of rows) {
    if (alreadySent(row.last_sent_at, 'weekly')) continue;
    try {
      await sendBossDashboard(row.chat_id);
    } catch (err) {
      console.error('[feishu-progress] Boss dashboard push failed:', err.userMessage || err.message);
    }
  }
}

export function startProjectProgressSyncWorker() {
  const intervalMs = 30 * 60 * 1000;
  const tick = async () => {
    await sendDueProjectProgressOnce();
    await sendDueBossDashboardOnce();
  };
  setTimeout(tick, 20_000);
  setInterval(tick, intervalMs);
}
