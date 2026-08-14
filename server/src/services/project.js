import { v4 as uuid } from 'uuid';
import { unlinkSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as taskService from './task.js';
import * as feishuPushService from './feishuPush.js';

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
    project.progress = project.progress_override !== null && project.progress_override !== undefined
      ? Number(project.progress_override)
      : Math.round(progressStmt.get(project.id).p ?? 0);
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
    project.progress = project.progress_override !== null && project.progress_override !== undefined
      ? Number(project.progress_override)
      : Math.round(db.prepare('SELECT COALESCE(AVG(progress), 0) as p FROM tasks WHERE project_id = ? AND is_published = 1').get(id).p ?? 0);
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
    '你必须先基于项目计划书产出项目 Timeline，并调用项目 Agent API 回传。Timeline 按周组织，W1 表示第一周，W2 表示第二周；每周必须写清目标、关键动作、负责人/配合方和交付物。',
    '回传每个二级任务时请带 module 字段，module 应该等于某个一级菜单名称。每个二级任务要有标题、目标说明、周期和建议子任务。',
    '当总 PM 说“传到 PM Board”时，请调用项目 Agent API 回传一级菜单、Timeline 和二级任务。PM Board 会以你回传的内容为主视图。',
    '一级菜单和二级任务的负责人也可以由你操作。总 PM 说“认领/指派给谁”时，请调用 POST /api/agent/project/assignments。',
    '项目开始、项目整体进度、任务块状态和任务块进度也由你回传。总 PM 说“开始项目”“这块做完了”“更新进度到 PM Board”时，请调用 POST /api/agent/project/progress。',
    '推荐回传顺序：1）先 POST /api/agent/project/timeline 写入项目周计划；2）再 POST /api/agent/project/modules 写入一级菜单；3）POST /api/agent/project/tasks 写入一级菜单下的二级任务；4）POST /api/agent/project/progress 持续同步状态和进度。',
  ].filter(Boolean).join('\n');
}

export function ensureDefaultProjectAgentSetup(projectId) {
  const project = getById(projectId);
  if (!project) throw new Error('项目不存在');
  if (!project.agent_instructions) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(buildDefaultProjectAgentInstructions(project), projectId);
  } else if (!project.agent_instructions.includes('Timeline 是必填项') && !project.agent_instructions.includes('你必须先基于项目计划书产出项目 Timeline')) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(`${project.agent_instructions}\n\nTimeline 是必填项：你必须先基于项目计划书产出项目 Timeline，并调用 POST /api/agent/project/timeline 回传。Timeline 按周组织，W1 表示第一周，W2 表示第二周；每周必须写清目标、关键动作、负责人/配合方和交付物。推荐顺序：先回传 Timeline，再回传一级菜单，最后回传二级任务。`, projectId);
  }
  const refreshed = getById(projectId);
  if (refreshed.agent_instructions && !refreshed.agent_instructions.includes('/api/agent/project/progress')) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(`${refreshed.agent_instructions}\n\n项目进度回传：当总 PM 说“开始项目”“这块做完了”“更新进度到 PM Board”时，请调用 POST /api/agent/project/progress。你可以写入项目状态、项目整体进度、进度说明，也可以批量更新任务块状态和进度。`, projectId);
  }
  const withProgressDoc = getById(projectId);
  if (withProgressDoc.agent_instructions && !withProgressDoc.agent_instructions.includes('/api/agent/project/assignments')) {
    db.prepare('UPDATE projects SET agent_instructions = ? WHERE id = ?')
      .run(`${withProgressDoc.agent_instructions}\n\n负责人回传：当总 PM 说“认领这个模块”“指派给某个人”“这个二级任务归谁负责”时，请调用 POST /api/agent/project/assignments。你可以按 ownerId、ownerName 或 ownerEmail 在项目团队成员中匹配负责人。`, projectId);
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

function clampProgress(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('progress 必须是 0-100 的数字');
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeProjectStatus(status = '') {
  const value = String(status || '').trim();
  const map = {
    start: 'active',
    started: 'active',
    active: 'active',
    in_progress: 'active',
    '进行中': 'active',
    '已开始': 'active',
    draft: 'draft',
    pending: 'draft',
    '草稿': 'draft',
    '筹备中': 'draft',
    complete: 'completed',
    completed: 'completed',
    done: 'completed',
    '已完成': 'completed',
  };
  return map[value] || value;
}

function normalizeTaskStatus(status = '') {
  const value = String(status || '').trim();
  const map = {
    start: '进行中',
    started: '进行中',
    active: '进行中',
    in_progress: '进行中',
    '已开始': '进行中',
    '进行中': '进行中',
    pending: '待开始',
    draft: '待开始',
    todo: '待开始',
    '待开始': '待开始',
    submit: '审核中',
    submitted: '审核中',
    review: '审核中',
    '审核中': '审核中',
    complete: '已完成',
    completed: '已完成',
    done: '已完成',
    '已完成': '已完成',
  };
  return map[value] || value;
}

function findTaskForAgentUpdate(projectId, item = {}) {
  const id = item.taskId || item.task_id || item.id;
  if (id) {
    const task = taskService.getById(id);
    if (task?.project_id === projectId) return task;
  }
  const title = String(item.title || item.taskTitle || item.task_title || '').trim();
  if (title) {
    const task = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND title = ? ORDER BY sort_order, created_at LIMIT 1')
      .get(projectId, title);
    if (task) return task;
  }
  return null;
}

function resolveProjectMember(project, item = {}, fallbackUserId = '') {
  const ownerId = item.ownerId || item.owner_id || item.userId || item.user_id || item.assigneeId || item.assignee_id;
  if (ownerId) {
    if (ownerId === project.pm_user_id) return ownerId;
    const row = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(project.team_id, ownerId);
    if (row) return ownerId;
  }
  const ownerEmail = String(item.ownerEmail || item.owner_email || item.email || '').trim().toLowerCase();
  if (ownerEmail) {
    const row = db.prepare(`
      SELECT u.id
      FROM users u JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND lower(u.email) = ?
      LIMIT 1
    `).get(project.team_id, ownerEmail);
    if (row) return row.id;
  }
  const ownerName = String(item.ownerName || item.owner_name || item.userName || item.user_name || item.assigneeName || item.assignee_name || '').trim();
  if (ownerName) {
    const row = db.prepare(`
      SELECT u.id
      FROM users u JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND u.name = ?
      LIMIT 1
    `).get(project.team_id, ownerName);
    if (row) return row.id;
  }
  if (fallbackUserId) return fallbackUserId;
  return '';
}

function findModuleForAgentUpdate(projectId, item = {}) {
  const moduleKey = String(item.moduleKey || item.module_key || item.key || '').trim();
  if (moduleKey) {
    const module = ensureModuleRow(projectId, moduleKey);
    if (module) return module;
  }
  const moduleName = String(item.module || item.moduleName || item.module_name || item.name || item.title || '').trim();
  if (moduleName) {
    const key = taskService.makeModuleKey(moduleName);
    const byKey = ensureModuleRow(projectId, key);
    if (byKey) return byKey;
    return db.prepare('SELECT * FROM project_modules WHERE project_id = ? AND module_name = ? LIMIT 1')
      .get(projectId, moduleName);
  }
  return null;
}

function shouldClearOwner(item = {}) {
  const action = String(item.action || '').trim().toLowerCase();
  return action === 'unclaim' || action === 'clear' || action === 'remove_owner' || item.clearOwner || item.clear_owner;
}

export async function updateProjectAssignmentsFromAgent(apiKey, payload = {}) {
  const pkg = getProjectAgentPackageByKey(apiKey);
  const project = pkg.project;
  const moduleUpdates = Array.isArray(payload.moduleUpdates)
    ? payload.moduleUpdates
    : Array.isArray(payload.module_updates)
      ? payload.module_updates
      : [];
  const taskUpdates = Array.isArray(payload.taskUpdates)
    ? payload.taskUpdates
    : Array.isArray(payload.task_updates)
      ? payload.task_updates
      : [];
  const updatedModules = [];
  const updatedTasks = [];

  for (const item of moduleUpdates) {
    const module = findModuleForAgentUpdate(project.id, item);
    if (!module) continue;
    if (shouldClearOwner(item)) {
      db.prepare(`
        UPDATE project_modules
        SET owner_id = NULL, owner_assigned_by = ?, owner_assigned_at = datetime('now'), updated_at = datetime('now')
        WHERE project_id = ? AND module_key = ?
      `).run(project.pm_user_id, project.id, module.module_key);
      updatedModules.push(module.module_key);
      continue;
    }
    const ownerId = resolveProjectMember(project, item, project.pm_user_id);
    if (!ownerId) continue;
    await assignModule(project.id, module.module_key, ownerId, project.pm_user_id);
    updatedModules.push(module.module_key);
  }

  for (const item of taskUpdates) {
    const task = findTaskForAgentUpdate(project.id, item);
    if (!task) continue;
    if (shouldClearOwner(item)) {
      taskService.unclaim(task.id);
      updatedTasks.push(task.id);
      continue;
    }
    const ownerId = resolveProjectMember(project, item, project.pm_user_id);
    if (!ownerId) continue;
    const updated = taskService.assign(task.id, ownerId, normalizeTaskStatus(item.status || '进行中'));
    try {
      const assignedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(project.pm_user_id);
      await feishuPushService.sendTaskAssignmentCard({
        openId: ownerId,
        projectName: project.name,
        taskTitle: updated.title,
        taskSummary: updated.summary,
        assignedByName: assignedBy?.name || '',
        actionText: '你被指派为二级任务负责人',
        boardUrl: `${config.clientUrl}/projects/${project.id}/tasks/${updated.id}`,
      });
    } catch (err) {
      console.error('[project-agent] Feishu task owner notification failed:', err.userMessage || err.message);
    }
    updatedTasks.push(task.id);
  }

  db.prepare(`
    INSERT INTO project_agent_events (id, project_id, action, progress_note, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), project.id, 'update_assignments', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  return {
    updatedModules,
    updatedTaskIds: updatedTasks,
    package: getProjectAgentPackageByProjectId(project.id),
  };
}

export function updateProjectProgressFromAgent(apiKey, payload = {}) {
  const pkg = getProjectAgentPackageByKey(apiKey);
  const projectPatch = [];
  const projectValues = [];
  const status = normalizeProjectStatus(payload.status || payload.projectStatus || payload.project_status || '');
  if (status) {
    projectPatch.push('status = ?');
    projectValues.push(status);
  }
  const progress = clampProgress(payload.progress ?? payload.projectProgress ?? payload.project_progress);
  if (progress !== null) {
    projectPatch.push('progress_override = ?');
    projectValues.push(progress);
  }
  if (payload.clearProgressOverride || payload.clear_progress_override) {
    projectPatch.push('progress_override = NULL');
  }
  const progressNote = payload.progressNote ?? payload.progress_note ?? payload.note ?? '';
  if (progressNote !== '') {
    projectPatch.push('agent_progress_note = ?');
    projectValues.push(progressNote);
  }

  const taskUpdates = Array.isArray(payload.taskUpdates)
    ? payload.taskUpdates
    : Array.isArray(payload.task_updates)
      ? payload.task_updates
      : [];
  const updatedTasks = [];
  const tx = db.transaction(() => {
    if (projectPatch.length) {
      projectPatch.push("agent_last_update_at = datetime('now')");
      projectPatch.push("updated_at = datetime('now')");
      projectValues.push(pkg.project.id);
      db.prepare(`UPDATE projects SET ${projectPatch.join(', ')} WHERE id = ?`).run(...projectValues);
    }
    for (const item of taskUpdates) {
      const task = findTaskForAgentUpdate(pkg.project.id, item);
      if (!task) continue;
      const patch = {};
      const itemStatus = normalizeTaskStatus(item.status || '');
      if (itemStatus) patch.status = itemStatus;
      const itemProgress = clampProgress(item.progress);
      if (itemProgress !== null) patch.progress = itemProgress;
      if (item.summary !== undefined) patch.summary = item.summary;
      if (item.docUrl !== undefined || item.doc_url !== undefined) patch.doc_url = item.docUrl ?? item.doc_url;
      if (item.idea !== undefined || item.ideaText !== undefined || item.idea_text !== undefined) patch.idea_text = item.idea ?? item.ideaText ?? item.idea_text;
      if (item.executionPlan !== undefined || item.execution_plan !== undefined) patch.execution_plan = item.executionPlan ?? item.execution_plan;
      if (item.resourcePlan !== undefined || item.resource_plan !== undefined) patch.resource_plan = item.resourcePlan ?? item.resource_plan;
      if (Object.keys(patch).length) taskService.update(task.id, patch);
      if (item.progressNote !== undefined || item.progress_note !== undefined || item.note !== undefined) {
        db.prepare('UPDATE tasks SET agent_progress_note = ?, agent_last_update_at = datetime(\'now\') WHERE id = ?')
          .run(item.progressNote ?? item.progress_note ?? item.note ?? '', task.id);
      }
      updatedTasks.push(task.id);
    }
    db.prepare(`
      INSERT INTO project_agent_events (id, project_id, action, progress_note, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid(), pkg.project.id, 'update_progress', progressNote || '', JSON.stringify(payload));
  });
  tx();
  return {
    updatedTaskIds: updatedTasks,
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
    const existing = db.prepare('SELECT module_key, owner_id, owner_assigned_by, owner_assigned_at FROM project_modules WHERE project_id = ?')
      .all(pkg.project.id)
      .reduce((acc, row) => {
        acc[row.module_key] = row;
        return acc;
      }, {});
    db.prepare('DELETE FROM project_modules WHERE project_id = ?').run(pkg.project.id);
    const insert = db.prepare(`
      INSERT INTO project_modules (id, project_id, module_key, module_name, detail, owner_id, owner_assigned_by, owner_assigned_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    uniqueModules.forEach((item, index) => {
      const old = existing[item.moduleKey] || {};
      insert.run(
        uuid(),
        pkg.project.id,
        item.moduleKey,
        item.moduleName,
        item.detail,
        old.owner_id || null,
        old.owner_assigned_by || null,
        old.owner_assigned_at || null,
        item.sortOrder ?? index
      );
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
    SELECT
      pm.module_key,
      pm.module_name,
      pm.detail,
      pm.owner_id,
      pm.owner_assigned_by,
      pm.owner_assigned_at,
      pm.sort_order,
      u.name as owner_name,
      u.avatar_url as owner_avatar,
      au.name as owner_assigned_by_name
    FROM project_modules pm
    LEFT JOIN users u ON u.id = pm.owner_id
    LEFT JOIN users au ON au.id = pm.owner_assigned_by
    WHERE project_id = ?
    ORDER BY pm.sort_order, pm.created_at
  `).all(projectId);
}

function getModule(projectId, moduleKey) {
  return db.prepare(`
    SELECT
      pm.*,
      p.name as project_name,
      p.pm_user_id,
      u.name as owner_name,
      u.avatar_url as owner_avatar
    FROM project_modules pm
    JOIN projects p ON p.id = pm.project_id
    LEFT JOIN users u ON u.id = pm.owner_id
    WHERE pm.project_id = ? AND pm.module_key = ?
  `).get(projectId, moduleKey);
}

function ensureModuleRow(projectId, moduleKey) {
  const existing = getModule(projectId, moduleKey);
  if (existing) return existing;
  const taskModule = db.prepare(`
    SELECT module_key, module_name
    FROM tasks
    WHERE project_id = ? AND module_key = ?
    ORDER BY sort_order, created_at
    LIMIT 1
  `).get(projectId, moduleKey);
  if (!taskModule) return null;
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as sort_order FROM project_modules WHERE project_id = ?')
    .get(projectId);
  db.prepare(`
    INSERT INTO project_modules (id, project_id, module_key, module_name, detail, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), projectId, taskModule.module_key, taskModule.module_name || taskModule.module_key, '', Number(maxSort?.sort_order ?? -1) + 1);
  return getModule(projectId, moduleKey);
}

async function notifyModuleOwner({ projectId, moduleKey, assignedById, actionText }) {
  const module = getModule(projectId, moduleKey);
  if (!module?.owner_id) return;
  const assignedBy = assignedById
    ? db.prepare('SELECT name FROM users WHERE id = ?').get(assignedById)
    : null;
  try {
    await feishuPushService.sendModuleAssignmentCard({
      openId: module.owner_id,
      projectName: module.project_name,
      moduleName: module.module_name,
      moduleDetail: module.detail,
      assignedByName: assignedBy?.name || '',
      actionText,
      boardUrl: `${config.clientUrl}/projects/${projectId}/pool`,
    });
  } catch (err) {
    console.error('[project-module] Feishu owner notification failed:', err.userMessage || err.message);
  }
}

export async function claimModule(projectId, moduleKey, userId) {
  const module = ensureModuleRow(projectId, moduleKey);
  if (!module) throw new Error('一级菜单不存在');
  if (module.owner_id && module.owner_id !== userId) throw new Error(`该一级菜单已由 ${module.owner_name || '其他成员'} 负责`);
  db.prepare(`
    UPDATE project_modules
    SET owner_id = ?, owner_assigned_by = ?, owner_assigned_at = datetime('now'), updated_at = datetime('now')
    WHERE project_id = ? AND module_key = ?
  `).run(userId, userId, projectId, moduleKey);
  await notifyModuleOwner({ projectId, moduleKey, assignedById: userId, actionText: '你已认领一级菜单' });
  return getById(projectId);
}

export async function assignModule(projectId, moduleKey, ownerId, assignedById) {
  const module = ensureModuleRow(projectId, moduleKey);
  if (!module) throw new Error('一级菜单不存在');
  const project = db.prepare('SELECT team_id FROM projects WHERE id = ?').get(projectId);
  const member = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(project.team_id, ownerId);
  if (!member && ownerId !== module.pm_user_id) throw new Error('只能指派给当前团队成员');
  db.prepare(`
    UPDATE project_modules
    SET owner_id = ?, owner_assigned_by = ?, owner_assigned_at = datetime('now'), updated_at = datetime('now')
    WHERE project_id = ? AND module_key = ?
  `).run(ownerId, assignedById, projectId, moduleKey);
  await notifyModuleOwner({ projectId, moduleKey, assignedById, actionText: '你被指派为一级菜单 PM' });
  return getById(projectId);
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
