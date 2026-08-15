import { Router } from 'express';
import { authRequired, requireProjectMember } from '../middleware/auth.js';
import * as contentService from '../services/content.js';

const router = Router({ mergeParams: true });

router.use(authRequired, requireProjectMember);

function sendWithTimeout(res, promise, { status = 200, timeoutMs = 50000, timeoutMessage = '解析还在处理中，请稍后重试' } = {}) {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled || res.headersSent) return;
    settled = true;
    res.status(202).json({ ok: false, error: timeoutMessage });
  }, timeoutMs);
  promise
    .then((data) => {
      if (settled || res.headersSent) return;
      settled = true;
      clearTimeout(timer);
      res.status(status).json({ ok: true, data });
    })
    .catch((err) => {
      if (settled || res.headersSent) {
        console.error('[content] late async failure:', err.userMessage || err.message);
        return;
      }
      settled = true;
      clearTimeout(timer);
      res.status(400).json({ ok: false, error: err.userMessage || err.message });
    });
}

router.get('/', (req, res) => {
  try {
    const data = contentService.listByProject(req.params.projectId, req.user.id, req.query.kind || '');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = contentService.create(req.params.projectId, req.user.id, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/import-minutes', (req, res) => {
  try {
    const data = contentService.importMinutes(req.params.projectId, req.user.id, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/parse-weekly-topics', async (req, res) => {
  try {
    const data = await contentService.parseWeeklyTopics(req.params.projectId, req.user.id, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error('[content] parse weekly topics failed:', err.userMessage || err.message);
    res.status(400).json({ ok: false, error: err.userMessage || err.message });
  }
});

router.post('/preview-weekly-topics', async (req, res) => {
  sendWithTimeout(
    res,
    contentService.previewWeeklyTopics(req.params.projectId, req.user.id, req.body || {}),
    { timeoutMessage: '周会文档解析时间过长，请稍后重试，或先复制文档正文分段处理' }
  );
});

router.post('/confirm-weekly-topics', async (req, res) => {
  try {
    const data = await contentService.confirmWeeklyTopics(req.params.projectId, req.user.id, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error('[content] confirm weekly topics failed:', err.userMessage || err.message);
    res.status(400).json({ ok: false, error: err.userMessage || err.message });
  }
});

router.post('/parse-topic-discussions', async (req, res) => {
  sendWithTimeout(
    res,
    contentService.parseTopicDiscussions(req.params.projectId, req.user.id, req.body || {}),
    { timeoutMessage: '周会速记解析时间过长，请先粘贴更短的文字片段再试' }
  );
});

router.post('/import-eval-doc', async (req, res) => {
  try {
    const data = await contentService.importEvalDoc(req.params.projectId, req.user.id, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.userMessage || err.message });
  }
});

router.post('/:memoId/vote-demo', (req, res) => {
  try {
    const data = contentService.voteDemo(req.params.projectId, req.params.memoId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/:memoId/vote-demo', (req, res) => {
  try {
    const data = contentService.unvoteDemo(req.params.projectId, req.params.memoId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-details', (req, res) => {
  try {
    const data = contentService.updateTopicDetails(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-final-doc', (req, res) => {
  try {
    const data = contentService.updateTopicFinalDoc(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-publish-date', (req, res) => {
  try {
    const data = contentService.updateTopicPublishDate(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-draft-date', (req, res) => {
  try {
    const data = contentService.updateTopicDraftDate(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-owner', (req, res) => {
  try {
    const data = contentService.updateTopicOwner(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-doc-links', (req, res) => {
  try {
    const data = contentService.updateTopicDocLinks(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/deep-topic-state', (req, res) => {
  try {
    const data = contentService.updateDeepTopicState(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:memoId/archive-topic', (req, res) => {
  try {
    const data = contentService.archiveTopic(req.params.projectId, req.params.memoId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:memoId/submit-topic-draft', async (req, res) => {
  try {
    const data = await contentService.submitTopicDraft(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:memoId/topic-editor-notes', async (req, res) => {
  try {
    const data = await contentService.updateTopicEditorNotes(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:memoId/experiences', (req, res) => {
  try {
    const data = contentService.addExperience(req.params.projectId, req.params.memoId, req.user.id, req.body?.content || '');
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
