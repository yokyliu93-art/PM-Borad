import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as templateService from '../services/template.js';

const router = Router();

router.get('/', authRequired, (req, res) => {
  const templates = templateService.listAll();
  res.json({ ok: true, data: templates });
});

router.get('/:templateId', authRequired, (req, res) => {
  const template = templateService.getById(req.params.templateId);
  if (!template) return res.status(404).json({ ok: false, error: '模板不存在' });
  res.json({ ok: true, data: template });
});

export default router;
