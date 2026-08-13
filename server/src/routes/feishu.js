import { Router } from 'express';
import { authRequired, requireProjectMember } from '../middleware/auth.js';
import * as feishuService from '../services/feishu.js';
import * as aiService from '../services/ai.js';
import * as taskService from '../services/task.js';

function sendError(res, err) {
  res.status(400).json({ ok: false, error: err.userMessage || err.message });
}

// --- Global (used during project creation, before a project exists) ---

export const feishuRouter = Router();

// Fetch a Feishu doc's content by URL and return it so the client can fill the
// project plan. Not persisted here — project-scoped endpoints below store it.
feishuRouter.post('/docs/import', authRequired, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: '请提供飞书文档链接' });
  try {
    const doc = await feishuService.fetchDocContent(req.user.id, url);
    res.json({ ok: true, data: doc });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Project-scoped (associate docs to an existing project) ---

export const projectFeishuRouter = Router({ mergeParams: true });
projectFeishuRouter.use(requireProjectMember);

projectFeishuRouter.get('/docs', authRequired, (req, res) => {
  const docs = feishuService.listDocs(req.params.projectId);
  res.json({ ok: true, data: docs });
});

// Import a doc and attach it to the project.
projectFeishuRouter.post('/docs', authRequired, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: '请提供飞书文档链接' });
  try {
    const doc = await feishuService.fetchDocContent(req.user.id, url);
    const saved = feishuService.saveDoc({ ...doc, projectId: req.params.projectId, userId: req.user.id });
    res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    sendError(res, err);
  }
});

projectFeishuRouter.delete('/docs/:docId', authRequired, (req, res) => {
  const doc = feishuService.getDoc(req.params.docId);
  if (!doc || doc.project_id !== req.params.projectId) {
    return res.status(404).json({ ok: false, error: '文档不存在' });
  }
  feishuService.removeDoc(doc.id);
  res.json({ ok: true });
});

// Split an already-imported doc's content into a task pool via AI.
projectFeishuRouter.post('/docs/:docId/ai-split', authRequired, async (req, res) => {
  const doc = feishuService.getDoc(req.params.docId);
  if (!doc || doc.project_id !== req.params.projectId) {
    return res.status(404).json({ ok: false, error: '文档不存在' });
  }
  try {
    const taskDefs = await aiService.splitTasks({
      name: doc.title,
      description: '',
      planMarkdown: doc.content_markdown,
    });
    const tasks = taskService.createTasksFromDefs(req.params.projectId, taskDefs);
    res.status(201).json({ ok: true, data: tasks });
  } catch (err) {
    sendError(res, err);
  }
});
