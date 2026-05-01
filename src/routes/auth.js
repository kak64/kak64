const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'הרשמה', form: {} });
});

router.post('/register', (req, res) => {
  const { email, password, password2, full_name, phone, company, address, city, tax_id } = req.body;
  const form = { email, full_name, phone, company, address, city, tax_id };

  if (!email || !password || !full_name) {
    req.flash('error', 'יש למלא את כל שדות החובה');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (password.length < 8) {
    req.flash('error', 'הסיסמה חייבת להכיל לפחות 8 תווים');
    return res.render('register', { title: 'הרשמה', form });
  }
  if (password !== password2) {
    req.flash('error', 'הסיסמאות אינן תואמות');
    return res.render('register', { title: 'הרשמה', form });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    req.flash('error', 'כתובת המייל כבר רשומה במערכת');
    return res.render('register', { title: 'הרשמה', form });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`INSERT INTO users
    (email, password_hash, full_name, phone, company, address, city, tax_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      email.toLowerCase(), hash, full_name, phone || null, company || null,
      address || null, city || null, tax_id || null
    );

  req.session.userId = result.lastInsertRowid;
  req.flash('success', 'ברוך הבא! החשבון שלך נוצר בהצלחה');
  res.redirect('/dashboard');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'התחברות' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    req.flash('error', 'פרטי ההתחברות שגויים');
    return res.redirect('/login');
  }

  req.session.userId = user.id;
  req.flash('success', `שלום ${user.full_name}, התחברת בהצלחה`);
  res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
