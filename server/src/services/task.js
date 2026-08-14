import { v4 as uuid } from 'uuid';
import { unlinkSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/connection.js';
import { config } from '../config.js';

export function makeModuleKey(input = '') {
  const source = String(input || '').trim();
  const ascii = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii.slice(0, 48);
  let hash = 0;
  for (const ch of source || '主模块') hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return `module-${Math.abs(hash).toString(36)}`;
}

export function normalizeModule(input = '', fallbackText = '') {
  const name = String(input || fallbackText || '主模块').trim() || '主模块';
  return { moduleKey: makeModuleKey(name), moduleName: name };
}

function unlinkAttachmentFiles(files) {
  for (const f of files) {
    try { unlinkSync(path.join(config.uploadsDir, path.basename(f.file_path))); } catch {}
  }
}

export function create({ projectId, title, summary, cycle, docUrl, sortOrder, publish = false, ideaText = '', executionPlan = '', resourcePlan = '', module = '', moduleKey = '', moduleName = '' }) {
  const id = uuid();
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM tasks WHERE project_id = ?').get(projectId);
  const order = sortOrder ?? (maxSort?.m ?? -1) + 1;
  const normalizedModule = normalizeModule(module || moduleName || moduleKey, `${title || ''} ${summary || ''}`);
  db.prepare(`
    INSERT INTO tasks (id, project_id, module_key, module_name, title, summary, cycle, doc_url, status, sort_order, is_published, idea_text, execution_plan, resource_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, normalizedModule.moduleKey, normalizedModule.moduleName, title, summary || '', cycle || '', docUrl || '', '待开始', order, publish ? 1 : 0, ideaText || '', executionPlan || '', resourcePlan || '');
  ensureDefaultTaskAgentSetup(id);
  return getById(id);
}

// Materialize a list of task definitions [{ title, summary, cycle, default_doc_url, subtasks: [{ title, note }] }]
// into tasks + subtasks. Shared by template splitting and AI splitting.
export function createTasksFromDefs(projectId, taskDefs) {
  const created = [];
  const insertSub = db.prepare(
    'INSERT INTO subtasks (id, task_id, title, note, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const insertStep = db.prepare(`
    INSERT INTO subtask_steps (id, subtask_id, task_id, title, due_text, delivery_doc_url, reminder_frequency, reminder_enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < taskDefs.length; i++) {
    const def = taskDefs[i];
    const task = create({
      projectId,
      title: def.title,
      summary: def.summary || '',
      cycle: def.cycle || '',
      docUrl: def.default_doc_url || '',
      sortOrder: i,
      module: def.module || def.moduleName || def.module_name || def.moduleKey || def.module_key || '',
      ideaText: def.idea || def.ideaText || def.idea_text || '',
      executionPlan: def.executionPlan || def.execution_plan || '',
      resourcePlan: def.resourcePlan || def.resource_plan || '',
    });
    if (Array.isArray(def.subtasks)) {
      def.subtasks.forEach((s, j) => {
        const subtaskId = uuid();
        insertSub.run(subtaskId, task.id, s.title || '', s.note || '', j);
        const steps = Array.isArray(s.steps) && s.steps.length
          ? s.steps
          : [
              { title: `明确「${s.title || '子任务'}」的输出标准` },
              { title: '推进执行并同步进展' },
              { title: '整理飞书文档并提交确认' },
            ];
        steps.forEach((step, k) => {
          insertStep.run(
            uuid(),
            subtaskId,
            task.id,
            step.title || '',
            step.dueText || step.due_text || '',
            step.deliveryDocUrl || step.delivery_doc_url || '',
            step.reminderFrequency || step.reminder_frequency || 'none',
            step.reminderEnabled || step.reminder_enabled ? 1 : 0,
            k
          );
        });
        ensureDefaultAgentSetup(task.id, subtaskId);
      });
    }
    created.push(task);
  }
  return created;
}

export function getById(id) {
  return db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.id = ?
  `).get(id);
}

export function listByProject(projectId) {
  return db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.project_id = ?
    ORDER BY t.sort_order ASC, t.created_at ASC
  `).all(projectId);
}

export function listPublished(projectId) {
  return db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.project_id = ? AND t.is_published = 1
    ORDER BY t.sort_order ASC, t.created_at ASC
  `).all(projectId);
}

export function update(id, fields) {
  if (fields.module !== undefined || fields.moduleName !== undefined || fields.module_name !== undefined || fields.moduleKey !== undefined || fields.module_key !== undefined) {
    const normalizedModule = normalizeModule(
      fields.module ?? fields.moduleName ?? fields.module_name ?? fields.moduleKey ?? fields.module_key ?? ''
    );
    fields.module_key = normalizedModule.moduleKey;
    fields.module_name = normalizedModule.moduleName;
  }
  const allowed = ['title', 'summary', 'cycle', 'doc_url', 'progress', 'status', 'sort_order', 'is_published', 'module_key', 'module_name', 'idea_text', 'execution_plan', 'resource_plan', 'ai_detail_json', 'agent_instructions'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return getById(id);
  // Status changes drive progress: 已完成 -> 100, anything else -> recompute from subtasks.
  if (fields.status !== undefined) {
    if (fields.status === '已完成') {
      sets.push('progress = 100');
    } else if (fields.progress === undefined) {
      sets.push('progress = ?');
      values.push(subtaskProgress(id));
    }
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

// Percentage of a task's subtasks that are done (已完成 + 已提交) (0 if none).
// 已提交 counts toward progress so clicking submit immediately moves task/project progress.
export function subtaskProgress(taskId) {
  const rows = db.prepare('SELECT status FROM subtasks WHERE task_id = ?').all(taskId);
  if (rows.length === 0) return 0;
  const done = rows.filter((r) => r.status === '已完成' || r.status === '已提交').length;
  return Math.round((done / rows.length) * 100);
}

export function recomputeProgress(taskId) {
  db.prepare('UPDATE tasks SET progress = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(subtaskProgress(taskId), taskId);
  return getById(taskId);
}

export function getSubtask(subtaskId) {
  return db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar, su.name as submitted_by_name
    FROM subtasks s
    LEFT JOIN users u ON s.assignee_id = u.id
    LEFT JOIN users su ON s.submitted_by = su.id
    WHERE s.id = ?
  `).get(subtaskId);
}

// Anyone submits a subtask -> 已提交 (awaits project PM confirmation), storing the completion description.
export function submitSubtask(taskId, subtaskId, userId, { description = '', docUrl = '' } = {}) {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!sub) throw new Error('子任务不存在');
  if (sub.status === '已完成') throw new Error('子任务已完成，无需重复提交');
  if (sub.status === '已提交') throw new Error('子任务已提交，等待PM确认');
  if (!docUrl) throw new Error('请填写飞书文档链接作为交付物');
  db.prepare(`
    UPDATE subtasks
    SET status = '已提交',
        submission_description = ?,
        delivery_doc_url = ?,
        submitted_by = ?,
        submitted_at = datetime('now')
    WHERE id = ?
  `).run(description || '', docUrl || '', userId || null, subtaskId);
  recomputeProgress(taskId);
  return getSubtask(subtaskId);
}

// Task PM confirms a submitted subtask -> 已完成.
export function confirmSubtask(taskId, subtaskId) {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!sub) throw new Error('子任务不存在');
  if (sub.status !== '已提交') throw new Error('子任务不在已提交状态');
  db.prepare("UPDATE subtasks SET status = '已完成' WHERE id = ?").run(subtaskId);
  recomputeProgress(taskId);
  return getSubtask(subtaskId);
}

// --- Subtask attachments (submission deliverables) ---

export function getSubtaskAttachments(subtaskId) {
  return db.prepare(`
    SELECT a.*, u.name as uploaded_by_name
    FROM subtask_attachments a LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.subtask_id = ? ORDER BY a.created_at
  `).all(subtaskId);
}

// Attach each subtask's attachment list so detail/list payloads carry submissions.
export function attachSubtaskPayloads(subtasks) {
  for (const s of subtasks) {
    s.attachments = getSubtaskAttachments(s.id);
    s.steps = getSubtaskSteps(s.id);
    s.schedule = getSubtaskSchedule(s.id);
    s.agent_events = getAgentEvents(s.id);
  }
  return subtasks;
}

export function getSubtaskSteps(subtaskId) {
  return db.prepare(`
    SELECT * FROM subtask_steps
    WHERE subtask_id = ?
    ORDER BY sort_order, created_at
  `).all(subtaskId);
}

export function replaceSubtaskSteps(taskId, subtaskId, steps) {
  const sub = db.prepare('SELECT id FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!sub) throw new Error('子任务不存在');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM subtask_steps WHERE subtask_id = ?').run(subtaskId);
    const insert = db.prepare(`
      INSERT INTO subtask_steps (id, subtask_id, task_id, title, status, due_text, delivery_doc_url, reminder_frequency, reminder_enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    steps.forEach((step, index) => {
      const title = String(step.title || '').trim();
      if (!title) return;
      insert.run(
        uuid(),
        subtaskId,
        taskId,
        title,
        step.status || '待开始',
        step.dueText || step.due_text || '',
        step.deliveryDocUrl || step.delivery_doc_url || '',
        step.reminderFrequency || step.reminder_frequency || 'none',
        step.reminderEnabled || step.reminder_enabled ? 1 : 0,
        step.sortOrder ?? step.sort_order ?? index
      );
    });
  });
  tx();
  return getSubtaskSteps(subtaskId);
}

export function getSubtaskSchedule(subtaskId) {
  return db.prepare(`
    SELECT * FROM subtask_schedule_items
    WHERE subtask_id = ?
    ORDER BY sort_order, week_index, created_at
  `).all(subtaskId);
}

export function replaceSubtaskSchedule(taskId, subtaskId, schedule = []) {
  const sub = db.prepare('SELECT id FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!sub) throw new Error('子任务不存在');
  const rows = Array.isArray(schedule) ? schedule : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM subtask_schedule_items WHERE subtask_id = ?').run(subtaskId);
    const insert = db.prepare(`
      INSERT INTO subtask_schedule_items (
        id, subtask_id, task_id, week_index, goal, reminder_day, reminder_time,
        delivery_doc_url, status, reminder_enabled, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((item, index) => {
      const goal = String(item.goal || '').trim();
      if (!goal) return;
      insert.run(
        uuid(),
        subtaskId,
        taskId,
        Number(item.weekIndex ?? item.week_index ?? index + 1) || index + 1,
        goal,
        clampReminderDay(item.reminderDay ?? item.reminder_day),
        normalizeReminderTime(item.reminderTime ?? item.reminder_time),
        item.deliveryDocUrl || item.delivery_doc_url || '',
        item.status || '未开始',
        item.reminderEnabled ?? item.reminder_enabled ?? true ? 1 : 0,
        item.sortOrder ?? item.sort_order ?? index
      );
    });
  });
  tx();
  return getSubtaskSchedule(subtaskId);
}

export function getAgentEvents(subtaskId) {
  return db.prepare(`
    SELECT * FROM agent_events
    WHERE subtask_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(subtaskId);
}

function hashAgentKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function createAgentKey(subtaskId) {
  const secret = crypto.randomBytes(24).toString('base64url');
  return `pmb_sub_${subtaskId.slice(0, 8)}_${secret}`;
}

function createTaskAgentKey(taskId) {
  const secret = crypto.randomBytes(24).toString('base64url');
  return `pmb_task_${taskId.slice(0, 8)}_${secret}`;
}

function keyPrefix(apiKey) {
  return `${apiKey.slice(0, 18)}...`;
}

function clampReminderDay(day) {
  const value = Number(day);
  if (!Number.isFinite(value)) return 1;
  return Math.min(7, Math.max(1, Math.round(value)));
}

function normalizeReminderTime(time) {
  const value = String(time || '').trim();
  return /^\d{2}:\d{2}$/.test(value) ? value : '10:00';
}

export function buildDefaultAgentInstructions({ task, subtask }) {
  return [
    `你是 PM Board 中「${subtask.title}」这个子任务的执行 Agent。`,
    `所属总任务：${task.title}。`,
    task.summary ? `总任务背景：${task.summary}` : '',
    subtask.note ? `子任务备注：${subtask.note}` : '',
    subtask.idea_text ? `想法：${subtask.idea_text}` : '',
    subtask.execution_plan ? `执行方案：${subtask.execution_plan}` : '',
    subtask.resource_plan ? `资源配合：${subtask.resource_plan}` : '',
    '你需要按周计划推进工作，定期回写进度；如果有阶段性交付，请提交飞书文档链接。',
    '回写进度时请说明：本周完成了什么、遇到什么阻塞、下一步做什么、交付文档在哪里。',
  ].filter(Boolean).join('\n');
}

export function buildDefaultTaskAgentInstructions({ project, task }) {
  return [
    `你是 PM Board 中「${task.title}」这块任务的子 PM Agent。`,
    `所属项目：${project.name}。`,
    task.summary ? `任务目标：${task.summary}` : '',
    task.idea_text ? `想法：${task.idea_text}` : '',
    task.execution_plan ? `执行方案：${task.execution_plan}` : '',
    task.resource_plan ? `资源配合：${task.resource_plan}` : '',
    task.cycle ? `周期：${task.cycle}` : '',
    '你的权限边界：只能管理这块任务，不能改整个项目，也不能改其他子 PM 的任务块。',
    '你需要把这块任务继续拆成可执行子任务，给每个子任务生成说明书、周计划和交付要求。',
    '当负责人说“传到 PM Board”时，请调用任务块 Agent API 创建或更新子任务，并回写当前进度。',
  ].filter(Boolean).join('\n');
}

export function ensureDefaultTaskAgentSetup(taskId) {
  const task = getById(taskId);
  if (!task) throw new Error('任务不存在');
  const project = db.prepare('SELECT id, name, description, plan_markdown, timeline_json FROM projects WHERE id = ?').get(task.project_id);
  if (!task.agent_instructions) {
    db.prepare('UPDATE tasks SET agent_instructions = ? WHERE id = ?')
      .run(buildDefaultTaskAgentInstructions({ project, task }), taskId);
  }
  if (!task.agent_api_key_hash) {
    const apiKey = createTaskAgentKey(taskId);
    db.prepare('UPDATE tasks SET agent_api_key_hash = ?, agent_api_key_prefix = ? WHERE id = ?')
      .run(hashAgentKey(apiKey), keyPrefix(apiKey), taskId);
  }
  return getTaskAgentPackageByTaskId(taskId);
}

export function generateTaskAgentKey(taskId) {
  const task = getById(taskId);
  if (!task) throw new Error('任务不存在');
  const apiKey = createTaskAgentKey(taskId);
  db.prepare(`
    UPDATE tasks
    SET agent_api_key_hash = ?, agent_api_key_prefix = ?, agent_last_update_at = datetime('now')
    WHERE id = ?
  `).run(hashAgentKey(apiKey), keyPrefix(apiKey), taskId);
  return { apiKey, task: getTaskAgentPackageByTaskId(taskId).task };
}

export function updateTaskAgentConfig(taskId, fields = {}) {
  const task = getById(taskId);
  if (!task) throw new Error('任务不存在');
  if (fields.agentInstructions !== undefined || fields.agent_instructions !== undefined) {
    db.prepare('UPDATE tasks SET agent_instructions = ? WHERE id = ?')
      .run(fields.agentInstructions ?? fields.agent_instructions ?? '', taskId);
  }
  return getTaskAgentPackageByTaskId(taskId).task;
}

export function getTaskAgentPackageByTaskId(taskId) {
  const task = getById(taskId);
  if (!task) throw new Error('任务不存在');
  const project = db.prepare('SELECT id, name, description, plan_markdown, timeline_json, status FROM projects WHERE id = ?').get(task.project_id);
  const subtasks = attachSubtaskPayloads(db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar, su.name as submitted_by_name
    FROM subtasks s
    LEFT JOIN users u ON s.assignee_id = u.id
    LEFT JOIN users su ON s.submitted_by = su.id
    WHERE s.task_id = ?
    ORDER BY s.sort_order, s.created_at
  `).all(task.id));
  return {
    project,
    task: { ...task, subtasks },
    instructions: task.agent_instructions || buildDefaultTaskAgentInstructions({ project, task }),
  };
}

export function getTaskAgentPackageByKey(apiKey) {
  const apiKeyHash = hashAgentKey(String(apiKey || '').trim());
  const task = db.prepare('SELECT id FROM tasks WHERE agent_api_key_hash = ?').get(apiKeyHash);
  if (!task) throw new Error('API Key 无效');
  return getTaskAgentPackageByTaskId(task.id);
}

export function createSubtasksFromAgent(apiKey, payload = {}) {
  const pkg = getTaskAgentPackageByKey(apiKey);
  const rows = Array.isArray(payload.subtasks) ? payload.subtasks : [];
  if (rows.length === 0) throw new Error('请提供 subtasks 数组');
  const taskId = pkg.task.id;
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM subtasks WHERE task_id = ?').get(taskId);
  let sortOrder = (maxSort?.m ?? -1) + 1;
  const insertSub = db.prepare('INSERT INTO subtasks (id, task_id, title, assignee_id, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const created = [];
  const tx = db.transaction(() => {
    for (const item of rows) {
      const title = String(item.title || '').trim();
      if (!title) continue;
      const id = uuid();
      insertSub.run(id, taskId, title, item.assigneeId || item.assignee_id || null, item.note || '', sortOrder++);
      const detailPatch = [];
      const detailValues = [];
      if (item.idea || item.ideaText || item.idea_text) {
        detailPatch.push('idea_text = ?');
        detailValues.push(item.idea || item.ideaText || item.idea_text);
      }
      if (item.executionPlan || item.execution_plan) {
        detailPatch.push('execution_plan = ?');
        detailValues.push(item.executionPlan || item.execution_plan);
      }
      if (item.resourcePlan || item.resource_plan) {
        detailPatch.push('resource_plan = ?');
        detailValues.push(item.resourcePlan || item.resource_plan);
      }
      if (detailPatch.length) {
        detailValues.push(id);
        db.prepare(`UPDATE subtasks SET ${detailPatch.join(', ')} WHERE id = ?`).run(...detailValues);
      }
      replaceSubtaskSteps(taskId, id, Array.isArray(item.steps) && item.steps.length ? item.steps : [
        { title: `明确「${title}」的输出标准` },
        { title: '推进执行并同步进展' },
        { title: '整理飞书文档并提交确认' },
      ]);
      if (Array.isArray(item.schedule)) replaceSubtaskSchedule(taskId, id, item.schedule);
      ensureDefaultAgentSetup(taskId, id);
      created.push(id);
    }
    db.prepare(`
      INSERT INTO task_agent_events (id, task_id, project_id, action, progress_note, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid(), taskId, pkg.project.id, 'create_subtasks', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  });
  tx();
  recomputeProgress(taskId);
  return {
    created: attachSubtaskPayloads(created.map((id) => getSubtask(id))),
    package: getTaskAgentPackageByTaskId(taskId),
  };
}

export function updateTaskFromAgent(apiKey, payload = {}) {
  const pkg = getTaskAgentPackageByKey(apiKey);
  const patch = {};
  if (payload.status) patch.status = payload.status;
  if (payload.progress !== undefined) patch.progress = Number(payload.progress);
  if (payload.summary !== undefined) patch.summary = payload.summary;
  if (payload.idea !== undefined || payload.ideaText !== undefined || payload.idea_text !== undefined) patch.idea_text = payload.idea ?? payload.ideaText ?? payload.idea_text;
  if (payload.executionPlan !== undefined || payload.execution_plan !== undefined) patch.execution_plan = payload.executionPlan ?? payload.execution_plan;
  if (payload.resourcePlan !== undefined || payload.resource_plan !== undefined) patch.resource_plan = payload.resourcePlan ?? payload.resource_plan;
  if (payload.aiDetail !== undefined || payload.ai_detail_json !== undefined) patch.ai_detail_json = JSON.stringify(payload.aiDetail ?? payload.ai_detail_json ?? {});
  if (payload.docUrl !== undefined || payload.doc_url !== undefined) patch.doc_url = payload.docUrl ?? payload.doc_url;
  if (Object.keys(patch).length) update(pkg.task.id, patch);
  if (payload.progressNote !== undefined || payload.progress_note !== undefined) {
    db.prepare('UPDATE tasks SET agent_progress_note = ?, agent_last_update_at = datetime(\'now\') WHERE id = ?')
      .run(payload.progressNote ?? payload.progress_note ?? '', pkg.task.id);
  }
  db.prepare(`
    INSERT INTO task_agent_events (id, task_id, project_id, action, progress_note, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), pkg.task.id, pkg.project.id, 'update_progress', payload.progressNote || payload.progress_note || '', JSON.stringify(payload));
  return getTaskAgentPackageByTaskId(pkg.task.id);
}

export function ensureDefaultAgentSetup(taskId, subtaskId) {
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  const task = getById(taskId);
  if (!subtask || !task) throw new Error('子任务不存在');
  if (!subtask.agent_instructions) {
    db.prepare('UPDATE subtasks SET agent_instructions = ? WHERE id = ?')
      .run(buildDefaultAgentInstructions({ task, subtask }), subtaskId);
  }
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM subtask_schedule_items WHERE subtask_id = ?').get(subtaskId)?.count || 0;
  if (scheduleCount === 0) {
    replaceSubtaskSchedule(taskId, subtaskId, [{
      weekIndex: 1,
      goal: `完成「${subtask.title}」的输出标准确认与第一轮推进`,
      reminderDay: 1,
      reminderTime: '10:00',
      status: '未开始',
      reminderEnabled: true,
    }]);
  }
  if (!subtask.agent_api_key_hash) {
    const apiKey = createAgentKey(subtaskId);
    db.prepare('UPDATE subtasks SET agent_api_key_hash = ?, agent_api_key_prefix = ? WHERE id = ?')
      .run(hashAgentKey(apiKey), keyPrefix(apiKey), subtaskId);
  }
  return attachSubtaskPayloads([getSubtask(subtaskId)])[0];
}

export function generateSubtaskAgentKey(taskId, subtaskId) {
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!subtask) throw new Error('子任务不存在');
  const apiKey = createAgentKey(subtaskId);
  db.prepare(`
    UPDATE subtasks
    SET agent_api_key_hash = ?, agent_api_key_prefix = ?, agent_last_update_at = datetime('now')
    WHERE id = ?
  `).run(hashAgentKey(apiKey), keyPrefix(apiKey), subtaskId);
  return { apiKey, subtask: attachSubtaskPayloads([getSubtask(subtaskId)])[0] };
}

export function updateSubtaskAgentConfig(taskId, subtaskId, fields = {}) {
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(subtaskId, taskId);
  if (!subtask) throw new Error('子任务不存在');
  const sets = [];
  const values = [];
  if (fields.agentInstructions !== undefined || fields.agent_instructions !== undefined) {
    sets.push('agent_instructions = ?');
    values.push(fields.agentInstructions ?? fields.agent_instructions ?? '');
  }
  if (fields.feishuPushEnabled !== undefined || fields.feishu_push_enabled !== undefined) {
    sets.push('feishu_push_enabled = ?');
    values.push(fields.feishuPushEnabled ?? fields.feishu_push_enabled ? 1 : 0);
  }
  if (fields.feishuChatId !== undefined || fields.feishu_chat_id !== undefined) {
    sets.push('feishu_chat_id = ?');
    values.push(fields.feishuChatId ?? fields.feishu_chat_id ?? '');
  }
  if (sets.length) {
    values.push(subtaskId);
    db.prepare(`UPDATE subtasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
  if (Array.isArray(fields.schedule)) {
    replaceSubtaskSchedule(taskId, subtaskId, fields.schedule);
  }
  return attachSubtaskPayloads([getSubtask(subtaskId)])[0];
}

export function getAgentPackageByKey(apiKey) {
  const apiKeyHash = hashAgentKey(String(apiKey || '').trim());
  const subtask = db.prepare('SELECT * FROM subtasks WHERE agent_api_key_hash = ?').get(apiKeyHash);
  if (!subtask) throw new Error('API Key 无效');
  const task = getById(subtask.task_id);
  const project = db.prepare('SELECT id, name, description, plan_markdown, timeline_json, status FROM projects WHERE id = ?').get(task.project_id);
  const hydrated = attachSubtaskPayloads([getSubtask(subtask.id)])[0];
  return {
    project,
    task,
    subtask: hydrated,
    instructions: hydrated.agent_instructions || buildDefaultAgentInstructions({ task, subtask: hydrated }),
  };
}

export function updateSubtaskFromAgent(apiKey, payload = {}) {
  const pkg = getAgentPackageByKey(apiKey);
  const { task, subtask } = pkg;
  const status = payload.status ? String(payload.status).trim() : '';
  const allowedStatuses = new Set(['待开始', '进行中', '已提交', '已完成']);
  const fields = [];
  const values = [];
  if (status && allowedStatuses.has(status)) {
    fields.push('status = ?');
    values.push(status);
  }
  if (payload.progressNote !== undefined || payload.progress_note !== undefined) {
    fields.push('agent_progress_note = ?');
    values.push(payload.progressNote ?? payload.progress_note ?? '');
  }
  if (payload.deliveryDocUrl !== undefined || payload.delivery_doc_url !== undefined) {
    fields.push('delivery_doc_url = ?');
    values.push(payload.deliveryDocUrl ?? payload.delivery_doc_url ?? '');
  }
  if (payload.idea !== undefined || payload.ideaText !== undefined || payload.idea_text !== undefined) {
    fields.push('idea_text = ?');
    values.push(payload.idea ?? payload.ideaText ?? payload.idea_text ?? '');
  }
  if (payload.executionPlan !== undefined || payload.execution_plan !== undefined) {
    fields.push('execution_plan = ?');
    values.push(payload.executionPlan ?? payload.execution_plan ?? '');
  }
  if (payload.resourcePlan !== undefined || payload.resource_plan !== undefined) {
    fields.push('resource_plan = ?');
    values.push(payload.resourcePlan ?? payload.resource_plan ?? '');
  }
  if (payload.aiDetail !== undefined || payload.ai_detail_json !== undefined) {
    fields.push('ai_detail_json = ?');
    values.push(JSON.stringify(payload.aiDetail ?? payload.ai_detail_json ?? {}));
  }
  if (fields.length) {
    fields.push("agent_last_update_at = datetime('now')");
    values.push(subtask.id);
    db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  if (Array.isArray(payload.stepUpdates) || Array.isArray(payload.step_updates)) {
    applyAgentStepUpdates(subtask.id, payload.stepUpdates || payload.step_updates);
  }
  if (Array.isArray(payload.scheduleUpdates) || Array.isArray(payload.schedule_updates)) {
    applyAgentScheduleUpdates(subtask.id, payload.scheduleUpdates || payload.schedule_updates);
  }

  db.prepare(`
    INSERT INTO agent_events (id, subtask_id, task_id, status, week_index, progress_note, delivery_doc_url, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(),
    subtask.id,
    task.id,
    status,
    payload.weekIndex ?? payload.week_index ?? null,
    payload.progressNote ?? payload.progress_note ?? '',
    payload.deliveryDocUrl ?? payload.delivery_doc_url ?? '',
    JSON.stringify(payload)
  );
  recomputeProgress(task.id);
  return getAgentPackageByKey(apiKey);
}

function applyAgentStepUpdates(subtaskId, updates) {
  const allowed = new Set(['待开始', '进行中', '已完成']);
  const update = db.prepare(`
    UPDATE subtask_steps
    SET status = COALESCE(?, status),
        delivery_doc_url = COALESCE(?, delivery_doc_url),
        updated_at = datetime('now')
    WHERE id = ? AND subtask_id = ?
  `);
  for (const item of updates) {
    if (!item?.id) continue;
    const status = item.status && allowed.has(item.status) ? item.status : null;
    const docUrl = item.deliveryDocUrl ?? item.delivery_doc_url ?? null;
    update.run(status, docUrl, item.id, subtaskId);
  }
}

function applyAgentScheduleUpdates(subtaskId, updates) {
  const update = db.prepare(`
    UPDATE subtask_schedule_items
    SET status = COALESCE(?, status),
        delivery_doc_url = COALESCE(?, delivery_doc_url),
        updated_at = datetime('now')
    WHERE id = ? AND subtask_id = ?
  `);
  for (const item of updates) {
    if (!item?.id) continue;
    update.run(item.status || null, item.deliveryDocUrl ?? item.delivery_doc_url ?? null, item.id, subtaskId);
  }
}

export function addSubtaskAttachment({ subtaskId, taskId, fileName, filePath, size, mime, userId }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO subtask_attachments (id, subtask_id, task_id, file_name, file_path, size, mime, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, subtaskId, taskId, fileName, filePath, size, mime, userId);
  return db.prepare('SELECT * FROM subtask_attachments WHERE id = ?').get(id);
}

export function getSubtaskAttachment(id) {
  return db.prepare('SELECT * FROM subtask_attachments WHERE id = ?').get(id);
}

export function removeSubtaskAttachment(id) {
  db.prepare('DELETE FROM subtask_attachments WHERE id = ?').run(id);
}

export function remove(id) {
  const tx = db.transaction(() => {
    const files = db.prepare('SELECT file_path FROM task_attachments WHERE task_id = ?').all(id);
    const subFiles = db.prepare('SELECT file_path FROM subtask_attachments WHERE task_id = ?').all(id);
    db.prepare('DELETE FROM subtask_steps WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM subtask_schedule_items WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM agent_events WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM subtask_attachments WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM task_attachments WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM progress_updates WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return [...files, ...subFiles];
  });
  unlinkAttachmentFiles(tx());
}

export function claim(taskId, userId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.owner_id) throw new Error('任务已被认领');
  db.prepare('UPDATE tasks SET owner_id = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(userId, '进行中', taskId);
  return getById(taskId);
}

export function unclaim(taskId) {
  db.prepare('UPDATE tasks SET owner_id = NULL, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run('待开始', taskId);
  return getById(taskId);
}

export function publishAll(projectId) {
  db.prepare('UPDATE tasks SET is_published = 1, updated_at = datetime(\'now\') WHERE project_id = ? AND is_published = 0')
    .run(projectId);
  return listByProject(projectId);
}

// --- Attachments ---

export function getAttachments(taskId) {
  return db.prepare(`
    SELECT a.*, u.name as uploaded_by_name
    FROM task_attachments a LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.task_id = ?
    ORDER BY a.created_at
  `).all(taskId);
}

export function addAttachment({ taskId, fileName, filePath, size, mime, userId }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO task_attachments (id, task_id, file_name, file_path, size, mime, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, fileName, filePath, size, mime, userId);
  return db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(id);
}

export function getAttachment(id) {
  return db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(id);
}

export function removeAttachment(id) {
  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(id);
}

// --- Submit / review workflow ---
// Owner submits a deliverable -> 审核中; project PM approves -> 已完成 or rejects -> 进行中.

export function submit(taskId, userId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.owner_id !== userId) throw new Error('只有任务负责人可以提交');
  if (task.status === '已完成') throw new Error('任务已完成，无需重复提交');
  db.prepare('UPDATE tasks SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run('审核中', taskId);
  return getById(taskId);
}

export function review(taskId, reviewerId, { approved }) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== '审核中') throw new Error('任务不在审核中状态');
  if (approved) {
    db.prepare('UPDATE tasks SET status = ?, progress = 100, updated_at = datetime(\'now\') WHERE id = ?')
      .run('已完成', taskId);
  } else {
    db.prepare('UPDATE tasks SET status = ?, progress = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run('进行中', subtaskProgress(taskId), taskId);
  }
  return getById(taskId);
}
