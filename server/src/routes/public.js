import { Router } from 'express';
import * as contentService from '../services/content.js';

// Public, auth-free endpoints. Eval test sets are intentionally public so
// external readers can browse test sets and copy prompts to benchmark models.
const router = Router();

router.get('/evals', (req, res) => {
  try {
    res.json({ ok: true, data: contentService.listPublicEvalSets() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/evals/:memoId', (req, res) => {
  try {
    const data = contentService.getPublicEval(req.params.memoId);
    if (!data) return res.status(404).json({ ok: false, error: '测试集不存在或已下线' });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
