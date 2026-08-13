import { Router } from 'express';
import * as taskService from '../services/task.js';

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

router.post('/subtask/progress', agentAuth, (req, res) => {
  try {
    const data = taskService.updateSubtaskFromAgent(req.agentApiKey, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
