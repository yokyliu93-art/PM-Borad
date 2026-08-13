import { Router } from 'express';
import * as taskService from '../services/task.js';
import * as projectService from '../services/project.js';

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
