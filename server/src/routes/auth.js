import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import db from '../db/connection.js';
import { authRequired } from '../middleware/auth.js';
import * as authService from '../services/auth.js';
import * as userAgentService from '../services/userAgent.js';

const router = Router();

router.get('/login', (req, res) => {
  const state = uuid();
  res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });
  const url = authService.getLoginUrl(state);
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  if (!savedState || savedState !== state) {
    return res.status(400).json({ ok: false, error: 'OAuth state 验证失败' });
  }

  try {
    const tokenData = await authService.exchangeCode(code);
    // The access_token response embeds the user identity (open_id, name, ...),
    // so we avoid a separate user_info call that would need the authen scope.
    const feishuUser = tokenData.open_id
      ? tokenData
      : await authService.getFeishuUser(tokenData.access_token);
    const user = authService.upsertUser(feishuUser);
    authService.ensureDefaultTeamMembership(user.id);
    authService.saveUserTokens(user.id, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });
    const token = authService.signJwt(user);

    res.clearCookie('oauth_state');
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    res.redirect(config.clientUrl);
  } catch (err) {
    console.error('[auth] callback error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/me', authRequired, (req, res) => {
  const user = authService.getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
  const bound = db.prepare('SELECT 1 FROM user_feishu_tokens WHERE user_id = ?').get(req.user.id);
  res.json({
    ok: true,
    data: {
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      email: user.email,
      feishuBound: !!bound,
      defaultTeamId: config.defaultTeamId || null,
      devLoginEnabled: config.devLoginEnabled,
    },
  });
});

router.put('/me', authRequired, (req, res) => {
  try {
    const user = authService.updateProfile(req.user.id, {
      name: req.body?.name,
      avatarUrl: req.body?.avatarUrl ?? req.body?.avatar_url,
    });
    const token = authService.signJwt(user);
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    const bound = db.prepare('SELECT 1 FROM user_feishu_tokens WHERE user_id = ?').get(user.id);
    res.json({
      ok: true,
      data: {
        ...user,
        feishuBound: !!bound,
        defaultTeamId: config.defaultTeamId || null,
        devLoginEnabled: config.devLoginEnabled,
      },
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/me/agent', authRequired, (req, res) => {
  try {
    const data = userAgentService.getUserAgentAccess(req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/me/agent-key', authRequired, (req, res) => {
  try {
    const data = userAgentService.generateUserAgentKey(req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Dev-only: bypass Feishu OAuth with a mock user.
// Only reachable when ENABLE_DEV_LOGIN=true (local development). In production
// this flag is unset, so these routes are closed regardless of NODE_ENV.
function devOnly(req, res, next) {
  if (!config.devLoginEnabled) {
    return res.status(404).json({ ok: false, error: 'Not available in production' });
  }
  next();
}

// Dev-only user management (powers the account switcher add/delete).
router.get('/users', authRequired, devOnly, (req, res) => {
  res.json({ ok: true, data: authService.listUsers() });
});

router.post('/users', authRequired, devOnly, (req, res) => {
  try {
    const user = authService.createUser({ name: req.body?.name });
    res.status(201).json({ ok: true, data: user });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/users/:id', authRequired, devOnly, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ ok: false, error: '不能删除当前登录的账号' });
  }
  try {
    const user = authService.deleteUser(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Dev-only: bypass Feishu OAuth with a mock user
router.get('/dev-login', (req, res) => {
  if (!config.devLoginEnabled) {
    return res.status(404).json({ ok: false, error: 'Not available in production' });
  }
  const openId = req.query.user || 'dev-user-001';
  const names = { 'dev-user-001': 'Yoky', 'dev-user-002': '雅婷', 'dev-user-003': '奚晨', 'dev-user-004': '小艺', 'dev-user-005': '雨霏', 'dev-user-006': '饶上' };
  // Keep an existing user's name (accounts created via the switcher must not
  // be renamed); only create missing users with the mapped or default name.
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(openId);
  if (!user) {
    db.prepare('INSERT INTO users (id, name, avatar_url, email) VALUES (?, ?, ?, ?)')
      .run(openId, names[openId] || 'Dev User', '', '');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(openId);
  }
  authService.ensureDefaultTeamMembership(user.id);
  const token = authService.signJwt(user);
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  });
  res.redirect(config.clientUrl);
});

export default router;
