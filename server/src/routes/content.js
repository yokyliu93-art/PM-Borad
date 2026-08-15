import { Router } from 'express';
import { authRequired, requireProjectMember } from '../middleware/auth.js';
import * as contentService from '../services/content.js';

const router = Router({ mergeParams: true });

router.use(authRequired, requireProjectMember);

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

router.put('/:memoId/topic-final-doc', (req, res) => {
  try {
    const data = contentService.updateTopicFinalDoc(req.params.projectId, req.params.memoId, req.user.id, req.body || {});
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
