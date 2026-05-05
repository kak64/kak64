const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { flash } = require('../middleware');

const router = express.Router();

// ---- Email/password ----
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'התחברות', next: req.query.next || '' });
});

router.post('/login', (req, res) => {
  const { identifier, password, next } = req.body;
  if (!identifier || !password) {
    flash(req, 'error', 'יש למלא שם משתמש וסיסמה');
    return res.redirect('/auth/login');
  }
  const user = db.getUserByEmail(identifier) || db.getUserByUsername(identifier);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    flash(req, 'error', 'פרטי התחברות שגויים');
    return res.redirect('/auth/login');
  }
  req.session.userId = user.id;
  flash(req, 'success', `ברוך הבא, ${user.username}!`);
  res.redirect(next || '/');
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  // Capture ?ref= for after-signup linkage
  if (req.query.ref) req.session.refCode = String(req.query.ref).trim().toUpperCase();
  res.render('auth/register', { title: 'הרשמה', refCode: req.session.refCode || '' });
});

router.post('/register', (req, res) => {
  const { username, email, password, password2, ref } = req.body;
  if (!username || !email || !password) {
    flash(req, 'error', 'נא למלא את כל השדות');
    return res.redirect('/auth/register');
  }
  if (password.length < 6) {
    flash(req, 'error', 'הסיסמה חייבת להכיל לפחות 6 תווים');
    return res.redirect('/auth/register');
  }
  if (password !== password2) {
    flash(req, 'error', 'הסיסמאות אינן תואמות');
    return res.redirect('/auth/register');
  }
  if (db.getUserByEmail(email) || db.getUserByUsername(username)) {
    flash(req, 'error', 'משתמש קיים כבר');
    return res.redirect('/auth/register');
  }
  const hash = bcrypt.hashSync(password, 10);
  let referredBy = null;
  const refInput = (ref || req.session.refCode || '').trim().toUpperCase();
  if (refInput) {
    const referrer = db.getUserByRefCode(refInput);
    if (referrer) referredBy = referrer.id;
  }
  const user = db.createUser({ username, email, password_hash: hash, referred_by: referredBy });
  delete req.session.refCode;
  req.session.userId = user.id;
  flash(req, 'success', referredBy ? 'נרשמת בהצלחה! קוד החבר מאומת.' : 'נרשמת בהצלחה!');
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---- Discord OAuth ----
router.get('/discord', (req, res) => {
  const cid = process.env.DISCORD_CLIENT_ID;
  if (!cid) {
    flash(req, 'error', 'התחברות Discord לא מוגדרת בשרת');
    return res.redirect('/auth/login');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const redirect = process.env.DISCORD_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/discord/callback`;
  const url = `https://discord.com/api/oauth2/authorize?client_id=${cid}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=identify%20email&state=${state}`;
  res.redirect(url);
});

router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.session.oauthState) {
    flash(req, 'error', 'אימות Discord נכשל');
    return res.redirect('/auth/login');
  }
  delete req.session.oauthState;
  try {
    const redirect = process.env.DISCORD_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/discord/callback`;
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect
      })
    }).then(r => r.json());
    if (!tokenRes.access_token) throw new Error('No token');
    const me = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    let user = db.getUserByDiscord(me.id);
    if (!user) {
      const username = me.global_name || me.username || `discord_${me.id.slice(0, 6)}`;
      const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null;
      user = db.createUser({
        username: uniqueUsername(username), email: me.email || null,
        discord_id: me.id, discord_username: me.username, avatar_url: avatar
      });
    }
    req.session.userId = user.id;
    flash(req, 'success', `התחברת באמצעות Discord, ${user.username}!`);
    res.redirect('/');
  } catch (e) {
    console.error('Discord OAuth error', e);
    flash(req, 'error', 'אימות Discord נכשל');
    res.redirect('/auth/login');
  }
});

// ---- CFX (Cfx.re) OAuth ----
// Cfx.re hosts a standard OAuth2 server. We support the same flow shape;
// configure CFX_CLIENT_ID/SECRET to enable.
router.get('/cfx', (req, res) => {
  const cid = process.env.CFX_CLIENT_ID;
  if (!cid) {
    flash(req, 'error', 'התחברות CFX לא מוגדרת בשרת');
    return res.redirect('/auth/login');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const redirect = process.env.CFX_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/cfx/callback`;
  const url = `https://forum.cfx.re/oauth2/authorize?client_id=${cid}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=read&state=${state}`;
  res.redirect(url);
});

router.get('/cfx/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.session.oauthState) {
    flash(req, 'error', 'אימות CFX נכשל');
    return res.redirect('/auth/login');
  }
  delete req.session.oauthState;
  try {
    const redirect = process.env.CFX_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/cfx/callback`;
    const tokenRes = await fetch('https://forum.cfx.re/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CFX_CLIENT_ID,
        client_secret: process.env.CFX_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect
      })
    }).then(r => r.json());
    if (!tokenRes.access_token) throw new Error('No token');
    const me = await fetch('https://forum.cfx.re/oauth2/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    const cfxId = String(me.id || me.sub);
    let user = db.getUserByCfx(cfxId);
    if (!user) {
      const username = me.username || me.preferred_username || `cfx_${cfxId.slice(0, 6)}`;
      user = db.createUser({
        username: uniqueUsername(username), email: me.email || null,
        cfx_id: cfxId, cfx_username: me.username || null, avatar_url: me.avatar_url || null
      });
    }
    req.session.userId = user.id;
    flash(req, 'success', `התחברת באמצעות CFX, ${user.username}!`);
    res.redirect('/');
  } catch (e) {
    console.error('CFX OAuth error', e);
    flash(req, 'error', 'אימות CFX נכשל');
    res.redirect('/auth/login');
  }
});

function uniqueUsername(base) {
  let candidate = base;
  let i = 0;
  while (db.getUserByUsername(candidate)) {
    i++;
    candidate = `${base}${i}`;
  }
  return candidate;
}

module.exports = router;
