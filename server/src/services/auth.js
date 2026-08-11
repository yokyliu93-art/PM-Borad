import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import db from '../db/connection.js';

export function getLoginUrl(state) {
  if (!config.feishuAppId) {
    throw new Error('飞书 OAuth 未配置：缺少 FEISHU_APP_ID');
  }
  const redirectUri = `${config.serverUrl}/api/auth/callback`;
  const params = new URLSearchParams({
    app_id: config.feishuAppId,
    redirect_uri: redirectUri,
    state,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params}`;
}

export function getGoogleLoginUrl(state) {
  if (!config.googleClientId) {
    throw new Error('Google OAuth 未配置：缺少 GOOGLE_CLIENT_ID');
  }
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${config.serverUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
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
  return tokenData.data.access_token;
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

export async function exchangeGoogleCode(code) {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('Google OAuth 未配置：缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET');
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${config.serverUrl}/api/auth/google/callback`,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Google Token 交换失败: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`);
  }
  return tokenData.access_token;
}

export async function getGoogleUser(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok || !data.sub) {
    throw new Error(`Google 用户信息获取失败: ${data.error_description || data.error || res.statusText}`);
  }
  return data;
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

export function upsertGoogleUser(googleUser) {
  const id = `google:${googleUser.sub}`;
  const name = googleUser.name || googleUser.email || 'Google User';
  const avatarUrl = googleUser.picture || '';
  const email = googleUser.email || '';
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?').run(
      name, avatarUrl, email, id
    );
  } else {
    db.prepare('INSERT INTO users (id, name, avatar_url, email) VALUES (?, ?, ?, ?)').run(
      id, name, avatarUrl, email
    );
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
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
