import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as contentService from '../services/content.js';
import db from '../db/connection.js';

const router = Router();

function requireTeamMember(req, res, next) {
  const teamId = req.query.teamId || req.body?.teamId || req.body?.team_id;
  if (!teamId) return res.status(400).json({ ok: false, error: '请指定团队' });
  const member = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user.id);
  if (!member) return res.status(403).json({ ok: false, error: '你不是该团队成员' });
  req.teamId = teamId;
  next();
}

router.use(authRequired, requireTeamMember);

router.get('/', (req, res) => {
  try {
    const data = contentService.listByTeam(req.teamId, req.user.id, {
      kind: req.query.kind || '',
      subKind: req.query.subKind || req.query.sub_kind || '',
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
