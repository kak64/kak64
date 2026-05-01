const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    servers: db.prepare('SELECT COUNT(*) AS c FROM servers').get().c,
    open_tickets: db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'`).get().c,
    revenue: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid'`).get().s,
    pending_revenue: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'pending'`).get().s
  };
  res.render('admin/index', { title: 'לוח בקרה', stats });
});

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.render('admin/users', { title: 'ניהול משתמשים', users });
});

router.post('/users/:id/role', (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  req.flash('success', 'תפקיד המשתמש עודכן');
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    req.flash('error', 'לא ניתן למחוק את עצמך');
    return res.redirect('/admin/users');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  req.flash('success', 'המשתמש נמחק');
  res.redirect('/admin/users');
});

router.get('/plans', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY price_monthly').all();
  res.render('admin/plans', { title: 'ניהול חבילות', plans });
});

router.post('/plans', (req, res) => {
  const { name, description, cpu, ram_gb, disk_gb, bandwidth_tb, price_monthly, os_options } = req.body;
  db.prepare(`INSERT INTO plans
    (name, description, cpu, ram_gb, disk_gb, bandwidth_tb, price_monthly, os_options)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      name, description || '', Number(cpu), Number(ram_gb), Number(disk_gb),
      Number(bandwidth_tb), Number(price_monthly),
      os_options || 'Ubuntu 22.04,Debian 12,CentOS Stream 9,Windows Server 2022'
    );
  req.flash('success', 'החבילה נוספה');
  res.redirect('/admin/plans');
});

router.post('/plans/:id/update', (req, res) => {
  const { name, description, cpu, ram_gb, disk_gb, bandwidth_tb, price_monthly, os_options, active } = req.body;
  db.prepare(`UPDATE plans SET
    name = ?, description = ?, cpu = ?, ram_gb = ?, disk_gb = ?,
    bandwidth_tb = ?, price_monthly = ?, os_options = ?, active = ?
    WHERE id = ?`).run(
      name, description || '', Number(cpu), Number(ram_gb), Number(disk_gb),
      Number(bandwidth_tb), Number(price_monthly), os_options,
      active === 'on' ? 1 : 0, req.params.id
    );
  req.flash('success', 'החבילה עודכנה');
  res.redirect('/admin/plans');
});

router.post('/plans/:id/delete', (req, res) => {
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
  req.flash('success', 'החבילה נמחקה');
  res.redirect('/admin/plans');
});

router.get('/servers', (req, res) => {
  const servers = db.prepare(`SELECT s.*, u.email AS user_email, u.full_name AS user_name, p.name AS plan_name
    FROM servers s
    JOIN users u ON u.id = s.user_id
    JOIN plans p ON p.id = s.plan_id
    ORDER BY s.created_at DESC`).all();
  res.render('admin/servers', { title: 'ניהול שרתים', servers });
});

router.get('/tickets', (req, res) => {
  const tickets = db.prepare(`SELECT t.*, u.email AS user_email, u.full_name AS user_name
    FROM tickets t JOIN users u ON u.id = t.user_id
    ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC`).all();
  res.render('admin/tickets', { title: 'פניות תמיכה', tickets });
});

router.get('/tickets/:id', (req, res) => {
  const ticket = db.prepare(`SELECT t.*, u.email AS user_email, u.full_name AS user_name
    FROM tickets t JOIN users u ON u.id = t.user_id
    WHERE t.id = ?`).get(req.params.id);
  if (!ticket) return res.redirect('/admin/tickets');
  const messages = db.prepare(`SELECT m.*, u.full_name AS author_name, u.role AS author_role
    FROM ticket_messages m JOIN users u ON u.id = m.author_id
    WHERE ticket_id = ? ORDER BY m.created_at`).all(ticket.id);
  res.render('admin/ticket', { title: ticket.subject, ticket, messages });
});

router.post('/tickets/:id/reply', (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.redirect('/admin/tickets/' + req.params.id);
  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, body);
  db.prepare(`UPDATE tickets SET status = 'answered' WHERE id = ?`).run(req.params.id);
  res.redirect('/admin/tickets/' + req.params.id);
});

router.post('/tickets/:id/close', (req, res) => {
  db.prepare(`UPDATE tickets SET status = 'closed' WHERE id = ?`).run(req.params.id);
  res.redirect('/admin/tickets');
});

module.exports = router;
