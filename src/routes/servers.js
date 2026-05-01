const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { requireAuth } = require('../middleware');
const esxi = require('../esxi');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const servers = db.prepare(`SELECT s.*, p.name AS plan_name, p.cpu, p.ram_gb, p.disk_gb
    FROM servers s JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ? ORDER BY s.created_at DESC`).all(req.user.id);
  res.render('dashboard/servers', { title: 'השרתים שלי', servers });
});

router.get('/order', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  res.render('dashboard/order', { title: 'הזמנת שרת חדש', plans, selectedPlanId: req.query.plan });
});

router.post('/order', async (req, res) => {
  const { plan_id, hostname, os, root_password } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) {
    req.flash('error', 'החבילה שנבחרה אינה קיימת');
    return res.redirect('/dashboard/servers/order');
  }
  if (!hostname || !/^[a-zA-Z0-9.-]{2,63}$/.test(hostname)) {
    req.flash('error', 'יש להזין שם שרת תקין (אותיות באנגלית, מספרים, מקפים)');
    return res.redirect('/dashboard/servers/order');
  }
  if (!root_password || root_password.length < 8) {
    req.flash('error', 'יש להזין סיסמת root תקינה (לפחות 8 תווים)');
    return res.redirect('/dashboard/servers/order');
  }

  let provisioning;
  try {
    provisioning = await esxi.provisionVm({
      hostname,
      cpu: plan.cpu,
      ramGb: plan.ram_gb,
      diskGb: plan.disk_gb,
      os,
      rootPassword: root_password
    });
  } catch (err) {
    console.error('ESXi provision failed:', err.message);
    provisioning = { esxi_vm_id: null, ip_address: null, mocked: true };
  }

  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const result = db.prepare(`INSERT INTO servers
    (user_id, plan_id, hostname, os, root_password, status, esxi_vm_id, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, plan.id, hostname, os, root_password,
      provisioning.mocked ? 'pending_setup' : 'running',
      provisioning.esxi_vm_id, provisioning.ip_address,
      expires.toISOString()
    );

  db.prepare(`INSERT INTO invoices (user_id, server_id, amount, description)
    VALUES (?, ?, ?, ?)`).run(
      req.user.id, result.lastInsertRowid, plan.price_monthly,
      `שרת ${hostname} - חבילת ${plan.name} (חודש ראשון)`
    );

  req.flash('success', 'השרת הוזמן בהצלחה. נשלחה חשבונית לתשלום.');
  res.redirect('/dashboard/servers/' + result.lastInsertRowid);
});

function getOwnedServer(req) {
  return db.prepare(`SELECT s.*, p.name AS plan_name, p.cpu, p.ram_gb, p.disk_gb, p.bandwidth_tb, p.price_monthly
    FROM servers s JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ? AND s.user_id = ?`).get(req.params.id, req.user.id);
}

router.get('/:id', (req, res) => {
  const server = getOwnedServer(req);
  if (!server) {
    req.flash('error', 'השרת לא נמצא');
    return res.redirect('/dashboard/servers');
  }
  res.render('dashboard/server', { title: `שרת ${server.hostname}`, server });
});

router.post('/:id/action', async (req, res) => {
  const server = getOwnedServer(req);
  if (!server) return res.redirect('/dashboard/servers');

  const action = req.body.action;
  try {
    if (action === 'start') {
      await esxi.powerOn(server.esxi_vm_id);
      db.prepare('UPDATE servers SET status = ? WHERE id = ?').run('running', server.id);
      req.flash('success', 'השרת הופעל');
    } else if (action === 'stop') {
      await esxi.powerOff(server.esxi_vm_id);
      db.prepare('UPDATE servers SET status = ? WHERE id = ?').run('stopped', server.id);
      req.flash('success', 'השרת כובה');
    } else if (action === 'reboot') {
      await esxi.reboot(server.esxi_vm_id);
      req.flash('success', 'השרת מאותחל');
    } else {
      req.flash('error', 'פעולה לא חוקית');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'הפעולה נכשלה: ' + err.message);
  }
  res.redirect('/dashboard/servers/' + server.id);
});

router.post('/:id/delete', async (req, res) => {
  const server = getOwnedServer(req);
  if (!server) return res.redirect('/dashboard/servers');
  try {
    if (server.esxi_vm_id) await esxi.destroy(server.esxi_vm_id);
  } catch (err) {
    console.error(err);
  }
  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
  req.flash('success', 'השרת נמחק');
  res.redirect('/dashboard/servers');
});

module.exports = router;
