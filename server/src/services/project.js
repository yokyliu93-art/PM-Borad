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
    '你需要把项目计划拆成可被成员认领的任务块。每个任务块要有标题、目标说明、周期和建议子任务。',
    '当总 PM 说“传到 PM Board”时，请调用项目 Agent API 创建任务块并发布到任务大厅。',
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
    db.prepare('DELETE FROM subtask_steps WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM subtask_schedule_items WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM agent_events WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
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
