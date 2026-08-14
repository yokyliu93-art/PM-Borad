import { Router } from 'express';
import { authRequired, requireProjectMember, requireProjectPM } from '../middleware/auth.js';
import * as feishuService from '../services/feishu.js';
import * as feishuProgressService from '../services/feishuProgress.js';
import * as feishuOrgService from '../services/feishuOrg.js';

function sendError(res, err) {
  res.status(400).json({ ok: false, error: err.userMessage || err.message });
}

// --- Global (used during project creation, before a project exists) ---

export const feishuRouter = Router();

function getFeishuMessageText(event = {}) {
  const raw = event.message?.content || event.content || '';
  if (!raw) return '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return String(parsed.text || parsed.content || raw || '').trim();
  } catch {
    return String(raw || '').trim();
  }
}

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
  const chatId = event.message?.chat_id || event.chat_id || '';
  const text = getFeishuMessageText(event);
  console.log('[feishu] event received:', {
    eventType: header.event_type || body.type || '',
    chatId,
  });

  try {
    if (chatId && /订阅/.test(text) && /(老板|主编|周报|看板)/.test(text)) {
      const audience = /主编|editor/i.test(text) ? 'editor' : 'boss';
      feishuProgressService.subscribeReport({
        chatId,
        audience,
        label: audience === 'editor' ? '主编周报' : '老板周报',
        createdBy: event.sender?.sender_id?.open_id || event.operator?.operator_id?.open_id || '',
      });
      feishuProgressService.sendSubscriptionReply(chatId, `已订阅${audience === 'editor' ? '主编' : '老板'}周报。之后每周五 15:00 会推送 DeepSeek 生成的 PM Board 进展总结。`)
        .catch((err) => console.error('[feishu] subscription reply failed:', err.userMessage || err.message));
    } else if (chatId && /取消订阅|退订/.test(text)) {
      feishuProgressService.unsubscribeReport({ chatId });
      feishuProgressService.sendSubscriptionReply(chatId, '已取消这个飞书会话里的 PM Board 周报订阅。')
        .catch((err) => console.error('[feishu] unsubscribe reply failed:', err.userMessage || err.message));
    }
  } catch (err) {
    console.error('[feishu] subscription command failed:', err.userMessage || err.message);
  }
  res.json({ code: 0, msg: 'success' });
});

feishuRouter.get('/report-subscriptions', authRequired, (req, res) => {
  res.json({ ok: true, data: feishuProgressService.listSubscriptions() });
});

feishuRouter.post('/report-subscriptions', authRequired, (req, res) => {
  try {
    const data = feishuProgressService.subscribeReport({
      chatId: req.body?.chatId || req.body?.chat_id,
      audience: req.body?.audience || req.body?.role,
      label: req.body?.label,
      createdBy: req.user.id,
    });
    res.status(201).json({ ok: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

feishuRouter.delete('/report-subscriptions', authRequired, (req, res) => {
  try {
    feishuProgressService.unsubscribeReport({
      chatId: req.body?.chatId || req.body?.chat_id || req.query.chatId || req.query.chat_id,
      audience: req.body?.audience || req.query.audience || '',
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

feishuRouter.post('/org/sync-me', authRequired, async (req, res) => {
  try {
    const data = await feishuOrgService.syncUserOrgProfile(req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    sendError(res, err);
  }
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

// Attach a Feishu doc as a live source. PM Board stores the parsed result and
// can re-sync when the source document changes.
projectFeishuRouter.post('/docs', authRequired, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: '请提供飞书文档链接' });
  try {
    const saved = await feishuService.attachDocSource({
      projectId: req.params.projectId,
      url,
      userId: req.user.id,
      targetType: req.body?.targetType || req.body?.target_type || '',
      targetId: req.body?.targetId || req.body?.target_id || '',
      syncEnabled: req.body?.syncEnabled ?? req.body?.sync_enabled ?? 1,
    });
    res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    sendError(res, err);
  }
});

projectFeishuRouter.post('/docs/:docId/sync', authRequired, async (req, res) => {
  const doc = feishuService.getDoc(req.params.docId);
  if (!doc || doc.project_id !== req.params.projectId) {
    return res.status(404).json({ ok: false, error: '文档源不存在' });
  }
  try {
    const data = await feishuService.syncDoc(doc.id);
    res.json({ ok: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

projectFeishuRouter.post('/docs/sync-all', authRequired, async (req, res) => {
  try {
    const data = await feishuService.syncProjectDocs(req.params.projectId);
    res.json({ ok: true, data });
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
