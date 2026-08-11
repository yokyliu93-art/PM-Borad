import db from '../db/connection.js';

export function requireProjectPM(projectId, userId) {
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(projectId);
  if (!project) return false;
  return project.pm_user_id === userId;
}

export function requireTaskPM(taskId, userId) {
  const task = db.prepare(`
    SELECT p.pm_user_id as project_pm, t.owner_id as task_owner
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(taskId);
  if (!task) return false;
  return task.project_pm === userId || task.task_owner === userId;
}

export function requireTeamMember(teamId, userId) {
  const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
  return !!member;
}
