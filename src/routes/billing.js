const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.render('dashboard/billing', { title: 'חשבוניות ותשלומים', invoices });
});

router.get('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!invoice) {
    req.flash('error', 'החשבונית לא נמצאה');
    return res.redirect('/dashboard/billing');
  }
  res.render('dashboard/invoice', { title: `חשבונית #${invoice.id}`, invoice });
});

router.post('/:id/pay', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!invoice) return res.redirect('/dashboard/billing');
  if (invoice.status === 'paid') {
    req.flash('info', 'החשבונית כבר שולמה');
    return res.redirect('/dashboard/billing/' + invoice.id);
  }
  db.prepare(`UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(invoice.id);
  if (invoice.server_id) {
    db.prepare(`UPDATE servers SET status = 'running' WHERE id = ? AND status = 'pending_setup'`).run(invoice.server_id);
  }
  req.flash('success', 'התשלום בוצע בהצלחה (סימולציה - יש לחבר מערכת סליקה אמיתית)');
  res.redirect('/dashboard/billing/' + invoice.id);
});

module.exports = router;
