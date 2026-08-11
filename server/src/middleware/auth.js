import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import db from '../db/connection.js';

function resolveUser(req) {
  if (req.user) return true;
  const token = req.cookies?.token;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, name: payload.name, avatar: payload.avatar };
    return true;
  } catch {
    return false;
  }
}

export function authRequired(req, res, next) {
  if (!resolveUser(req)) {
    return res.status(401).json({ ok: false, error: '请先登录' });
  }
  next();
}

// Project-scoped route guard: user must be a member of the project's team
// (project PM passes even if not listed in team_members). Must run after a
// route has a :projectId param; skips when there is none.
export function requireProjectMember(req, res, next) {
  if (!resolveUser(req)) {
    return res.status(401).json({ ok: false, error: '请先登录' });
  }
  const { projectId } = req.params;
  if (!projectId) return next();
  const project = db.prepare('SELECT team_id, pm_user_id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ ok: false, error: '项目不存在' });
  const isPM = project.pm_user_id === req.user.id;
  const member = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(project.team_id, req.user.id);
  if (!isPM && !member) {
    return res.status(403).json({ ok: false, error: '你不是该项目团队成员' });
  }
  req.project = project;
  next();
}

// Project-scoped route guard: only the project PM passes.
export function requireProjectPM(req, res, next) {
  if (!resolveUser(req)) {
    return res.status(401).json({ ok: false, error: '请先登录' });
  }
  const { projectId } = req.params;
  const project = req.project || db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ ok: false, error: '项目不存在' });
  if (project.pm_user_id !== req.user.id) {
    return res.status(403).json({ ok: false, error: '只有项目PM可以操作' });
  }
  req.project = project;
  next();
}

export function authOptional(req, res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { id: payload.sub, name: payload.name, avatar: payload.avatar };
    } catch { /* token invalid, proceed without user */ }
  }
  next();
}
