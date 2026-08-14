import { v4 as uuid } from 'uuid';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as feishuPushService from './feishuPush.js';

const DEFAULT_LOOPS = [
  {
    key: 'weekly_invite_builder',
    title: '每周邀请一位 Builder',
    description: '每人每周邀请一位 BuilderHub 推荐项目或 Builder，完成后点击完成。',
    audience: 'all',
    prompt: '你本周的 BuilderHub 推荐项目是谁？请邀请一位，并在 PM Board 点完成。',
    sort: 10,
  },
  {
    key: 'weekly_genai_digest',
    title: 'GenAI BuilderHub 周推荐文章',
    description: '每周发布一篇 BuilderHub 项目集合推荐。',
    audience: 'pm',
    prompt: '本周需要产出 GenAI BuilderHub 项目集合推荐文章，请确认选题、项目清单、发布时间和发布渠道。',
    sort: 20,
  },
];

export function currentWeekKey() {
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
  return { weekday: weekMap[values.weekday] || 1, hour: Number(values.hour || 0), minute: Number(values.minute || 0) };
}

function isLoopPromptWindow() {
  const now = shanghaiNow();
  return now.weekday === 1 && (now.hour > 10 || (now.hour === 10 && now.minute >= 0));
}

export function ensureProjectLoops(projectId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO project_loops (id, project_id, loop_key, title, description, audience, prompt_text, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const loop of DEFAULT_LOOPS) {
    insert.run(uuid(), projectId, loop.key, loop.title, loop.description, loop.audience, loop.prompt, loop.sort);
  }
}

function ensureCompletion(loop, userId, weekKey) {
  db.prepare(`
    INSERT OR IGNORE INTO project_loop_completions (id, loop_id, project_id, user_id, week_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), loop.id, loop.project_id, userId, weekKey);
}

function loopAudienceMembers(project, loop) {
  if (loop.audience === 'pm') {
    return db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').all(project.pm_user_id);
  }
  return db.prepare(`
    SELECT u.id, u.name, u.avatar_url
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    UNION
    SELECT u.id, u.name, u.avatar_url
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
  `).all(project.id, project.team_id);
}

export function listUserLoops(projectId, userId) {
  ensureProjectLoops(projectId);
  const weekKey = currentWeekKey();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const loops = db.prepare(`
    SELECT * FROM project_loops
    WHERE project_id = ? AND enabled = 1
      AND (audience = 'all' OR (audience = 'pm' AND ? = ?))
    ORDER BY sort_order, created_at
  `).all(projectId, userId, project.pm_user_id);
  for (const loop of loops) ensureCompletion(loop, userId, weekKey);
  return db.prepare(`
    SELECT
      l.*,
      c.status,
      c.note,
      c.completed_at,
      c.week_key
    FROM project_loops l
    JOIN project_loop_completions c ON c.loop_id = l.id AND c.user_id = ? AND c.week_key = ?
    WHERE l.project_id = ? AND l.enabled = 1
      AND (l.audience = 'all' OR (l.audience = 'pm' AND ? = ?))
    ORDER BY l.sort_order, l.created_at
  `).all(userId, weekKey, projectId, userId, project.pm_user_id);
}

export function completeLoop(projectId, loopId, userId, note = '') {
  const loop = db.prepare('SELECT * FROM project_loops WHERE id = ? AND project_id = ?').get(loopId, projectId);
  if (!loop) throw new Error('Loop 不存在');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (loop.audience === 'pm' && project.pm_user_id !== userId) throw new Error('这个周常只分配给项目 PM');
  const weekKey = currentWeekKey();
  ensureCompletion(loop, userId, weekKey);
  db.prepare(`
    UPDATE project_loop_completions
    SET status = 'done', note = ?, completed_at = datetime('now'), updated_at = datetime('now')
    WHERE loop_id = ? AND user_id = ? AND week_key = ?
  `).run(String(note || '').trim(), loopId, userId, weekKey);
  return listUserLoops(projectId, userId);
}

async function sendLoopPromptsOnce() {
  if (!isLoopPromptWindow()) return;
  const weekKey = currentWeekKey();
  const projects = db.prepare('SELECT * FROM projects').all();
  for (const project of projects) {
    ensureProjectLoops(project.id);
    const loops = db.prepare(`
      SELECT * FROM project_loops
      WHERE project_id = ? AND enabled = 1 AND COALESCE(last_prompt_week, '') != ?
      ORDER BY sort_order
    `).all(project.id, weekKey);
    for (const loop of loops) {
      const members = loopAudienceMembers(project, loop);
      for (const member of members) {
        ensureCompletion(loop, member.id, weekKey);
        try {
          await feishuPushService.sendLoopReminderCard({
            openId: member.id,
            projectName: project.name,
            title: loop.title,
            description: loop.description,
            promptText: loop.prompt_text,
            boardUrl: `${config.clientUrl}/projects/${project.id}/mine`,
          });
        } catch (err) {
          console.error('[loop] Feishu prompt failed:', err.userMessage || err.message);
        }
      }
      db.prepare("UPDATE project_loops SET last_prompt_week = ?, updated_at = datetime('now') WHERE id = ?")
        .run(weekKey, loop.id);
    }
  }
}

export function startLoopWorker() {
  const intervalMs = 10 * 60 * 1000;
  setTimeout(sendLoopPromptsOnce, 30_000);
  setInterval(sendLoopPromptsOnce, intervalMs);
}
