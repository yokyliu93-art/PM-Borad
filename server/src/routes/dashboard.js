import { Router } from 'express';
import { authRequired, canAccessProject } from '../middleware/auth.js';
import db from '../db/connection.js';

const router = Router();

// Commander dashboard: all tasks with subtasks and updates
router.get('/commander', authRequired, (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ ok: false, error: '请指定项目' });
  const access = canAccessProject(projectId, req.user.id);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const project = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id WHERE p.id = ?
  `).get(projectId);

  const tasks = db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.project_id = ? AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId);

  for (const task of tasks) {
    task.subtasks = db.prepare(`
      SELECT s.*, u.name as assignee_name FROM subtasks s
      LEFT JOIN users u ON s.assignee_id = u.id WHERE s.task_id = ?
      ORDER BY s.sort_order
    `).all(task.id);
    task.updates = db.prepare(`
      SELECT pu.*, u.name as user_name FROM progress_updates pu
      JOIN users u ON pu.user_id = u.id WHERE pu.task_id = ?
      ORDER BY pu.created_at DESC
    `).all(task.id);
  }

  const teamMembers = db.prepare(`
    SELECT u.*, tm.role FROM users u
    JOIN team_members tm ON u.id = tm.user_id
    WHERE tm.team_id = (SELECT team_id FROM projects WHERE id = ?)
  `).all(projectId);

  // Workload: count tasks per member
  const workloads = teamMembers.map(m => {
    const pmTasks = tasks.filter(t => t.owner_id === m.id);
    const helperSubtasks = db.prepare(`
      SELECT COUNT(*) as count FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.assignee_id = ? AND t.project_id = ? AND t.owner_id != ?
    `).get(m.id, projectId, m.id);
    return { user: m, pmCount: pmTasks.length, helperCount: helperSubtasks.count };
  });

  res.json({ ok: true, data: { project, tasks, teamMembers, workloads } });
});

// Personal panel: tasks I own + subtasks assigned to me
router.get('/personal', authRequired, (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ ok: false, error: '请指定项目' });
  const access = canAccessProject(projectId, req.user.id);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const myTasks = db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.project_id = ? AND t.owner_id = ? AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId, req.user.id);

  for (const task of myTasks) {
    task.subtasks = db.prepare(`
      SELECT s.*, u.name as assignee_name FROM subtasks s
      LEFT JOIN users u ON s.assignee_id = u.id WHERE s.task_id = ?
    `).all(task.id);
    task.updates = db.prepare(`
      SELECT pu.*, u.name as user_name FROM progress_updates pu
      JOIN users u ON pu.user_id = u.id WHERE pu.task_id = ?
      ORDER BY pu.created_at DESC LIMIT 5
    `).all(task.id);
  }

  const mySubtasks = db.prepare(`
    SELECT s.*, t.title as task_title, t.id as task_id FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.assignee_id = ? AND t.project_id = ? AND t.is_published = 1
    ORDER BY s.status, s.created_at
  `).all(req.user.id, projectId);

  const claimable = db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.project_id = ? AND t.owner_id IS NULL AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId);

  res.json({ ok: true, data: { myTasks, mySubtasks, claimable } });
});

// Boss board: all projects in a team
router.get('/boss', authRequired, (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ ok: false, error: '请指定团队' });

  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.team_id = ?
    ORDER BY p.created_at DESC
  `).all(teamId);

  for (const project of projects) {
    project.tasks = db.prepare(`
      SELECT t.*, u.name as owner_name FROM tasks t
      LEFT JOIN users u ON t.owner_id = u.id
      WHERE t.project_id = ? AND t.is_published = 1
      ORDER BY t.sort_order
    `).all(project.id);
  }

  res.json({ ok: true, data: projects });
});

export default router;
