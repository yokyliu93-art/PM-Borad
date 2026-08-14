import { Router } from 'express';
import { authRequired, requireProjectMember, requireProjectPM } from '../middleware/auth.js';
import * as projectService from '../services/project.js';
import * as loopService from '../services/loop.js';

const router = Router();

router.post('/', authRequired, (req, res) => {
  const { teamId, name, description, planMarkdown, timelineJson, memberIds } = req.body;
  if (!teamId || !name) return res.status(400).json({ ok: false, error: '团队ID和项目名称不能为空' });
  const project = projectService.create({
    teamId, name, description, planMarkdown,
    pmUserId: req.user.id, timelineJson, memberIds,
  });
  res.status(201).json({ ok: true, data: project });
});

router.get('/', authRequired, (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ ok: false, error: '请指定团队' });
  const projects = projectService.listByTeam(teamId, req.user.id);
  res.json({ ok: true, data: projects });
});

router.get('/:projectId', authRequired, requireProjectMember, (req, res) => {
  let project = projectService.getById(req.params.projectId);
  if (!project) return res.status(404).json({ ok: false, error: '项目不存在' });
  project = projectService.ensureDefaultProjectAgentSetup(project.id).project;
  res.json({ ok: true, data: project });
});

router.post('/:projectId/agent-key', authRequired, requireProjectPM, (req, res) => {
  try {
    const data = projectService.generateProjectAgentKey(req.params.projectId);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:projectId/agent-config', authRequired, requireProjectPM, (req, res) => {
  try {
    const data = projectService.updateProjectAgentConfig(req.params.projectId, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:projectId/modules/:moduleKey/claim', authRequired, requireProjectMember, async (req, res) => {
  try {
    const data = await projectService.claimModule(req.params.projectId, req.params.moduleKey, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:projectId/modules/:moduleKey/owner', authRequired, requireProjectPM, async (req, res) => {
  try {
    const ownerId = req.body?.ownerId || req.body?.owner_id;
    if (!ownerId) return res.status(400).json({ ok: false, error: '请选择负责人' });
    const data = await projectService.assignModule(req.params.projectId, req.params.moduleKey, ownerId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/:projectId/modules/:moduleKey', authRequired, requireProjectPM, (req, res) => {
  try {
    const data = projectService.removeModule(req.params.projectId, req.params.moduleKey);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/:projectId/loops/:loopId/complete', authRequired, requireProjectMember, (req, res) => {
  try {
    const data = loopService.completeLoop(req.params.projectId, req.params.loopId, req.user.id, req.body?.note || '');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/:projectId', authRequired, requireProjectPM, (req, res) => {
  const updated = projectService.update(req.params.projectId, req.body);
  res.json({ ok: true, data: updated });
});

router.delete('/:projectId', authRequired, requireProjectPM, (req, res) => {
  projectService.remove(req.params.projectId);
  res.json({ ok: true });
});

export default router;
