import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import db from '../db/connection.js';

// Scopes requested during Feishu OAuth. Doc read scopes let the app import
// document content on the user's behalf; keep them in sync with the scopes
// granted in the Feishu console.
export const FEISHU_SCOPES = 'docx:document:readonly wiki:wiki:readonly drive:drive:readonly minutes:minutes:readonly minutes:minutes.transcript:export';

export function getLoginUrl(state) {
  const redirectUri = `${config.clientUrl}/api/auth/callback`;
  const params = new URLSearchParams({
    app_id: config.feishuAppId,
    redirect_uri: redirectUri,
    state,
    scope: FEISHU_SCOPES,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params}`;
}

export async function exchangeCode(code) {
  const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.feishuAppId,
      app_secret: config.feishuAppSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.code !== 0) {
    throw new Error(`飞书Token交换失败: ${tokenData.msg}`);
  }
  return tokenData.data; // { access_token, refresh_token, expires_in, ... }
}

// Persist the user's Feishu user_access_token (and refresh token) so the
// backend can call Feishu APIs on their behalf for doc import.
export function saveUserTokens(userId, { accessToken, refreshToken = '', expiresIn = 7200 }) {
  const expiresAt = Date.now() + Number(expiresIn || 7200) * 1000;
  db.prepare(`
    INSERT INTO user_feishu_tokens (user_id, access_token, refresh_token, token_expires_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      updated_at = datetime('now')
  `).run(userId, accessToken, refreshToken, expiresAt);
}

export async function getFeishuUser(accessToken) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书用户信息获取失败: ${data.msg}`);
  }
  return data.data;
}

export function upsertUser(feishuUser) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(feishuUser.open_id);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?').run(
      feishuUser.name, feishuUser.avatar_url, feishuUser.email || '', feishuUser.open_id
    );
  } else {
    db.prepare('INSERT INTO users (id, name, avatar_url, email) VALUES (?, ?, ?, ?)').run(
      feishuUser.open_id, feishuUser.name, feishuUser.avatar_url || '', feishuUser.email || ''
    );
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(feishuUser.open_id);
}

// New users are joined to the configured default team on login so everyone
// lands in the shared workspace and can see the same projects.
export function ensureDefaultTeamMembership(userId) {
  if (!config.defaultTeamId) return;
  db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)')
    .run(config.defaultTeamId, userId, 'member');
}

export function signJwt(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, avatar: user.avatar_url },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function listUsers() {
  return db.prepare(`
    SELECT id, name, avatar_url, email, created_at FROM users ORDER BY created_at, id
  `).all();
}

export function getUserById(id) {
  return db.prepare('SELECT id, name, avatar_url, email, created_at FROM users WHERE id = ?').get(id);
}

export function updateProfile(id, { name, avatarUrl }) {
  const cleanName = String(name || '').trim();
  const cleanAvatarUrl = String(avatarUrl || '').trim();
  if (!cleanName) throw new Error('昵称不能为空');
  if (cleanAvatarUrl && !/^https?:\/\/.+/i.test(cleanAvatarUrl)) {
    throw new Error('头像链接需要以 http:// 或 https:// 开头');
  }
  db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
    .run(cleanName, cleanAvatarUrl, id);
  return getUserById(id);
}

export function createUser({ name }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('用户名不能为空');
  const rows = db.prepare("SELECT id FROM users WHERE id LIKE 'dev-user-%'").all();
  let max = 0;
  for (const r of rows) {
    const m = r.id.match(/^dev-user-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = `dev-user-${String(max + 1).padStart(3, '0')}`;
  db.prepare('INSERT INTO users (id, name, avatar_url, email) VALUES (?, ?, ?, ?)').run(id, cleanName, '', '');
  return db.prepare('SELECT id, name, avatar_url, email, created_at FROM users WHERE id = ?').get(id);
}

export function deleteUser(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return null;
  const { c: pmCount } = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE pm_user_id = ?').get(id);
  if (pmCount > 0) {
    throw new Error(`该用户是 ${pmCount} 个项目的PM，请先转移或删除这些项目再删除账号`);
  }

  const remove = db.transaction((uid) => {
    const files = [
      ...db.prepare('SELECT file_path FROM task_attachments WHERE uploaded_by = ?').all(uid),
      ...db.prepare('SELECT file_path FROM subtask_attachments WHERE uploaded_by = ?').all(uid),
    ];
    db.prepare('DELETE FROM subtask_attachments WHERE uploaded_by = ?').run(uid);
    db.prepare('DELETE FROM task_attachments WHERE uploaded_by = ?').run(uid);
    db.prepare('DELETE FROM progress_updates WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM project_members WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM team_members WHERE user_id = ?').run(uid);
    db.prepare('UPDATE tasks SET owner_id = NULL WHERE owner_id = ?').run(uid);
    db.prepare('UPDATE subtasks SET assignee_id = NULL, submitted_by = NULL WHERE assignee_id = ? OR submitted_by = ?').run(uid, uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    return files;
  });
  const files = remove(id);

  for (const f of files) {
    try { fs.unlinkSync(path.join(config.uploadsDir, path.basename(f.file_path))); } catch {}
  }
  return user;
}
