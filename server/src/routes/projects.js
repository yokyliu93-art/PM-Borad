import { Router } from 'express';
import { authRequired, requireProjectMember, requireProjectPM } from '../middleware/auth.js';
import * as projectService from '../services/project.js';

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

router.put('/:projectId', authRequired, requireProjectPM, (req, res) => {
  const updated = projectService.update(req.params.projectId, req.body);
  res.json({ ok: true, data: updated });
});

router.delete('/:projectId', authRequired, requireProjectPM, (req, res) => {
  projectService.remove(req.params.projectId);
  res.json({ ok: true });
});

export default router;
