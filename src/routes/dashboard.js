const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const servers = db.prepare('SELECT s.*, p.name AS plan_name FROM servers s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? ORDER BY s.created_at DESC').all(req.user.id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(req.user.id);
  const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(req.user.id);
  res.render('dashboard/index', { title: 'אזור אישי', servers, invoices, tickets });
});

router.get('/profile', (req, res) => {
  res.render('dashboard/profile', { title: 'הפרטים שלי' });
});

router.post('/profile', (req, res) => {
  const { full_name, phone, company, address, city, country, tax_id } = req.body;
  db.prepare(`UPDATE users SET
    full_name = ?, phone = ?, company = ?, address = ?, city = ?, country = ?, tax_id = ?
    WHERE id = ?`).run(
      full_name, phone || null, company || null, address || null, city || null,
      country || 'ישראל', tax_id || null, req.user.id
    );
  req.flash('success', 'הפרטים עודכנו בהצלחה');
  res.redirect('/dashboard/profile');
});

router.post('/profile/password', (req, res) => {
  const { current_password, new_password, new_password2 } = req.body;
  if (!bcrypt.compareSync(current_password || '', req.user.password_hash)) {
    req.flash('error', 'הסיסמה הנוכחית שגויה');
    return res.redirect('/dashboard/profile');
  }
  if (!new_password || new_password.length < 8) {
    req.flash('error', 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
    return res.redirect('/dashboard/profile');
  }
  if (new_password !== new_password2) {
    req.flash('error', 'הסיסמאות אינן תואמות');
    return res.redirect('/dashboard/profile');
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  req.flash('success', 'הסיסמה עודכנה בהצלחה');
  res.redirect('/dashboard/profile');
});

module.exports = router;
