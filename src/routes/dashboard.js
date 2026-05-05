const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, flash } = require('../middleware');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const orders = db.listOrdersForUser(req.user.id);
  res.render('dashboard/index', { title: 'אזור אישי', orders });
});

router.get('/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order || order.user_id !== req.user.id) {
    return res.status(404).render('error', { title: '404', message: 'הזמנה לא נמצאה' });
  }
  res.render('dashboard/order', { title: `הזמנה #${order.id}`, order });
});

router.get('/profile', (req, res) => {
  res.render('dashboard/profile', { title: 'פרופיל' });
});

router.post('/profile', (req, res) => {
  const { username, email, password, password2 } = req.body;
  if (!username) {
    flash(req, 'error', 'יש להזין שם משתמש');
    return res.redirect('/dashboard/profile');
  }
  const existing = db.getUserByUsername(username);
  if (existing && existing.id !== req.user.id) {
    flash(req, 'error', 'שם המשתמש תפוס');
    return res.redirect('/dashboard/profile');
  }
  db.updateUser(req.user.id, { username, email, avatar_url: req.user.avatar_url });
  if (password) {
    if (password.length < 6) {
      flash(req, 'error', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return res.redirect('/dashboard/profile');
    }
    if (password !== password2) {
      flash(req, 'error', 'הסיסמאות אינן תואמות');
      return res.redirect('/dashboard/profile');
    }
    const hash = bcrypt.hashSync(password, 10);
    db.raw.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  }
  flash(req, 'success', 'הפרופיל עודכן');
  res.redirect('/dashboard/profile');
});

module.exports = router;
