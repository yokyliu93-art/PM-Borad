import db from '../db/connection.js';
import { createTasksFromDefs } from './task.js';

export function listAll() {
  return db.prepare('SELECT * FROM template_definitions ORDER BY category, name').all();
}

export function getById(id) {
  return db.prepare('SELECT * FROM template_definitions WHERE id = ?').get(id);
}

export function applyToProject(templateId, projectId) {
  const template = getById(templateId);
  if (!template) throw new Error('模板不存在');
  return createTasksFromDefs(projectId, JSON.parse(template.tasks_json));
}
