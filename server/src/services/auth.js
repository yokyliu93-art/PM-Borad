import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import db from '../db/connection.js';

export function getLoginUrl(state) {
  const redirectUri = `${config.clientUrl}/api/auth/callback`;
  const params = new URLSearchParams({
    app_id: config.feishuAppId,
    redirect_uri: redirectUri,
    state,
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
