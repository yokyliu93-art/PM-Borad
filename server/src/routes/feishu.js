import { Router } from 'express';
import { authRequired, requireProjectMember, requireProjectPM } from '../middleware/auth.js';
import * as feishuService from '../services/feishu.js';
import * as feishuProgressService from '../services/feishuProgress.js';

function sendError(res, err) {
  res.status(400).json({ ok: false, error: err.userMessage || err.message });
}

// --- Global (used during project creation, before a project exists) ---

export const feishuRouter = Router();

feishuRouter.post('/events', (req, res) => {
  const body = req.body || {};
  if (body.challenge) {
    return res.json({ challenge: body.challenge });
  }
  if (body.type === 'url_verification' && body.challenge) {
    return res.json({ challenge: body.challenge });
  }

  const header = body.header || {};
  const event = body.event || {};
  console.log('[feishu] event received:', {
    eventType: header.event_type || body.type || '',
    chatId: event.message?.chat_id || event.chat_id || '',
  });
  res.json({ code: 0, msg: 'success' });
});

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

projectFeishuRouter.post('/docs/:docId/ai-split', authRequired, async (req, res) => {
  const doc = feishuService.getDoc(req.params.docId);
  if (!doc || doc.project_id !== req.params.projectId) {
    return res.status(404).json({ ok: false, error: '文档不存在' });
  }
  res.status(410).json({
    ok: false,
    error: 'PM Board 不再根据飞书文档做平台内 AI 拆分。请把文档放进总PM Agent 包，由 Agent 拆分后回传。',
  });
});

projectFeishuRouter.get('/progress-sync', authRequired, requireProjectPM, (req, res) => {
  const data = feishuProgressService.getProjectFeishuSync(req.params.projectId);
  res.json({ ok: true, data });
});

projectFeishuRouter.put('/progress-sync', authRequired, requireProjectPM, (req, res) => {
  try {
    const data = feishuProgressService.updateProjectFeishuSync(req.params.projectId, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

projectFeishuRouter.post('/progress-sync/test', authRequired, requireProjectPM, async (req, res) => {
  try {
    const sync = feishuProgressService.getProjectFeishuSync(req.params.projectId);
    const chatId = req.body?.chatId || req.body?.chat_id || sync?.feishu_progress_chat_id;
    if (!chatId) return res.status(400).json({ ok: false, error: '请先填写飞书群 chat_id' });
    const text = await feishuProgressService.sendProjectProgress(req.params.projectId, chatId);
    res.json({ ok: true, data: { text } });
  } catch (err) {
    sendError(res, err);
  }
});

projectFeishuRouter.post('/boss-dashboard/test', authRequired, requireProjectPM, async (req, res) => {
  try {
    const sync = feishuProgressService.getProjectFeishuSync(req.params.projectId);
    const chatId = req.body?.chatId || req.body?.chat_id || sync?.feishu_boss_chat_id;
    if (!chatId) return res.status(400).json({ ok: false, error: '请先填写老板看板飞书群 chat_id' });
    const text = await feishuProgressService.sendBossDashboard(chatId);
    res.json({ ok: true, data: { text } });
  } catch (err) {
    sendError(res, err);
  }
});
