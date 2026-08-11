import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import db from '../db/connection.js';
import { authRequired } from '../middleware/auth.js';
import * as authService from '../services/auth.js';

const router = Router();

function redirectAuthError(res, message) {
  const url = new URL(config.clientUrl);
  url.searchParams.set('auth_error', message);
  res.redirect(url.toString());
}

router.get('/login', (req, res) => {
  try {
    const state = uuid();
    const url = authService.getLoginUrl(state);
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });
    res.redirect(url);
  } catch (err) {
    redirectAuthError(res, err.message);
  }
});

router.get('/google/login', (req, res) => {
  try {
    const state = uuid();
    const url = authService.getGoogleLoginUrl(state);
    res.cookie('google_oauth_state', state, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });
    res.redirect(url);
  } catch (err) {
    redirectAuthError(res, err.message);
  }
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  if (!savedState || savedState !== state) {
    return redirectAuthError(res, 'OAuth state 验证失败');
  }

  try {
    const accessToken = await authService.exchangeCode(code);
    const feishuUser = await authService.getFeishuUser(accessToken);
    const user = authService.upsertUser(feishuUser);
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
    redirectAuthError(res, err.message);
  }
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.google_oauth_state;

  if (!savedState || savedState !== state) {
    return redirectAuthError(res, 'Google OAuth state 验证失败');
  }

  try {
    const accessToken = await authService.exchangeGoogleCode(code);
    const googleUser = await authService.getGoogleUser(accessToken);
    const user = authService.upsertGoogleUser(googleUser);
    const token = authService.signJwt(user);

    res.clearCookie('google_oauth_state');
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    res.redirect(config.clientUrl);
  } catch (err) {
    console.error('[auth] google callback error:', err);
    redirectAuthError(res, err.message);
  }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ ok: true, data: req.user });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Dev-only: bypass Feishu OAuth with a mock user
function devOnly(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
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
  if (process.env.NODE_ENV === 'production') {
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
  const token = authService.signJwt(user);
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  });
  res.redirect(config.clientUrl);
});

export default router;
