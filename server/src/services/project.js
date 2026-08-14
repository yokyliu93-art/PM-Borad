import { v4 as uuid } from 'uuid';
import { unlinkSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as taskService from './task.js';

export function create({ teamId, name, description, planMarkdown, pmUserId, timelineJson, memberIds }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO projects (id, team_id, name, description, plan_markdown, pm_user_id, timeline_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, teamId, name, description || '', planMarkdown || '', pmUserId, JSON.stringify(timelineJson || []));
  const stmt = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)');
  for (const uid of new Set([pmUserId, ...(memberIds || [])])) stmt.run(id, uid);
  ensureDefaultProjectAgentSetup(id);
  return getById(id);
}

export function listByTeam(teamId, userId) {
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.team_id = ?
    ORDER BY p.created_at DESC
  `).all(teamId);
  const progressStmt = db.prepare(
    'SELECT COALESCE(AVG(progress), 0) as p FROM tasks WHERE project_id = ? AND is_published = 1'
  );
  const taskCountStmt = db.prepare(
    'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND is_published = 1'
  );
  const claimableStmt = db.prepare(
    'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND owner_id IS NULL AND is_published = 1'
  );
  const myTaskStmt = db.prepare(
    'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND owner_id = ? AND is_published = 1'
  );
  const pendingReviewStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = '审核中' AND is_published = 1)
      +
      (SELECT COUNT(*) FROM subtasks s JOIN tasks t ON s.task_id = t.id WHERE t.project_id = ? AND s.status = '已提交' AND t.is_published = 1)
      as c
  `);
  const ownerCountStmt = db.prepare(
    'SELECT COUNT(DISTINCT owner_id) as c FROM tasks WHERE project_id = ? AND owner_id IS NOT NULL AND is_published = 1'
  );
  for (const project of projects) {
    project.progress = Math.round(progressStmt.get(project.id).p ?? 0);
    project.task_count = taskCountStmt.get(project.id).c;
    project.claimable_count = claimableStmt.get(project.id).c;
    project.my_task_count = userId ? myTaskStmt.get(project.id, userId).c : 0;
    project.pending_review_count = pendingReviewStmt.get(project.id, project.id).c;
    project.active_people_count = ownerCountStmt.get(project.id).c;
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
    project.teamMembers = db.prepare(`
      SELECT u.id, u.name, u.avatar_url, tm.role
      FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY u.name
    `).all(project.team_id);
    project.modules = listModules(id);
  }
  return project;
}

export function update(id, fields) {
  const allowed = ['name', 'description', 'plan_markdown', 'timeline_json', 'status'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'timeline_json' && isBlankTimeline(fields[key])) continue;
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

function isBlankTimeline(value) {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every((item) => {
    if (Array.isArray(item)) return !String(item[1] || '').trim();
    if (item && typeof item === 'object') {
      return !String(item.detail || item.plan || item.summary || item.goal || item.description || '').trim();
    }
    return !String(item || '').trim();
  });
}

function hashAgentKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function createProjectAgentKey(projectId) {
  const secret = crypto.randomBytes(24).toString('base64url');
  return `pmb_project_${projectId.slice(0, 8)}_${secret}`;
}

function keyPrefix(apiKey) {
  return `${apiKey.slice(0, 18)}...`;
}

export function buildDefaultProjectAgentInstructions(project) {
  return [
    `你是 PM Board 中「${project.name}」这个项目的总 PM Agent。`,
    project.description ? `项目简介：${project.description}` : '',
    project.plan_markdown ? `项目计划书：\n${project.plan_markdown}` : '',
    '你的权限边界：只能管理这个项目下的任务块，不能越权到其他项目。',
    '项目第一层不是固定模板。你需要先基于飞书文档/项目计划书判断这个项目应该有哪些一级菜单，并调用项目 Agent API 写入一级菜单。',
    '一级菜单写入后，再把二级任务挂到对应一级菜单下面。每个项目情况不同，不要默认使用产品/运营/内容。',
    '你也可以回传项目 Timeline。Timeline 按周组织，W1 表示第一周，W2 表示第二周；每周要写清目标、关键动作、负责人/配合方和交付物。',
    '回传每个二级任务时请带 module 字段，module 应该等于某个一级菜单名称。每个二级任务要有标题、目标说明、周期和建议子任务。',
    '当总 PM 说“传到 PM Board”时，请调用项目 Agent API 回传一级菜单、Timeline 和二级任务。PM Board 会以你回传的内容为主视图。',
  ].filter(Boolean).join('\n');
}

export function ensureDefaultProjectAgentSetup(projectId) {
  const project = getById(projectId);
  if (!project) throw new Error('项目不存在');
  if (!project.agent_instructions) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(buildDefaultProjectAgentInstructions(project), projectId);
  }
  if (!project.agent_api_key_hash) {
    const apiKey = createProjectAgentKey(projectId);
    db.prepare('UPDATE projects SET agent_api_key_hash = ?, agent_api_key_prefix = ? WHERE id = ?')
      .run(hashAgentKey(apiKey), keyPrefix(apiKey), projectId);
  }
  return getProjectAgentPackageByProjectId(projectId);
}

export function generateProjectAgentKey(projectId) {
  const project = getById(projectId);
  if (!project) throw new Error('项目不存在');
  const apiKey = createProjectAgentKey(projectId);
  db.prepare(`
    UPDATE projects
    SET agent_api_key_hash = ?, agent_api_key_prefix = ?, agent_last_update_at = datetime('now')
    WHERE id = ?
  `).run(hashAgentKey(apiKey), keyPrefix(apiKey), projectId);
  return { apiKey, project: getProjectAgentPackageByProjectId(projectId).project };
}

export function updateProjectAgentConfig(projectId, fields = {}) {
  const project = getById(projectId);
  if (!project) throw new Error('项目不存在');
  if (fields.agentInstructions !== undefined || fields.agent_instructions !== undefined) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(fields.agentInstructions ?? fields.agent_instructions ?? '', projectId);
  }
  return getProjectAgentPackageByProjectId(projectId).project;
}

export function getProjectAgentPackageByProjectId(projectId) {
  const project = getById(projectId);
  if (!project) throw new Error('项目不存在');
  const tasks = taskService.listByProject(projectId).map((task) => taskService.ensureDefaultTaskAgentSetup(task.id).task);
  return {
    project,
    modules: project.modules || [],
    tasks,
    instructions: project.agent_instructions || buildDefaultProjectAgentInstructions(project),
  };
}

export function getProjectAgentPackageByKey(apiKey) {
  const apiKeyHash = hashAgentKey(String(apiKey || '').trim());
  const project = db.prepare('SELECT id FROM projects WHERE agent_api_key_hash = ?').get(apiKeyHash);
  if (!project) throw new Error('API Key 无效');
  return getProjectAgentPackageByProjectId(project.id);
}

export function createTasksFromAgent(apiKey, payload = {}) {
  const pkg = getProjectAgentPackageByKey(apiKey);
  const rows = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (rows.length === 0) throw new Error('请提供 tasks 数组');
  const created = taskService.createTasksFromDefs(pkg.project.id, rows);
  if (payload.publishNow ?? payload.publish_now ?? true) {
    taskService.publishAll(pkg.project.id);
  }
  db.prepare(`
    INSERT INTO project_agent_events (id, project_id, action, progress_note, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), pkg.project.id, 'create_tasks', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  return {
    created,
    package: getProjectAgentPackageByProjectId(pkg.project.id),
  };
}

function normalizeProjectModule(item, index) {
  if (typeof item === 'string') {
    const name = item.trim();
    return { moduleKey: taskService.makeModuleKey(name), moduleName: name, detail: '', sortOrder: index };
  }
  const name = String(item?.name || item?.moduleName || item?.module_name || item?.title || '').trim();
  const key = String(item?.key || item?.moduleKey || item?.module_key || taskService.makeModuleKey(name)).trim();
  return {
    moduleKey: taskService.makeModuleKey(key || name),
    moduleName: name || key || `一级菜单 ${index + 1}`,
    detail: String(item?.detail || item?.description || item?.summary || '').trim(),
    sortOrder: item?.sortOrder ?? item?.sort_order ?? index,
  };
}

export function updateModulesFromAgent(apiKey, payload = {}) {
  const pkg = getProjectAgentPackageByKey(apiKey);
  const rows = Array.isArray(payload.modules)
    ? payload.modules
    : Array.isArray(payload.menus)
      ? payload.menus
      : [];
  if (rows.length === 0) throw new Error('请提供 modules 数组');
  const modules = rows
    .map((item, index) => normalizeProjectModule(item, index))
    .filter((item) => item.moduleName);
  if (modules.length === 0) throw new Error('一级菜单内容为空');
  const uniqueModules = [];
  const seenModuleKeys = new Set();
  for (const module of modules) {
    if (seenModuleKeys.has(module.moduleKey)) continue;
    seenModuleKeys.add(module.moduleKey);
    uniqueModules.push(module);
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM project_modules WHERE project_id = ?').run(pkg.project.id);
    const insert = db.prepare(`
      INSERT INTO project_modules (id, project_id, module_key, module_name, detail, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    uniqueModules.forEach((item, index) => {
      insert.run(uuid(), pkg.project.id, item.moduleKey, item.moduleName, item.detail, item.sortOrder ?? index);
    });
    db.prepare(`
      UPDATE projects
      SET agent_last_update_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(pkg.project.id);
    db.prepare(`
      INSERT INTO project_agent_events (id, project_id, action, progress_note, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid(), pkg.project.id, 'update_modules', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  });
  tx();
  return getProjectAgentPackageByProjectId(pkg.project.id);
}

export function listModules(projectId) {
  return db.prepare(`
    SELECT module_key, module_name, detail, sort_order
    FROM project_modules
    WHERE project_id = ?
    ORDER BY sort_order, created_at
  `).all(projectId);
}

function normalizeTimelineItem(item, index) {
  if (Array.isArray(item)) {
    return [String(item[0] || `W${index + 1}`).trim(), String(item[1] || '').trim()];
  }
  if (item && typeof item === 'object') {
    const week = item.week || item.time || item.label || item.title || `W${index + 1}`;
    const detail = item.detail || item.plan || item.summary || item.goal || item.description || '';
    return [String(week).trim(), String(detail).trim()];
  }
  return [`W${index + 1}`, String(item || '').trim()];
}

export function updateTimelineFromAgent(apiKey, payload = {}) {
  const pkg = getProjectAgentPackageByKey(apiKey);
  const rows = Array.isArray(payload.timeline)
    ? payload.timeline
    : Array.isArray(payload.weeks)
      ? payload.weeks
      : [];
  if (rows.length === 0) throw new Error('请提供 timeline 数组');
  const timeline = rows
    .map((item, index) => normalizeTimelineItem(item, index))
    .filter(([week, detail]) => week || detail);
  if (timeline.length === 0) throw new Error('Timeline 内容为空');
  db.prepare(`
    UPDATE projects
    SET timeline_json = ?, agent_last_update_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(timeline), pkg.project.id);
  db.prepare(`
    INSERT INTO project_agent_events (id, project_id, action, progress_note, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), pkg.project.id, 'update_timeline', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  return getProjectAgentPackageByProjectId(pkg.project.id);
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
    db.prepare('DELETE FROM task_agent_events WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_agent_events WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_steps WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_schedule_items WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM agent_events WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_modules WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return [...files, ...subFiles];
  });
  const files = tx();
  for (const f of files) {
    try { unlinkSync(path.join(config.uploadsDir, path.basename(f.file_path))); } catch {}
  }
}
