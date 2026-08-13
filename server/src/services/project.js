import { v4 as uuid } from 'uuid';
import { unlinkSync } from 'fs';
import path from 'path';
import db from '../db/connection.js';
import { config } from '../config.js';

export function create({ teamId, name, description, planMarkdown, pmUserId, timelineJson, memberIds }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO projects (id, team_id, name, description, plan_markdown, pm_user_id, timeline_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, teamId, name, description || '', planMarkdown || '', pmUserId, JSON.stringify(timelineJson || []));
  const stmt = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)');
  for (const uid of new Set([pmUserId, ...(memberIds || [])])) stmt.run(id, uid);
  return getById(id);
}

export function listByTeam(teamId, userId) {
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.team_id = ?
      AND (
        p.pm_user_id = ?
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = ?
        )
      )
    ORDER BY p.created_at DESC
  `).all(teamId, userId, userId);
  const progressStmt = db.prepare(
    'SELECT COALESCE(AVG(progress), 0) as p FROM tasks WHERE project_id = ? AND is_published = 1'
  );
  for (const project of projects) {
    project.progress = Math.round(progressStmt.get(project.id).p ?? 0);
  }
  return projects;
}

export function getById(id) {
  const project = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.id = ?
  `).get(id);
  if (project) {
    project.members = db.prepare(`
      SELECT u.id, u.name, u.avatar_url
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
    `).all(id);
  }
  return project;
}

export function update(id, fields) {
  const allowed = ['name', 'description', 'plan_markdown', 'timeline_json', 'status'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(key === 'timeline_json' ? JSON.stringify(fields[key]) : fields[key]);
    }
  }
  const project = db.prepare('SELECT team_id, pm_user_id FROM projects WHERE id = ?').get(id);
  if (!project) return null;
  const hasMemberUpdate = Array.isArray(fields.memberIds);

  if (sets.length === 0 && !hasMemberUpdate) return getById(id);

  const tx = db.transaction(() => {
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    if (hasMemberUpdate) {
      const teamMemberRows = db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(project.team_id);
      const allowedMemberIds = new Set(teamMemberRows.map((row) => row.user_id));
      const memberIds = [...new Set([...fields.memberIds, project.pm_user_id])]
        .filter((userId) => allowedMemberIds.has(userId));
      db.prepare('DELETE FROM project_members WHERE project_id = ?').run(id);
      const insert = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)');
      for (const userId of memberIds) insert.run(id, userId);
    }
  });

  tx();
  return getById(id);
}

export function remove(id) {
  // FKs are enforced without CASCADE, so delete child rows first.
  const tx = db.transaction(() => {
    const files = db.prepare(`
      SELECT file_path FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
    `).all(id);
    const subFiles = db.prepare(`
      SELECT file_path FROM subtask_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
    `).all(id);
    db.prepare('DELETE FROM progress_updates WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_steps WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return [...files, ...subFiles];
  });
  const files = tx();
  for (const f of files) {
    try { unlinkSync(path.join(config.uploadsDir, path.basename(f.file_path))); } catch {}
  }
}
