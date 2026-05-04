const express = require('express');
const bcrypt = require('bcryptjs');
const { db, BCRYPT_COST } = require('../db');

const router = express.Router();

function logAttempt(email, ip, success, ua) {
  try {
    db.prepare(`INSERT INTO login_attempts (email, ip, success, user_agent)
      VALUES (?, ?, ?, ?)`).run(email || '', ip || '', success ? 1 : 0, (ua || '').slice(0, 200));
  } catch (e) { /* non-fatal */ }
}

function recentFailures(email, minutes) {
  return db.prepare(`SELECT COUNT(*) AS c FROM login_attempts
    WHERE email = ? AND success = 0 AND created_at > datetime('now', ?)`).get(email, `-${minutes} minutes`).c;
}

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'הרשמה', form: {} });
});

router.post('/register', (req, res) => {
  const { email, password, password2, full_name, phone, company, address, city, tax_id } = req.body;
  const form = { email, full_name, phone, company, address, city, tax_id };
  const cleanEmail = (email || '').toLowerCase().trim();

  if (!cleanEmail || !password || !full_name) {
    req.flash('error', 'יש למלא את כל שדות החובה');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    req.flash('error', 'כתובת מייל לא תקינה');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (password.length < 10) {
    req.flash('error', 'הסיסמה חייבת להכיל לפחות 10 תווים');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    req.flash('error', 'הסיסמה חייבת להכיל לפחות אות אחת ומספר אחד');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (password !== password2) {
    req.flash('error', 'הסיסמאות אינן תואמות');
    return res.render('register', { title: 'הרשמה', form });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    req.flash('error', 'כתובת המייל כבר רשומה במערכת');
    return res.render('register', { title: 'הרשמה', form });
  }

  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  const result = db.prepare(`INSERT INTO users
    (email, password_hash, full_name, phone, company, address, city, tax_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      cleanEmail, hash, full_name.trim(), (phone || '').trim() || null, (company || '').trim() || null,
      (address || '').trim() || null, (city || '').trim() || null, (tax_id || '').trim() || null
    );

  req.session.regenerate(() => {
    req.session.userId = result.lastInsertRowid;
    req.flash('success', `ברוך הבא, ${full_name}! החשבון נוצר בהצלחה`);
    res.redirect('/dashboard');
  });
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/dashboard');
  res.render('login', { title: 'התחברות', layout: 'layout-auth' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').toLowerCase().trim();
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  if (recentFailures(cleanEmail, 15) >= 8) {
    logAttempt(cleanEmail, ip, false, ua);
    req.flash('error', 'יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות.');
    return res.redirect('/login');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  const valid = user && bcrypt.compareSync(password || '', user.password_hash);

  if (!valid || user.suspended) {
    logAttempt(cleanEmail, ip, false, ua);
    req.flash('error', 'פרטי ההתחברות שגויים');
    return res.redirect('/login');
  }

  logAttempt(cleanEmail, ip, true, ua);
  req.session.regenerate(() => {
    req.session.userId = user.id;
    req.flash('success', `שלום ${user.full_name}, התחברת בהצלחה`);
    res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

router.post('/stop-impersonating', (req, res) => {
  if (req.session.original_admin_id) {
    req.session.userId = req.session.original_admin_id;
    delete req.session.original_admin_id;
    req.flash('success', 'חזרת לחשבון המנהל');
  }
  res.redirect('/admin');
});

module.exports = router;
