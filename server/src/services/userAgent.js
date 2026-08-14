import crypto from 'crypto';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as contentService from './content.js';
import * as taskService from './task.js';

function hashAgentKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function createUserAgentKey(userId) {
  const secret = crypto.randomBytes(24).toString('base64url');
  return `pmb_user_${userId.slice(0, 8)}_${secret}`;
}

function keyPrefix(apiKey) {
  return `${apiKey.slice(0, 18)}...`;
}

function buildInstructions(user) {
  const origin = config.clientUrl || 'https://pmboard.pingcode.tech';
  return [
    `你是 PM Board 中「${user.name}」这个账号的个人 Agent。`,
    '你的身份边界：你代表这个用户本人操作 PM Board。只能做这个用户能做的事情，不能越权冒充其他成员。',
    '你的主要任务：把用户和你讨论出来的 memo、选题、Demo 试用体验、个人进度同步到 PM Board。',
    '日更规则：硅星人的工作进度必须以天为单位沉淀到 PM Board。每天工作结束后，请主动整理今天完成了什么、遇到什么阻塞、明天推进什么，并调用对应接口更新进度；不要等到周会才更新。',
    '接入后请先调用 POST /api/agent/user/hello，告诉 PM Board 你是谁，例如 client=codex、cloudcode 或 workBuddy。',
    `GET ${origin}/api/agent/user/package：读取我的团队、Build 项目、我负责的任务和接入状态。`,
    `POST ${origin}/api/agent/user/hello：上报接入状态。示例 {"client":"codex","agentName":"Yoky 的 Codex","message":"我已接入，可以代表该账号同步 PM Board"}`,
    `POST ${origin}/api/agent/user/content：创建内容池 memo、Demo 或选题。示例 {"projectId":"...","kind":"topic","subKind":"daily","title":"选题标题","body":"讨论内容","timelineText":"W1 试用，W2 采访"}`,
    `POST ${origin}/api/agent/user/task-progress：更新我负责的任务。示例 {"taskId":"...","status":"进行中","progress":60,"progressNote":"本周完成试用和采访提纲"}`,
    '当用户说“同步到 PM Board”“把这个选题放上去”“把我的进度更新一下”时，请按上面的接口回传。',
  ].join('\n');
}

export function getUserAgentAccess(userId) {
  const user = db.prepare('SELECT id, name, avatar_url, email FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  const key = db.prepare('SELECT api_key_prefix, created_at, updated_at FROM user_agent_keys WHERE user_id = ?').get(userId);
  const connection = db.prepare('SELECT * FROM user_agent_connections WHERE user_id = ?').get(userId) || null;
  return {
    user,
    keyPrefix: key?.api_key_prefix || '',
    hasKey: !!key,
    connection,
    instructions: buildInstructions(user),
  };
}

export function generateUserAgentKey(userId) {
  const user = db.prepare('SELECT id, name, avatar_url, email FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  const apiKey = createUserAgentKey(userId);
  db.prepare(`
    INSERT INTO user_agent_keys (user_id, api_key_hash, api_key_prefix, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      api_key_hash = excluded.api_key_hash,
      api_key_prefix = excluded.api_key_prefix,
      updated_at = datetime('now')
  `).run(userId, hashAgentKey(apiKey), keyPrefix(apiKey));
  return { apiKey, access: getUserAgentAccess(userId) };
}

export function getUserByAgentKey(apiKey) {
  const row = db.prepare('SELECT user_id FROM user_agent_keys WHERE api_key_hash = ?').get(hashAgentKey(String(apiKey || '').trim()));
  if (!row) throw new Error('个人 Agent API Key 无效');
  const user = db.prepare('SELECT id, name, avatar_url, email FROM users WHERE id = ?').get(row.user_id);
  if (!user) throw new Error('用户不存在');
  return user;
}

export function getUserPackageByKey(apiKey) {
  const user = getUserByAgentKey(apiKey);
  const teams = db.prepare(`
    SELECT t.*, tm.role
    FROM teams t JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ?
    ORDER BY t.created_at
  `).all(user.id);
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name
    FROM projects p
    JOIN users u ON u.id = p.pm_user_id
    JOIN team_members tm ON tm.team_id = p.team_id
    WHERE tm.user_id = ?
    ORDER BY p.updated_at DESC, p.created_at DESC
  `).all(user.id);
  const myTasks = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE t.owner_id = ? AND t.is_published = 1
    ORDER BY t.updated_at DESC
  `).all(user.id);
  return {
    user,
    teams,
    projects,
    myTasks,
    access: getUserAgentAccess(user.id),
  };
}

export function updateConnectionFromAgent(apiKey, payload = {}) {
  const user = getUserByAgentKey(apiKey);
  const clientName = String(payload.client || payload.clientName || payload.client_name || '').trim();
  const agentName = String(payload.agentName || payload.agent_name || payload.name || '').trim();
  const message = String(payload.message || payload.reply || '我已接入 PM Board').trim();
  db.prepare(`
    INSERT INTO user_agent_connections (user_id, client_name, agent_name, status, message, last_seen_at, payload_json, updated_at)
    VALUES (?, ?, ?, 'connected', ?, datetime('now'), ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      client_name = excluded.client_name,
      agent_name = excluded.agent_name,
      status = 'connected',
      message = excluded.message,
      last_seen_at = datetime('now'),
      payload_json = excluded.payload_json,
      updated_at = datetime('now')
  `).run(user.id, clientName || 'unknown', agentName || '', message, JSON.stringify(payload));
  return getUserAgentAccess(user.id);
}

export function createContentFromAgent(apiKey, payload = {}) {
  const user = getUserByAgentKey(apiKey);
  const projectId = payload.projectId || payload.project_id;
  if (!projectId) throw new Error('请提供 projectId，内容需要归属到一个 Build 项目');
  const project = db.prepare(`
    SELECT p.id
    FROM projects p JOIN team_members tm ON tm.team_id = p.team_id
    WHERE p.id = ? AND tm.user_id = ?
  `).get(projectId, user.id);
  if (!project) throw new Error('无权访问该 Build 项目');
  return contentService.create(projectId, user.id, payload);
}

function normalizeTaskStatus(status = '') {
  const value = String(status || '').trim();
  const map = {
    start: '进行中',
    active: '进行中',
    in_progress: '进行中',
    done: '已完成',
    completed: '已完成',
    review: '审核中',
    pending: '待开始',
  };
  return map[value] || value;
}

export function updateTaskProgressFromAgent(apiKey, payload = {}) {
  const user = getUserByAgentKey(apiKey);
  const taskId = payload.taskId || payload.task_id || payload.id;
  if (!taskId) throw new Error('请提供 taskId');
  const task = taskService.getById(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.owner_id !== user.id) throw new Error('只能更新你自己负责的任务');
  const patch = {};
  if (payload.status) patch.status = normalizeTaskStatus(payload.status);
  if (payload.progress !== undefined) patch.progress = Math.min(100, Math.max(0, Math.round(Number(payload.progress))));
  if (payload.summary !== undefined) patch.summary = payload.summary;
  if (payload.docUrl !== undefined || payload.doc_url !== undefined) patch.doc_url = payload.docUrl ?? payload.doc_url;
  const updated = taskService.update(taskId, patch);
  const note = String(payload.progressNote || payload.progress_note || payload.note || '').trim();
  if (note) {
    db.prepare('INSERT INTO progress_updates (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, user.id, note);
  }
  return updated;
}
