const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { requireAuth } = require('../middleware');
const { randomToken, hashToken } = require('../crypto');

const router = express.Router();
router.use(requireAuth);

// === TASKS (audit feed for user) ===
router.get('/tasks', (req, res) => {
  const tasks = db.prepare(`SELECT a.*, s.hostname FROM server_actions a
    JOIN servers s ON s.id = a.server_id
    WHERE s.user_id = ?
    ORDER BY a.created_at DESC LIMIT 100`).all(req.user.id);
  res.render('dashboard/tasks', { title: 'משימות ופעולות', tasks });
});

// === SSH KEYS ===
function fingerprintOf(publicKey) {
  try {
    const parts = publicKey.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const blob = Buffer.from(parts[1], 'base64');
    const hash = crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
    return 'SHA256:' + hash;
  } catch (e) {
    return null;
  }
}

router.get('/ssh-keys', (req, res) => {
  const keys = db.prepare('SELECT * FROM ssh_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.render('dashboard/ssh-keys', { title: 'מפתחות SSH', keys });
});

router.post('/ssh-keys', (req, res) => {
  const label = (req.body.label || '').trim();
  const publicKey = (req.body.public_key || '').trim();
  if (!label || !publicKey) {
    req.flash('error', 'יש להזין שם וטקסט מפתח');
    return res.redirect('/dashboard/ssh-keys');
  }
  if (publicKey.length > 8192) {
    req.flash('error', 'מפתח ארוך מדי');
    return res.redirect('/dashboard/ssh-keys');
  }
  if (!/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-)/.test(publicKey)) {
    req.flash('error', 'פורמט מפתח לא נתמך. השתמש ב-ssh-rsa / ssh-ed25519 / ecdsa-sha2-*');
    return res.redirect('/dashboard/ssh-keys');
  }
  const fp = fingerprintOf(publicKey);
  if (!fp) {
    req.flash('error', 'מפתח SSH לא תקין');
    return res.redirect('/dashboard/ssh-keys');
  }
  db.prepare('INSERT INTO ssh_keys (user_id, label, public_key, fingerprint) VALUES (?, ?, ?, ?)')
    .run(req.user.id, label, publicKey, fp);
  req.flash('success', 'מפתח SSH נוסף');
  res.redirect('/dashboard/ssh-keys');
});

router.post('/ssh-keys/:id/delete', (req, res) => {
  db.prepare('DELETE FROM ssh_keys WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  req.flash('success', 'מפתח SSH נמחק');
  res.redirect('/dashboard/ssh-keys');
});

// === API TOKENS ===
router.get('/api', (req, res) => {
  const tokens = db.prepare(`SELECT id, label, token_prefix, last_used_at, revoked_at, created_at
    FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`).all(req.user.id);
  const newToken = req.session.lastApiToken || null;
  delete req.session.lastApiToken;
  res.render('dashboard/api', { title: 'API Credentials', tokens, newToken });
});

router.post('/api', (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) {
    req.flash('error', 'יש להזין שם לטוקן');
    return res.redirect('/dashboard/api');
  }
  const activeCount = db.prepare(`SELECT COUNT(*) AS c FROM api_tokens
    WHERE user_id = ? AND revoked_at IS NULL`).get(req.user.id).c;
  if (activeCount >= 10) {
    req.flash('error', 'הגעת למקסימום של 10 טוקנים פעילים. בטל אחד לפני יצירת חדש.');
    return res.redirect('/dashboard/api');
  }
  const raw = 'fil_' + randomToken(24);
  const prefix = raw.slice(0, 12);
  const hash = hashToken(raw);
  db.prepare(`INSERT INTO api_tokens (user_id, label, token_hash, token_prefix)
    VALUES (?, ?, ?, ?)`).run(req.user.id, label, hash, prefix);
  req.session.lastApiToken = raw;
  req.flash('success', 'טוקן חדש נוצר. שמור אותו עכשיו - לא תוכל לראות אותו שוב.');
  res.redirect('/dashboard/api');
});

router.post('/api/:id/revoke', (req, res) => {
  db.prepare(`UPDATE api_tokens SET revoked_at = datetime('now')
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).run(req.params.id, req.user.id);
  req.flash('success', 'הטוקן בוטל');
  res.redirect('/dashboard/api');
});

router.post('/api/:id/delete', (req, res) => {
  db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  req.flash('success', 'הטוקן נמחק');
  res.redirect('/dashboard/api');
});

// === SETTINGS (preferences) ===
router.get('/settings', (req, res) => {
  res.render('dashboard/settings', { title: 'הגדרות' });
});

// === FIREWALL (placeholder) ===
router.get('/firewall', (req, res) => {
  const servers = db.prepare(`SELECT s.id, s.hostname, s.ip_address, s.os
    FROM servers s WHERE s.user_id = ? AND s.cancelled_at IS NULL
    ORDER BY s.created_at DESC`).all(req.user.id);
  res.render('dashboard/firewall', { title: 'Firewall', servers });
});

// === BACKUP (placeholder) ===
router.get('/backup', (req, res) => {
  const servers = db.prepare(`SELECT s.id, s.hostname, s.ip_address, s.os
    FROM servers s WHERE s.user_id = ? AND s.cancelled_at IS NULL
    ORDER BY s.created_at DESC`).all(req.user.id);
  res.render('dashboard/backup', { title: 'Backups', servers });
});

// === SECURITY: recent login activity ===
router.get('/security', (req, res) => {
  const attempts = db.prepare(`SELECT * FROM login_attempts
    WHERE email = ? ORDER BY created_at DESC LIMIT 20`).all(req.user.email);
  const tokens = db.prepare(`SELECT id, label, token_prefix, last_used_at, revoked_at, created_at
    FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(req.user.id);
  res.render('dashboard/security', { title: 'אבטחה', attempts, tokens });
});

module.exports = router;
