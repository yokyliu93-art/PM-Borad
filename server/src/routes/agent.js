import { Router } from 'express';
import * as taskService from '../services/task.js';
import * as projectService from '../services/project.js';
import * as aiService from '../services/ai.js';

const router = Router();

function getApiKey(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-agent-api-key'] || req.query.api_key || '').trim();
}

function agentAuth(req, res, next) {
  const apiKey = getApiKey(req);
  if (!apiKey) return res.status(401).json({ ok: false, error: '缺少 Agent API Key' });
  req.agentApiKey = apiKey;
  next();
}

router.get('/subtask', agentAuth, (req, res) => {
  try {
    const data = taskService.getAgentPackageByKey(req.agentApiKey);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

router.get('/project', agentAuth, (req, res) => {
  try {
    const data = projectService.getProjectAgentPackageByKey(req.agentApiKey);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

router.post('/project/tasks', agentAuth, (req, res) => {
  try {
    const data = projectService.createTasksFromAgent(req.agentApiKey, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/project/modules', agentAuth, (req, res) => {
  try {
    const data = projectService.updateModulesFromAgent(req.agentApiKey, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/project/timeline', agentAuth, (req, res) => {
  try {
    const data = projectService.updateTimelineFromAgent(req.agentApiKey, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/project/audit', agentAuth, async (req, res) => {
  try {
    const pkg = projectService.getProjectAgentPackageByKey(req.agentApiKey);
    const task = req.body?.taskId
      ? pkg.tasks.find((item) => item.id === req.body.taskId)
      : null;
    const audit = await aiService.auditAgentFile({
      project: pkg.project,
      task,
      payload: req.body?.file || req.body?.content || req.body || {},
    });
    res.json({ ok: true, data: { audit, project: pkg.project, task } });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/task', agentAuth, (req, res) => {
  try {
    const data = taskService.getTaskAgentPackageByKey(req.agentApiKey);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

router.post('/task/subtasks', agentAuth, (req, res) => {
  try {
    const data = taskService.createSubtasksFromAgent(req.agentApiKey, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/task/progress', agentAuth, (req, res) => {
  try {
    const data = taskService.updateTaskFromAgent(req.agentApiKey, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/subtask/progress', agentAuth, (req, res) => {
  try {
    const data = taskService.updateSubtaskFromAgent(req.agentApiKey, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
