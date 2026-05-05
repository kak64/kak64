// Email helper. Sends receipt codes after a successful purchase.
// Uses nodemailer when SMTP_* env vars are set, otherwise logs to console.

const nodemailer = require('nodemailer');
const db = require('./db');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  return transporter;
}

function buildReceiptHtml(order, items) {
  const sym = process.env.CURRENCY_SYMBOL || '₪';
  const siteName = db.getSetting('site_name') || 'Infinity IL';
  const discordInvite = db.getSetting('discord_invite') || '';
  const itemsHtml = items.map(it => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #2a1d54">
        <div style="font-weight:700;color:#ffffff">${escapeHtml(it.product_name)} × ${it.qty}</div>
        <div style="font-size:13px;color:#b9b1de">${sym}${it.price}</div>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #2a1d54;text-align:left">
        <div style="font-family:Menlo,Consolas,monospace;font-size:18px;font-weight:800;color:#f59e0b;letter-spacing:1px">${escapeHtml(it.receipt_code || '')}</div>
        <div style="font-size:11px;color:#b9b1de">קוד מימוש</div>
      </td>
    </tr>
  `).join('');

  return `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;background:#06030f;font-family:system-ui,sans-serif;color:#ece8ff">
  <div style="max-width:560px;margin:24px auto;background:linear-gradient(135deg,#1c1238,#2d145a);border:1px solid #4a2a8c;border-radius:18px;overflow:hidden">
    <div style="padding:28px;text-align:center;background:radial-gradient(ellipse at center,rgba(168,85,247,0.4),transparent 70%)">
      <div style="font-size:28px;font-weight:900;letter-spacing:2px">INFINITY <span style="background:linear-gradient(135deg,#a855f7,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent">IL</span></div>
      <div style="margin-top:6px;color:#b9b1de;font-size:13px;letter-spacing:3px">ROLEPLAY SERVER STORE</div>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 8px">תודה על הקנייה!</h2>
      <p style="color:#b9b1de;margin:0 0 14px">הזמנה <strong>#${order.id}</strong> — סך הכל ${sym}${order.total}</p>
      <h3 style="margin:18px 0 10px;font-size:15px">קודי מימוש לשרת</h3>
      <p style="color:#b9b1de;font-size:13px;margin:0 0 12px">היכנסו לשרת FiveM וכתבו בצ'אט: <code style="background:#0c0820;padding:3px 8px;border-radius:6px;color:#f59e0b">/redeem &lt;קוד&gt;</code></p>
      <table style="width:100%;border-collapse:collapse;background:#0c0820;border-radius:10px;overflow:hidden">
        ${itemsHtml}
      </table>
      <p style="color:#b9b1de;font-size:12px;margin:16px 0 0">שמרו את המייל הזה — זה הכרטיס שלכם להטבה בשרת.</p>
    </div>
    <div style="padding:18px 24px;border-top:1px solid #2a1d54;text-align:center">
      ${discordInvite ? `<a href="${discordInvite}" style="display:inline-block;background:#5865F2;color:white;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600">הצטרפו לדיסקורד</a>` : ''}
      <div style="margin-top:12px;color:#8b83b6;font-size:12px">${escapeHtml(siteName)} · נצרכה עזרה? צרו קשר ב-Discord</div>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendReceiptEmail(user, order, items) {
  if (!user || !user.email) return;
  const t = getTransporter();
  const html = buildReceiptHtml(order, items);
  const subject = `Infinity IL — קודי מימוש להזמנה #${order.id}`;
  if (!t) {
    console.log(`📧 [mock email] would send to ${user.email}: ${subject}`);
    items.forEach(i => console.log(`   ${i.product_name} → ${i.receipt_code}`));
    return;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || `Infinity IL <no-reply@infinity-il.com>`,
      to: user.email, subject, html
    });
  } catch (e) {
    console.warn('Email send failed:', e.message);
  }
}

module.exports = { sendReceiptEmail };
