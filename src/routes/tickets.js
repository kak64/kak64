const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.render('dashboard/tickets', { title: 'פניות תמיכה', tickets });
});

router.get('/new', (req, res) => {
  res.render('dashboard/ticket-new', { title: 'פנייה חדשה' });
});

router.post('/new', (req, res) => {
  const { subject, body, priority } = req.body;
  if (!subject || !body) {
    req.flash('error', 'יש למלא נושא ותוכן הפנייה');
    return res.redirect('/dashboard/tickets/new');
  }
  const result = db.prepare('INSERT INTO tickets (user_id, subject, priority) VALUES (?, ?, ?)')
    .run(req.user.id, subject, priority || 'normal');
  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES (?, ?, ?)')
    .run(result.lastInsertRowid, req.user.id, body);
  req.flash('success', 'הפנייה נשלחה. נחזור אליך בהקדם.');
  res.redirect('/dashboard/tickets/' + result.lastInsertRowid);
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ticket) {
    req.flash('error', 'הפנייה לא נמצאה');
    return res.redirect('/dashboard/tickets');
  }
  const messages = db.prepare(`SELECT m.*, u.full_name AS author_name, u.role AS author_role
    FROM ticket_messages m JOIN users u ON u.id = m.author_id
    WHERE ticket_id = ? ORDER BY m.created_at`).all(ticket.id);
  res.render('dashboard/ticket', { title: ticket.subject, ticket, messages });
});

router.post('/:id/reply', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ticket) return res.redirect('/dashboard/tickets');
  const body = (req.body.body || '').trim();
  if (!body) {
    req.flash('error', 'הודעה ריקה');
    return res.redirect('/dashboard/tickets/' + ticket.id);
  }
  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES (?, ?, ?)')
    .run(ticket.id, req.user.id, body);
  db.prepare(`UPDATE tickets SET status = 'open' WHERE id = ?`).run(ticket.id);
  res.redirect('/dashboard/tickets/' + ticket.id);
});

router.post('/:id/close', (req, res) => {
  db.prepare(`UPDATE tickets SET status = 'closed' WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.user.id);
  req.flash('success', 'הפנייה נסגרה');
  res.redirect('/dashboard/tickets');
});

module.exports = router;
