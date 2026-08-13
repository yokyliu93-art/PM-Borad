import { v4 as uuid } from 'uuid';
import { unlinkSync } from 'fs';
import path from 'path';
import db from '../db/connection.js';
import { config } from '../config.js';

function unlinkAttachmentFiles(files) {
  for (const f of files) {
    try { unlinkSync(path.join(config.uploadsDir, path.basename(f.file_path))); } catch {}
  }
}

export function create({ projectId, title, summary, cycle, docUrl, sortOrder, publish = false }) {
  const id = uuid();
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM tasks WHERE project_id = ?').get(projectId);
  const order = sortOrder ?? (maxSort?.m ?? -1) + 1;
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, summary, cycle, doc_url, status, sort_order, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, title, summary || '', cycle || '', docUrl || '', '待开始', order, publish ? 1 : 0);
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
    INSERT INTO subtask_steps (id, subtask_id, task_id, title, due_text, reminder_frequency, reminder_enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            step.reminderFrequency || step.reminder_frequency || 'none',
            step.reminderEnabled || step.reminder_enabled ? 1 : 0,
            k
          );
        });
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
  const allowed = ['title', 'summary', 'cycle', 'doc_url', 'progress', 'status', 'sort_order', 'is_published'];
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

function getSubtask(subtaskId) {
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
      INSERT INTO subtask_steps (id, subtask_id, task_id, title, status, due_text, reminder_frequency, reminder_enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        step.reminderFrequency || step.reminder_frequency || 'none',
        step.reminderEnabled || step.reminder_enabled ? 1 : 0,
        step.sortOrder ?? step.sort_order ?? index
      );
    });
  });
  tx();
  return getSubtaskSteps(subtaskId);
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
    db.prepare('DELETE FROM subtask_attachments WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM task_attachments WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM progress_updates WHERE task_id = ?').run(id);
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
