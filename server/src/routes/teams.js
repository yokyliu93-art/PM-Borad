import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { authRequired } from '../middleware/auth.js';
import db from '../db/connection.js';

const router = Router();

router.post('/', authRequired, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: '团队名称不能为空' });
  const id = uuid();
  db.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(id, name);
  db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'admin');
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  res.status(201).json({ ok: true, data: team });
});

router.get('/', authRequired, (req, res) => {
  const teams = db.prepare(`
    SELECT DISTINCT t.*, tm.role as my_role
    FROM teams t JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = ?
    ORDER BY t.created_at DESC
  `).all(req.user.id);
  res.json({ ok: true, data: teams });
});

router.get('/:teamId', authRequired, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ ok: false, error: '团队不存在' });
  const members = db.prepare(`
    SELECT u.*, tm.role FROM users u
    JOIN team_members tm ON u.id = tm.user_id
    WHERE tm.team_id = ?
  `).all(req.params.teamId);
  res.json({ ok: true, data: { ...team, members } });
});

router.post('/:teamId/members', authRequired, (req, res) => {
  const { userId, role } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: '用户ID不能为空' });
  const exists = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.teamId, userId);
  if (exists) return res.status(409).json({ ok: false, error: '该成员已在团队中' });
  db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(req.params.teamId, userId, role || 'member');
  res.status(201).json({ ok: true });
});

router.delete('/:teamId/members/:userId', authRequired, (req, res) => {
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(req.params.teamId, req.params.userId);
  res.json({ ok: true });
});

export default router;
