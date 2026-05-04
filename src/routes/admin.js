const express = require('express');
const bcrypt = require('bcryptjs');
const { db, BCRYPT_COST, getServerWithDecryptedPassword, encryptForStorage } = require('../db');
const { requireAdmin } = require('../middleware');
const esxi = require('../esxi');
const { connectionInfo, isWindows, defaultUsername } = require('../connection');
const { generateRootPassword } = require('../crypto');

const router = express.Router();
router.use(requireAdmin);

function logAction(serverId, adminId, action, details) {
  db.prepare(`INSERT INTO server_actions (server_id, admin_id, action, details)
    VALUES (?, ?, ?, ?)`).run(serverId, adminId, action, details || null);
}

function generatePassword() {
  return generateRootPassword(16);
}

router.get('/', (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    active_users: db.prepare('SELECT COUNT(*) AS c FROM users WHERE suspended = 0').get().c,
    servers: db.prepare('SELECT COUNT(*) AS c FROM servers').get().c,
    active_servers: db.prepare(`SELECT COUNT(*) AS c FROM servers WHERE cancelled_at IS NULL AND suspended_at IS NULL`).get().c,
    suspended_servers: db.prepare(`SELECT COUNT(*) AS c FROM servers WHERE suspended_at IS NOT NULL`).get().c,
    open_tickets: db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'`).get().c,
    revenue: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'paid'`).get().s,
    pending_revenue: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE status = 'pending'`).get().s,
    expiring_soon: db.prepare(`SELECT COUNT(*) AS c FROM servers
      WHERE cancelled_at IS NULL AND expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime('now', '+7 days')`).get().c
  };
  const recent_actions = db.prepare(`SELECT a.*, s.hostname, u.full_name AS admin_name
    FROM server_actions a
    LEFT JOIN servers s ON s.id = a.server_id
    LEFT JOIN users u ON u.id = a.admin_id
    ORDER BY a.created_at DESC LIMIT 10`).all();
  res.render('admin/index', { title: 'לוח בקרה', stats, recent_actions });
});

// === USERS ===

router.get('/users', (req, res) => {
  const q = (req.query.q || '').trim();
  let users;
  if (q) {
    users = db.prepare(`SELECT * FROM users
      WHERE email LIKE ? OR full_name LIKE ? OR phone LIKE ? OR company LIKE ?
      ORDER BY created_at DESC`).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  }
  res.render('admin/users', { title: 'ניהול משתמשים', users, q });
});

router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/admin/users');
  const servers = db.prepare(`SELECT s.*, p.name AS plan_name FROM servers s
    JOIN plans p ON p.id = s.plan_id WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
  const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
  const transactions = db.prepare(`SELECT t.*, a.full_name AS admin_name
    FROM balance_transactions t LEFT JOIN users a ON a.id = t.admin_id
    WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 20`).all(user.id);
  res.render('admin/user', { title: user.full_name, profile: user, servers, invoices, tickets, transactions });
});

router.post('/users/:id/role', (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  req.flash('success', 'תפקיד המשתמש עודכן');
  res.redirect('back');
});

router.post('/users/:id/suspend', (req, res) => {
  const action = req.body.action === 'unsuspend' ? 0 : 1;
  db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(action, req.params.id);
  req.flash('success', action ? 'המשתמש הושעה' : 'ההשעיה בוטלה');
  res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/reset-password', (req, res) => {
  const pw = (req.body.new_password || '').trim();
  if (pw.length < 8) {
    req.flash('error', 'סיסמה חייבת להיות לפחות 8 תווים');
    return res.redirect('/admin/users/' + req.params.id);
  }
  const hash = bcrypt.hashSync(pw, BCRYPT_COST);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  req.flash('success', `הסיסמה אופסה: ${pw}`);
  res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/balance', (req, res) => {
  const amount = parseFloat(req.body.amount);
  const reason = (req.body.reason || '').trim();
  if (isNaN(amount) || amount === 0) {
    req.flash('error', 'יש להזין סכום תקין');
    return res.redirect('/admin/users/' + req.params.id);
  }
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.params.id);
  db.prepare(`INSERT INTO balance_transactions (user_id, admin_id, amount, reason)
    VALUES (?, ?, ?, ?)`).run(req.params.id, req.user.id, amount, reason);
  req.flash('success', `יתרה עודכנה ב-${amount.toFixed(2)} ₪`);
  res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/note', (req, res) => {
  db.prepare('UPDATE users SET admin_notes = ? WHERE id = ?')
    .run(req.body.notes || '', req.params.id);
  req.flash('success', 'הערה נשמרה');
  res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/impersonate', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/admin/users');
  req.session.original_admin_id = req.user.id;
  req.session.userId = user.id;
  req.flash('info', `מתחזה ל-${user.full_name}. לחזרה - לחץ "חזרה לחשבון מנהל"`);
  res.redirect('/dashboard');
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

// === PLANS ===

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

// === SERVERS ===

router.get('/servers', (req, res) => {
  const filter = req.query.status || 'all';
  let where = '1=1';
  if (filter === 'active') where = 's.cancelled_at IS NULL AND s.suspended_at IS NULL';
  else if (filter === 'suspended') where = 's.suspended_at IS NOT NULL';
  else if (filter === 'cancelled') where = 's.cancelled_at IS NOT NULL';
  else if (filter === 'expiring') where = `s.cancelled_at IS NULL AND s.expires_at IS NOT NULL AND datetime(s.expires_at) <= datetime('now', '+7 days')`;

  const servers = db.prepare(`SELECT s.*, u.email AS user_email, u.full_name AS user_name, p.name AS plan_name, p.price_monthly
    FROM servers s
    JOIN users u ON u.id = s.user_id
    JOIN plans p ON p.id = s.plan_id
    WHERE ${where}
    ORDER BY s.created_at DESC`).all();
  res.render('admin/servers', { title: 'ניהול שרתים', servers, filter });
});

router.get('/servers/new', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  const users = db.prepare('SELECT id, email, full_name FROM users WHERE role = ? ORDER BY full_name').all('user');
  const selectedUserId = req.query.user || '';
  res.render('admin/server-new', { title: 'יצירת שרת חדש', plans, users, selectedUserId });
});

router.post('/servers/new', async (req, res) => {
  const { user_id, plan_id, hostname, os, root_password, months, bill_now } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!user || !plan) {
    req.flash('error', 'משתמש או חבילה לא תקינים');
    return res.redirect('/admin/servers/new');
  }
  if (!hostname || !/^[a-zA-Z0-9.-]{2,63}$/.test(hostname)) {
    req.flash('error', 'שם שרת לא תקין');
    return res.redirect('/admin/servers/new');
  }
  const pw = (root_password || '').trim() || generatePassword();
  let prov;
  try {
    prov = await esxi.provisionVm({ hostname, cpu: plan.cpu, ramGb: plan.ram_gb, diskGb: plan.disk_gb, os, rootPassword: pw });
  } catch (e) {
    prov = { esxi_vm_id: null, ip_address: null, mocked: true };
  }
  const monthsNum = Math.max(1, parseInt(months || '1', 10));
  const expires = new Date();
  expires.setMonth(expires.getMonth() + monthsNum);

  const result = db.prepare(`INSERT INTO servers
    (user_id, plan_id, hostname, os, root_password, status, esxi_vm_id, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      user.id, plan.id, hostname, os, encryptForStorage(pw),
      prov.mocked ? 'pending_setup' : 'running',
      prov.esxi_vm_id, prov.ip_address, expires.toISOString()
    );

  if (bill_now === 'on') {
    db.prepare(`INSERT INTO invoices (user_id, server_id, amount, description)
      VALUES (?, ?, ?, ?)`).run(
        user.id, result.lastInsertRowid, plan.price_monthly * monthsNum,
        `שרת ${hostname} - חבילת ${plan.name} (${monthsNum} חודשים)`
      );
  }

  logAction(result.lastInsertRowid, req.user.id, 'created', `Plan: ${plan.name}, OS: ${os}, ${monthsNum} months${bill_now === 'on' ? ', billed' : ', no charge'}`);
  req.flash('success', `שרת נוצר עבור ${user.full_name}`);
  res.redirect('/admin/servers/' + result.lastInsertRowid);
});

router.get('/servers/:id', (req, res) => {
  let server = db.prepare(`SELECT s.*, u.email AS user_email, u.full_name AS user_name, u.id AS owner_id,
      p.name AS plan_name, p.cpu, p.ram_gb, p.disk_gb, p.bandwidth_tb, p.price_monthly
    FROM servers s
    JOIN users u ON u.id = s.user_id
    JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ?`).get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  server = getServerWithDecryptedPassword(server);
  const actions = db.prepare(`SELECT a.*, u.full_name AS admin_name FROM server_actions a
    LEFT JOIN users u ON u.id = a.admin_id
    WHERE server_id = ? ORDER BY a.created_at DESC LIMIT 50`).all(server.id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE server_id = ? ORDER BY created_at DESC').all(server.id);
  const conn = connectionInfo(server);
  res.render('admin/server', { title: `שרת ${server.hostname}`, server, actions, invoices, conn });
});

router.get('/servers/:id/rdp', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server || !isWindows(server.os) || !server.ip_address) {
    req.flash('error', 'קובץ RDP זמין רק לשרתי Windows');
    return res.redirect('/admin/servers/' + (server ? server.id : ''));
  }
  const username = defaultUsername(server.os);
  const rdp = [
    `full address:s:${server.ip_address}:3389`,
    `username:s:${username}`,
    'prompt for credentials:i:0',
    'authentication level:i:0',
    'enablecredsspsupport:i:1',
    'screen mode id:i:2',
    'desktopwidth:i:1920',
    'desktopheight:i:1080',
    'session bpp:i:32',
    'redirectclipboard:i:1'
  ].join('\r\n');
  res.setHeader('Content-Type', 'application/rdp');
  res.setHeader('Content-Disposition', `attachment; filename="${server.hostname}.rdp"`);
  res.send(rdp);
});

router.post('/servers/:id/power', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const action = req.body.action;
  try {
    if (action === 'start') {
      await esxi.powerOn(server.esxi_vm_id);
      db.prepare('UPDATE servers SET status = ? WHERE id = ?').run('running', server.id);
      logAction(server.id, req.user.id, 'power_on');
      req.flash('success', 'השרת הופעל');
    } else if (action === 'stop') {
      await esxi.powerOff(server.esxi_vm_id);
      db.prepare('UPDATE servers SET status = ? WHERE id = ?').run('stopped', server.id);
      logAction(server.id, req.user.id, 'power_off');
      req.flash('success', 'השרת כובה');
    } else if (action === 'reboot') {
      await esxi.reboot(server.esxi_vm_id);
      logAction(server.id, req.user.id, 'reboot');
      req.flash('success', 'השרת מאותחל');
    }
  } catch (e) {
    req.flash('error', 'הפעולה נכשלה: ' + e.message);
  }
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/change-root-password', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const pw = (req.body.new_password || '').trim() || generatePassword();
  if (pw.length < 8) {
    req.flash('error', 'סיסמה חייבת להיות לפחות 8 תווים');
    return res.redirect('/admin/servers/' + server.id);
  }
  db.prepare('UPDATE servers SET root_password = ? WHERE id = ?').run(encryptForStorage(pw), server.id);
  logAction(server.id, req.user.id, 'change_root_password', 'New password set');
  req.flash('success', `סיסמת root עודכנה: ${pw}`);
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/extend', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const months = parseInt(req.body.months || '1', 10);
  const baseDate = server.expires_at ? new Date(server.expires_at) : new Date();
  const newDate = baseDate < new Date() ? new Date() : baseDate;
  newDate.setMonth(newDate.getMonth() + months);
  db.prepare('UPDATE servers SET expires_at = ?, cancelled_at = NULL WHERE id = ?')
    .run(newDate.toISOString(), server.id);
  logAction(server.id, req.user.id, 'extend', `+${months} months → ${newDate.toISOString().split('T')[0]}`);
  req.flash('success', `השרת הוארך ב-${months} חודשים`);
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/expiry', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const date = req.body.expires_at;
  if (!date) {
    req.flash('error', 'יש לבחור תאריך');
    return res.redirect('/admin/servers/' + server.id);
  }
  const iso = new Date(date).toISOString();
  db.prepare('UPDATE servers SET expires_at = ? WHERE id = ?').run(iso, server.id);
  logAction(server.id, req.user.id, 'set_expiry', `Set to ${date}`);
  req.flash('success', 'תאריך פקיעה עודכן');
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/cancel', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const mode = req.body.mode; // 'immediate' | 'end_of_period'
  if (mode === 'immediate') {
    try { if (server.esxi_vm_id) await esxi.destroy(server.esxi_vm_id); } catch (e) {}
    db.prepare(`UPDATE servers SET status = 'cancelled', cancelled_at = datetime('now'), auto_renew = 0 WHERE id = ?`).run(server.id);
    logAction(server.id, req.user.id, 'cancel_immediate', 'Server destroyed');
    req.flash('success', 'השרת בוטל ונמחק מיידית');
  } else {
    db.prepare(`UPDATE servers SET cancelled_at = datetime('now'), auto_renew = 0 WHERE id = ?`).run(server.id);
    logAction(server.id, req.user.id, 'cancel_end_of_period', 'Will not auto-renew');
    req.flash('success', 'השרת יבוטל בסוף תקופת התשלום (לא יחויב בחודש הבא)');
  }
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/uncancel', (req, res) => {
  db.prepare(`UPDATE servers SET cancelled_at = NULL, auto_renew = 1 WHERE id = ?`).run(req.params.id);
  logAction(req.params.id, req.user.id, 'uncancel');
  req.flash('success', 'הביטול בוטל - השרת ימשיך להתחדש');
  res.redirect('/admin/servers/' + req.params.id);
});

router.post('/servers/:id/suspend', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  if (server.suspended_at) {
    db.prepare(`UPDATE servers SET suspended_at = NULL, status = 'running' WHERE id = ?`).run(server.id);
    logAction(server.id, req.user.id, 'unsuspend');
    req.flash('success', 'ההשעיה בוטלה');
  } else {
    db.prepare(`UPDATE servers SET suspended_at = datetime('now'), status = 'suspended' WHERE id = ?`).run(server.id);
    logAction(server.id, req.user.id, 'suspend', req.body.reason || '');
    req.flash('success', 'השרת הושעה');
  }
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/auto-renew', (req, res) => {
  const enable = req.body.enable === '1' ? 1 : 0;
  db.prepare('UPDATE servers SET auto_renew = ? WHERE id = ?').run(enable, req.params.id);
  logAction(req.params.id, req.user.id, enable ? 'enable_auto_renew' : 'disable_auto_renew');
  req.flash('success', enable ? 'חידוש אוטומטי הופעל' : 'חידוש אוטומטי בוטל - לא יחויב בחודש הבא');
  res.redirect('/admin/servers/' + req.params.id);
});

router.post('/servers/:id/note', (req, res) => {
  db.prepare('UPDATE servers SET admin_notes = ? WHERE id = ?')
    .run(req.body.notes || '', req.params.id);
  logAction(req.params.id, req.user.id, 'note_updated');
  req.flash('success', 'הערה נשמרה');
  res.redirect('/admin/servers/' + req.params.id);
});

router.post('/servers/:id/invoice', (req, res) => {
  const server = db.prepare(`SELECT s.*, p.name AS plan_name, p.price_monthly
    FROM servers s JOIN plans p ON p.id = s.plan_id WHERE s.id = ?`).get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  const amount = parseFloat(req.body.amount) || server.price_monthly;
  const description = req.body.description || `שרת ${server.hostname} - חידוש חודשי`;
  db.prepare(`INSERT INTO invoices (user_id, server_id, amount, description)
    VALUES (?, ?, ?, ?)`).run(server.user_id, server.id, amount, description);
  logAction(server.id, req.user.id, 'create_invoice', `Amount: ${amount} ₪`);
  req.flash('success', 'חשבונית נוצרה');
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/mark-paid', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  db.prepare(`UPDATE invoices SET status = 'paid', paid_at = datetime('now')
    WHERE server_id = ? AND status = 'pending'`).run(server.id);
  logAction(server.id, req.user.id, 'mark_invoices_paid');
  req.flash('success', 'כל החשבוניות הפתוחות סומנו כשולמו');
  res.redirect('/admin/servers/' + server.id);
});

router.post('/servers/:id/delete', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.redirect('/admin/servers');
  try { if (server.esxi_vm_id) await esxi.destroy(server.esxi_vm_id); } catch (e) {}
  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
  req.flash('success', 'השרת נמחק לצמיתות');
  res.redirect('/admin/servers');
});

// === TICKETS ===

router.get('/tickets', (req, res) => {
  const filter = req.query.status || 'open';
  let where = '1=1';
  if (filter === 'open') where = "t.status = 'open'";
  else if (filter === 'answered') where = "t.status = 'answered'";
  else if (filter === 'closed') where = "t.status = 'closed'";
  const tickets = db.prepare(`SELECT t.*, u.email AS user_email, u.full_name AS user_name,
      (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) AS msg_count
    FROM tickets t JOIN users u ON u.id = t.user_id
    WHERE ${where}
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.created_at DESC`).all();
  res.render('admin/tickets', { title: 'פניות תמיכה', tickets, filter });
});

router.get('/tickets/:id', (req, res) => {
  const ticket = db.prepare(`SELECT t.*, u.email AS user_email, u.full_name AS user_name, u.id AS user_id
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
  const isInternal = req.body.internal === 'on' ? 1 : 0;
  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body, is_internal) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.user.id, body, isInternal);
  if (!isInternal) {
    db.prepare(`UPDATE tickets SET status = 'answered' WHERE id = ?`).run(req.params.id);
  }
  res.redirect('/admin/tickets/' + req.params.id);
});

router.post('/tickets/:id/priority', (req, res) => {
  const p = req.body.priority;
  if (['low', 'normal', 'high', 'urgent'].includes(p)) {
    db.prepare('UPDATE tickets SET priority = ? WHERE id = ?').run(p, req.params.id);
  }
  res.redirect('/admin/tickets/' + req.params.id);
});

router.post('/tickets/:id/close', (req, res) => {
  db.prepare(`UPDATE tickets SET status = 'closed' WHERE id = ?`).run(req.params.id);
  res.redirect('/admin/tickets');
});

router.post('/tickets/:id/reopen', (req, res) => {
  db.prepare(`UPDATE tickets SET status = 'open' WHERE id = ?`).run(req.params.id);
  res.redirect('/admin/tickets/' + req.params.id);
});

// === ESXi MANAGEMENT ===
router.get('/esxi', async (req, res) => {
  let status = 'unconfigured';
  let info = null;
  let vms = [];
  let error = null;

  if (esxi.isConfigured()) {
    try {
      const ver = await esxi.ping();
      info = ver;
      status = 'connected';
      vms = await esxi.listVms();
      // Annotate which VMs are already linked
      const linked = db.prepare('SELECT esxi_vm_id, hostname FROM servers WHERE esxi_vm_id IS NOT NULL').all();
      const linkedMap = new Map(linked.map(s => [String(s.esxi_vm_id), s.hostname]));
      vms = vms.map(v => ({
        ...v,
        linked_to: linkedMap.get(String(v.vmid)) || null
      }));
    } catch (e) {
      status = 'error';
      error = e.message;
    }
  }

  const users = db.prepare('SELECT id, email, full_name FROM users WHERE role = ? ORDER BY full_name').all('user');
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  res.render('admin/esxi', { title: 'ניהול ESXi', status, info, vms, error, users, plans, host: process.env.ESXI_HOST });
});

router.post('/esxi/test', async (req, res) => {
  try {
    const ver = await esxi.ping();
    req.flash('success', 'חיבור הצליח: ' + ver);
  } catch (e) {
    req.flash('error', 'חיבור נכשל: ' + e.message);
  }
  res.redirect('/admin/esxi');
});

router.post('/esxi/refresh-state/:vmid', async (req, res) => {
  try {
    const state = await esxi.getPowerState(req.params.vmid);
    const guest = await esxi.getGuestInfo(req.params.vmid);
    db.prepare(`UPDATE servers SET status = ?, ip_address = COALESCE(?, ip_address)
      WHERE esxi_vm_id = ?`).run(state, guest.ip, String(req.params.vmid));
    req.flash('success', `סטטוס: ${state}, IP: ${guest.ip || 'לא זמין'}`);
  } catch (e) {
    req.flash('error', 'נכשל: ' + e.message);
  }
  res.redirect('back');
});

router.get('/esxi/import/:vmid', async (req, res) => {
  const vmid = req.params.vmid;
  let vmInfo = null;
  let guest = null;
  if (esxi.isConfigured()) {
    try {
      const all = await esxi.listVms();
      vmInfo = all.find(v => String(v.vmid) === String(vmid));
      guest = await esxi.getGuestInfo(vmid);
    } catch (e) { /* ignore */ }
  }
  if (!vmInfo) {
    req.flash('error', 'VM לא נמצא ב-ESXi');
    return res.redirect('/admin/esxi');
  }
  const users = db.prepare('SELECT id, email, full_name FROM users WHERE role = ? ORDER BY full_name').all('user');
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  res.render('admin/esxi-import', {
    title: 'ייבוא VM קיים',
    vm: vmInfo, guest, users, plans
  });
});

router.post('/esxi/import', async (req, res) => {
  const { vmid, user_id, plan_id, hostname, os, root_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!user || !plan || !vmid) {
    req.flash('error', 'נתונים חסרים');
    return res.redirect('/admin/esxi');
  }
  const existing = db.prepare('SELECT id FROM servers WHERE esxi_vm_id = ?').get(String(vmid));
  if (existing) {
    req.flash('error', `VM זה כבר משויך לשרת #${existing.id}`);
    return res.redirect('/admin/esxi');
  }

  let state = 'unknown';
  let ip = null;
  try {
    state = await esxi.getPowerState(vmid);
    const guest = await esxi.getGuestInfo(vmid);
    ip = guest.ip;
  } catch (e) { /* live data unavailable, proceed */ }

  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const result = db.prepare(`INSERT INTO servers
    (user_id, plan_id, hostname, os, root_password, status, esxi_vm_id, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      user.id, plan.id, hostname, os || 'Unknown',
      encryptForStorage(root_password || ''),
      state, String(vmid), ip,
      expires.toISOString()
    );
  logAction(result.lastInsertRowid, req.user.id, 'imported_from_esxi', `VM ID ${vmid}`);
  req.flash('success', `VM ${vmid} יובא בהצלחה ושויך ל-${user.full_name}`);
  res.redirect('/admin/servers/' + result.lastInsertRowid);
});

router.post('/esxi/sync-all', async (req, res) => {
  if (!esxi.isConfigured()) {
    req.flash('error', 'ESXi לא מוגדר');
    return res.redirect('/admin/esxi');
  }
  let updated = 0;
  let failed = 0;
  const servers = db.prepare('SELECT id, esxi_vm_id FROM servers WHERE esxi_vm_id IS NOT NULL').all();
  for (const s of servers) {
    try {
      const state = await esxi.getPowerState(s.esxi_vm_id);
      const guest = await esxi.getGuestInfo(s.esxi_vm_id);
      db.prepare(`UPDATE servers SET status = ?, ip_address = COALESCE(?, ip_address)
        WHERE id = ?`).run(state, guest.ip, s.id);
      updated++;
    } catch (e) {
      failed++;
    }
  }
  req.flash('success', `סונכרנו ${updated} שרתים${failed ? `, ${failed} נכשלו` : ''}`);
  res.redirect('/admin/esxi');
});

module.exports = router;
