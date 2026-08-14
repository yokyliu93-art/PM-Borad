import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { authRequired, requireProjectMember, requireProjectPM } from '../middleware/auth.js';
import * as taskService from '../services/task.js';
import * as templateService from '../services/template.js';
import * as feishuPushService from '../services/feishuPush.js';
import db from '../db/connection.js';
import { config } from '../config.js';
import { emit } from '../socket/index.js';

const router = Router({ mergeParams: true });

mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).slice(0, 20)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function requireTaskOwner(req, res, next) {
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  if (task.owner_id !== req.user.id) return res.status(403).json({ ok: false, error: '只有任务负责人可以操作' });
  req.task = task;
  next();
}

// All task routes are scoped to a project, so require team membership up front.
router.use(requireProjectMember);

function requireTaskManager(req, res, next) {
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(task.project_id);
  if (!(project && project.pm_user_id === req.user.id) && task.owner_id !== req.user.id) {
    return res.status(403).json({ ok: false, error: '只有任务负责人或项目PM可以操作' });
  }
  req.task = task;
  next();
}

function broadcast(req, event, data) {
  if (req.io) emit(req.io, req.params.projectId, event, data);
}

function listComments(taskId, targetType = 'task', targetId = taskId) {
  return db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
    FROM task_comments c JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ? AND c.target_type = ? AND c.target_id = ?
    ORDER BY c.created_at ASC
  `).all(taskId, targetType, targetId);
}

// List tasks for project
router.get('/', authRequired, (req, res) => {
  const { published } = req.query;
  const tasks = published === '1'
    ? taskService.listPublished(req.params.projectId)
    : taskService.listByProject(req.params.projectId);
  // Attach subtasks to each task
  for (const task of tasks) {
    task.subtasks = db.prepare(`
      SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar
      FROM subtasks s LEFT JOIN users u ON s.assignee_id = u.id
      WHERE s.task_id = ?
      ORDER BY s.sort_order, s.created_at
    `).all(task.id);
  }
  res.json({ ok: true, data: tasks });
});

// Create task (manual). Only the project PM may add tasks to the pool.
router.post('/', authRequired, requireProjectPM, (req, res) => {
  const { title, summary, cycle, docUrl, sortOrder, publishNow } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: '任务标题不能为空' });
  const task = taskService.create({
    projectId: req.params.projectId,
    title, summary, cycle, docUrl, sortOrder,
    publish: !!publishNow,
  });
  broadcast(req, 'task:created', { task });
  res.status(201).json({ ok: true, data: task });
});

// Apply template to split tasks
router.post('/split', authRequired, (req, res) => {
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ ok: false, error: '请选择模板' });
  try {
    const tasks = templateService.applyToProject(templateId, req.params.projectId);
    res.status(201).json({ ok: true, data: tasks });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/ai-split', authRequired, async (req, res) => {
  res.status(410).json({
    ok: false,
    error: 'PM Board 不再在平台内做 AI 拆分。请复制总PM Agent 包，让 Agent 调用 /api/agent/project/tasks 回传任务块。',
  });
});

// Publish all draft tasks to pool
router.post('/publish', authRequired, (req, res) => {
  const tasks = taskService.publishAll(req.params.projectId);
  broadcast(req, 'pool:published', { tasks });
  res.json({ ok: true, data: tasks });
});

// Get single task
router.get('/:taskId', authRequired, (req, res) => {
  let task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  taskService.ensureDefaultTaskAgentSetup(task.id);
  task = taskService.getById(req.params.taskId);
  task.subtasks = taskService.attachSubtaskPayloads(db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar, su.name as submitted_by_name
    FROM subtasks s
    LEFT JOIN users u ON s.assignee_id = u.id
    LEFT JOIN users su ON s.submitted_by = su.id
    WHERE s.task_id = ? ORDER BY s.sort_order, s.created_at
  `).all(task.id));
  task.subtasks = task.subtasks.map((sub) => taskService.ensureDefaultAgentSetup(task.id, sub.id));
  for (const sub of task.subtasks) {
    sub.comments = listComments(task.id, 'subtask', sub.id);
  }
  task.comments = listComments(task.id);
  task.updates = db.prepare(`
    SELECT pu.*, u.name as user_name, u.avatar_url as user_avatar
    FROM progress_updates pu JOIN users u ON pu.user_id = u.id
    WHERE pu.task_id = ? ORDER BY pu.created_at DESC
  `).all(task.id);
  task.attachments = taskService.getAttachments(task.id);
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(task.project_id);
  task.project_pm_user_id = project?.pm_user_id || null;
  task.isProjectPM = task.project_pm_user_id === req.user.id;
  res.json({ ok: true, data: task });
});

router.post('/:taskId/agent-key', authRequired, requireTaskManager, (req, res) => {
  try {
    const data = taskService.generateTaskAgentKey(req.params.taskId);
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:taskId/agent-config', authRequired, requireTaskManager, (req, res) => {
  try {
    const task = taskService.updateTaskAgentConfig(req.params.taskId, req.body || {});
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data: task });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:taskId/ai-refine', authRequired, requireTaskManager, async (req, res) => {
  res.status(410).json({
    ok: false,
    error: 'PM Board 不再在平台内做 AI 细化。请复制子PM Agent 包，让 Agent 回传想法、执行方案和资源配合。',
  });
});

// Update task — task owner (sub-PM) or project PM only.
router.put('/:taskId', authRequired, requireTaskManager, (req, res) => {
  const task = taskService.update(req.params.taskId, req.body);
  broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: req.body });
  res.json({ ok: true, data: task });
});

// Delete task (project PM only)
router.delete('/:taskId', authRequired, requireProjectPM, (req, res) => {
  const task = taskService.getById(req.params.taskId);
  if (!task || task.project_id !== req.params.projectId) {
    return res.status(404).json({ ok: false, error: '任务不存在' });
  }
  taskService.remove(req.params.taskId);
  broadcast(req, 'task:deleted', { taskId: req.params.taskId });
  res.json({ ok: true });
});

router.post('/:taskId/comments/:commentId/adopt', authRequired, requireTaskManager, (req, res) => {
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(req.params.commentId, req.params.taskId);
  if (!comment) return res.status(404).json({ ok: false, error: '评论不存在' });
  if (comment.target_type !== 'task') {
    return res.status(400).json({ ok: false, error: '目前只能采纳任务块主讨论里的建议' });
  }
  if (comment.adopted_at) {
    return res.status(400).json({ ok: false, error: '这条建议已经采纳过了' });
  }
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  const suggestion = comment.content.trim();
  const currentSummary = String(task.summary || '').trim();
  const nextSummary = currentSummary.includes(suggestion)
    ? currentSummary
    : [
        currentSummary,
        currentSummary.includes('采纳建议：') ? `- ${suggestion}` : `采纳建议：\n- ${suggestion}`,
      ].filter(Boolean).join('\n\n');
  const updatedTask = taskService.update(task.id, { summary: nextSummary });
  db.prepare(`
    UPDATE task_comments
    SET adopted_at = datetime('now'), adopted_by = ?, adopted_target = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, 'task.summary', comment.id);
  const updatedComment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
    FROM task_comments c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(comment.id);
  broadcast(req, 'comment:adopted', { taskId: task.id, comment: updatedComment, task: updatedTask });
  res.json({ ok: true, data: { task: updatedTask, comment: updatedComment } });
});

router.post('/:taskId/comments', authRequired, (req, res) => {
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ ok: false, error: '评论不能为空' });
  if (content.length > 2000) return res.status(400).json({ ok: false, error: '评论不能超过 2000 字' });
  const targetType = req.body?.targetType === 'subtask' || req.body?.target_type === 'subtask' ? 'subtask' : 'task';
  const targetId = targetType === 'subtask' ? String(req.body?.targetId || req.body?.target_id || '') : task.id;
  if (targetType === 'subtask') {
    const sub = db.prepare('SELECT id FROM subtasks WHERE id = ? AND task_id = ?').get(targetId, task.id);
    if (!sub) return res.status(404).json({ ok: false, error: '子任务不存在' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO task_comments (id, task_id, target_type, target_id, user_id, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, task.id, targetType, targetId, req.user.id, content);
  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
    FROM task_comments c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(id);
  broadcast(req, 'comment:posted', { taskId: task.id, targetType, targetId, comment });
  res.status(201).json({ ok: true, data: comment });
});

router.delete('/:taskId/comments/:commentId', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(req.params.commentId, req.params.taskId);
  if (!comment) return res.status(404).json({ ok: false, error: '评论不存在' });
  const task = taskService.getById(req.params.taskId);
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(task?.project_id);
  const canDelete = comment.user_id === req.user.id || task?.owner_id === req.user.id || project?.pm_user_id === req.user.id;
  if (!canDelete) return res.status(403).json({ ok: false, error: '无权删除该评论' });
  db.prepare('DELETE FROM task_comments WHERE id = ?').run(comment.id);
  broadcast(req, 'comment:deleted', { taskId: req.params.taskId, commentId: comment.id });
  res.json({ ok: true });
});

// Claim task
router.post('/:taskId/claim', authRequired, (req, res) => {
  try {
    const task = taskService.claim(req.params.taskId, req.user.id);
    broadcast(req, 'task:claimed', { task, taskId: task.id, userId: req.user.id, userName: req.user.name });
    res.json({ ok: true, data: task });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Unclaim task — task owner or project PM only.
router.post('/:taskId/unclaim', authRequired, requireTaskManager, (req, res) => {
  const task = taskService.unclaim(req.params.taskId);
  broadcast(req, 'task:unclaimed', { task, taskId: task.id });
  res.json({ ok: true, data: task });
});

// --- Subtasks ---

router.get('/:taskId/subtasks', authRequired, (req, res) => {
  const subtasks = taskService.attachSubtaskPayloads(db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar
    FROM subtasks s LEFT JOIN users u ON s.assignee_id = u.id
    WHERE s.task_id = ?
    ORDER BY s.sort_order, s.created_at
  `).all(req.params.taskId));
  res.json({ ok: true, data: subtasks.map((sub) => taskService.ensureDefaultAgentSetup(req.params.taskId, sub.id)) });
});

router.post('/:taskId/subtasks', authRequired, requireTaskManager, (req, res) => {
  const { title, assigneeId, note } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: '子任务标题不能为空' });
  const id = uuid();
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM subtasks WHERE task_id = ?').get(req.params.taskId);
  const order = (maxSort?.m ?? -1) + 1;
  db.prepare('INSERT INTO subtasks (id, task_id, title, assignee_id, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.taskId, title, assigneeId || null, note || '', order);
  const subtask = db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar
    FROM subtasks s LEFT JOIN users u ON s.assignee_id = u.id WHERE s.id = ?
  `).get(id);
  taskService.replaceSubtaskSteps(req.params.taskId, id, [
    { title: `明确「${title}」的输出标准` },
    { title: '推进执行并同步进展' },
    { title: '整理飞书文档并提交确认' },
  ]);
  const hydrated = taskService.ensureDefaultAgentSetup(req.params.taskId, id);
  subtask.steps = hydrated.steps;
  subtask.schedule = hydrated.schedule;
  subtask.agent_api_key_prefix = hydrated.agent_api_key_prefix;
  subtask.agent_instructions = hydrated.agent_instructions;
  res.status(201).json({ ok: true, data: subtask });
});

router.put('/:taskId/subtasks', authRequired, requireTaskManager, (req, res) => {
  // Batch update all subtasks: { subtasks: [{id, title, assigneeId, status, note, sortOrder}] }
  const { subtasks } = req.body;
  if (!subtasks || !Array.isArray(subtasks)) {
    return res.status(400).json({ ok: false, error: '请提供子任务列表' });
  }
  const updateStmt = db.prepare(
    'UPDATE subtasks SET title = ?, assignee_id = ?, status = ?, note = ?, sort_order = ? WHERE id = ? AND task_id = ?'
  );
  const tx = db.transaction(() => {
    for (const s of subtasks) {
      updateStmt.run(s.title, s.assigneeId || null, s.status || 'pending', s.note || '', s.sortOrder ?? 0, s.id, req.params.taskId);
    }
  });
  tx();
  taskService.recomputeProgress(req.params.taskId);
  const updated = db.prepare(`
    SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar
    FROM subtasks s LEFT JOIN users u ON s.assignee_id = u.id
    WHERE s.task_id = ? ORDER BY s.sort_order, s.created_at
  `).all(req.params.taskId);
  res.json({ ok: true, data: updated });
});

router.delete('/:taskId/subtasks/:subtaskId', authRequired, requireTaskManager, (req, res) => {
  db.prepare('DELETE FROM subtask_steps WHERE subtask_id = ? AND task_id = ?').run(req.params.subtaskId, req.params.taskId);
  db.prepare('DELETE FROM subtask_schedule_items WHERE subtask_id = ? AND task_id = ?').run(req.params.subtaskId, req.params.taskId);
  db.prepare('DELETE FROM agent_events WHERE subtask_id = ? AND task_id = ?').run(req.params.subtaskId, req.params.taskId);
  db.prepare('DELETE FROM task_comments WHERE target_type = ? AND target_id = ? AND task_id = ?').run('subtask', req.params.subtaskId, req.params.taskId);
  db.prepare('DELETE FROM subtasks WHERE id = ? AND task_id = ?').run(req.params.subtaskId, req.params.taskId);
  taskService.recomputeProgress(req.params.taskId);
  res.json({ ok: true });
});

router.post('/:taskId/subtasks/:subtaskId/agent-key', authRequired, requireTaskManager, (req, res) => {
  try {
    const data = taskService.generateSubtaskAgentKey(req.params.taskId, req.params.subtaskId);
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:taskId/subtasks/:subtaskId/agent-config', authRequired, requireTaskManager, (req, res) => {
  try {
    const subtask = taskService.updateSubtaskAgentConfig(req.params.taskId, req.params.subtaskId, req.body || {});
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data: subtask });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:taskId/subtasks/:subtaskId/agent-reminder/test', authRequired, requireTaskManager, async (req, res) => {
  try {
    const subtask = taskService.getSubtask(req.params.subtaskId);
    if (!subtask || subtask.task_id !== req.params.taskId) {
      return res.status(404).json({ ok: false, error: '子任务不存在' });
    }
    if (!subtask.feishu_chat_id) {
      return res.status(400).json({ ok: false, error: '请先填写飞书群 chat_id' });
    }
    await feishuPushService.sendTextToChat(
      subtask.feishu_chat_id,
      `PM Board 提醒：请更新子任务「${subtask.title}」的本周进度，并附上飞书交付文档链接。`
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.userMessage || err.message });
  }
});

router.put('/:taskId/subtasks/:subtaskId/steps', authRequired, requireTaskManager, (req, res) => {
  const { steps } = req.body;
  if (!Array.isArray(steps)) return res.status(400).json({ ok: false, error: '请提供执行步骤' });
  try {
    const updated = taskService.replaceSubtaskSteps(req.params.taskId, req.params.subtaskId, steps);
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Submit a subtask -> 已提交 (any logged-in user, mirrors the task-level submit)
router.post('/:taskId/subtasks/:subtaskId/submit', authRequired, (req, res) => {
  try {
    const docUrl = String(req.body?.docUrl || req.body?.doc_url || '').trim();
    if (!/^https:\/\/.+\.feishu\.cn\/(docx|docs|wiki)\//.test(docUrl)) {
      return res.status(400).json({ ok: false, error: '请填写有效的飞书文档链接' });
    }
    const sub = taskService.submitSubtask(req.params.taskId, req.params.subtaskId, req.user.id, {
      description: req.body?.description,
      docUrl,
    });
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data: sub });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Confirm a submitted subtask -> 已完成 (project PM only)
router.post('/:taskId/subtasks/:subtaskId/confirm', authRequired, (req, res) => {
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(task.project_id);
  if (!project || project.pm_user_id !== req.user.id) {
    return res.status(403).json({ ok: false, error: '只有项目PM可以确认子任务' });
  }
  try {
    const sub = taskService.confirmSubtask(req.params.taskId, req.params.subtaskId);
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.json({ ok: true, data: sub });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Upload a deliverable file for a subtask (any logged-in user, until the subtask is submitted).
router.post('/:taskId/subtasks/:subtaskId/attachments', authRequired, (req, res) => {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(req.params.subtaskId, req.params.taskId);
  if (!sub) return res.status(404).json({ ok: false, error: '子任务不存在' });
  if (sub.status === '已提交' || sub.status === '已完成') {
    return res.status(400).json({ ok: false, error: '子任务已提交，不能再上传文件' });
  }
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: `上传失败：${err.message}` });
    if (!req.file) return res.status(400).json({ ok: false, error: '请选择要上传的文件' });
    const att = taskService.addSubtaskAttachment({
      subtaskId: req.params.subtaskId,
      taskId: req.params.taskId,
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mime: req.file.mimetype,
      userId: req.user.id,
    });
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.status(201).json({ ok: true, data: att });
  });
});

router.delete('/:taskId/subtasks/:subtaskId/attachments/:attachmentId', authRequired, (req, res) => {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(req.params.subtaskId, req.params.taskId);
  if (!sub) return res.status(404).json({ ok: false, error: '子任务不存在' });
  if (sub.status === '已提交' || sub.status === '已完成') {
    return res.status(400).json({ ok: false, error: '子任务已提交，不能再删除文件' });
  }
  const att = taskService.getSubtaskAttachment(req.params.attachmentId);
  if (!att || att.subtask_id !== req.params.subtaskId) return res.status(404).json({ ok: false, error: '附件不存在' });
  try { unlinkSync(path.join(config.uploadsDir, path.basename(att.file_path))); } catch {}
  taskService.removeSubtaskAttachment(att.id);
  res.json({ ok: true });
});

// --- Progress Updates ---

router.get('/:taskId/updates', authRequired, (req, res) => {
  const updates = db.prepare(`
    SELECT pu.*, u.name as user_name, u.avatar_url as user_avatar
    FROM progress_updates pu JOIN users u ON pu.user_id = u.id
    WHERE pu.task_id = ? ORDER BY pu.created_at DESC
  `).all(req.params.taskId);
  res.json({ ok: true, data: updates });
});

router.post('/:taskId/updates', authRequired, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ ok: false, error: '内容不能为空' });
  const id = uuid();
  db.prepare('INSERT INTO progress_updates (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, req.params.taskId, req.user.id, content);
  const update = db.prepare(`
    SELECT pu.*, u.name as user_name, u.avatar_url as user_avatar
    FROM progress_updates pu JOIN users u ON pu.user_id = u.id WHERE pu.id = ?
  `).get(id);
  broadcast(req, 'update:posted', { taskId: req.params.taskId, update });
  res.status(201).json({ ok: true, data: update });
});

// --- Attachments (owner-only) ---

router.post('/:taskId/attachments', authRequired, requireTaskOwner, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: `上传失败：${err.message}` });
    if (!req.file) return res.status(400).json({ ok: false, error: '请选择要上传的文件' });
    const att = taskService.addAttachment({
      taskId: req.params.taskId,
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mime: req.file.mimetype,
      userId: req.user.id,
    });
    broadcast(req, 'task:updated', { taskId: req.params.taskId, patch: {} });
    res.status(201).json({ ok: true, data: att });
  });
});

router.delete('/:taskId/attachments/:attachmentId', authRequired, requireTaskOwner, (req, res) => {
  const att = taskService.getAttachment(req.params.attachmentId);
  if (!att || att.task_id !== req.params.taskId) return res.status(404).json({ ok: false, error: '附件不存在' });
  try { unlinkSync(path.join(config.uploadsDir, path.basename(att.file_path))); } catch {}
  taskService.removeAttachment(att.id);
  res.json({ ok: true });
});

// --- Submit / review workflow ---

router.post('/:taskId/submit', authRequired, requireTaskOwner, (req, res) => {
  try {
    const task = taskService.submit(req.params.taskId, req.user.id);
    db.prepare('INSERT INTO progress_updates (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(uuid(), task.id, req.user.id, '提交了任务交付物（等待项目PM审核）');
    broadcast(req, 'task:updated', { taskId: task.id, patch: { status: task.status } });
    res.json({ ok: true, data: task });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:taskId/review', authRequired, (req, res) => {
  const task = taskService.getById(req.params.taskId);
  if (!task) return res.status(404).json({ ok: false, error: '任务不存在' });
  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(task.project_id);
  if (!project || project.pm_user_id !== req.user.id) {
    return res.status(403).json({ ok: false, error: '只有项目PM可以审核' });
  }
  try {
    const approved = !!req.body.approved;
    const comment = (req.body.comment || '').trim();
    const updated = taskService.review(req.params.taskId, req.user.id, { approved });
    const note = approved
      ? (comment ? `审核通过：${comment}` : '审核通过，任务已完成')
      : (comment ? `审核驳回：${comment}` : '审核驳回，请完善后重新提交');
    db.prepare('INSERT INTO progress_updates (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(uuid(), task.id, req.user.id, note);
    broadcast(req, 'task:updated', { taskId: task.id, patch: { status: updated.status } });
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
