const db = require('./db');

// Fire-and-forget: never crash a request because Discord is down.
async function sendOrderWebhook(order, items, user) {
  const url = db.getSetting('discord_webhook_url');
  if (!url) return;
  const sym = process.env.CURRENCY_SYMBOL || '₪';
  const total = `${sym}${Number(order.total).toLocaleString('he-IL')}`;
  const itemLines = items.map(i => `• ${i.name} × ${i.qty}`).join('\n').slice(0, 1000);
  const body = {
    username: 'Infinity IL Store',
    embeds: [{
      title: `🛒 הזמנה חדשה #${order.id}`,
      description: `**${user ? user.username : 'אורח'}** ביצע/ה רכישה!`,
      color: 0xa855f7,
      fields: [
        { name: 'פריטים', value: itemLines || '—', inline: false },
        { name: 'סכום', value: total, inline: true },
        { name: 'תשלום', value: order.payment_method || '—', inline: true }
      ],
      footer: { text: 'הצטרפו אלינו ב-infinity-il.com' },
      timestamp: new Date().toISOString()
    }]
  };
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.warn('Discord webhook failed:', e.message);
  }
}

async function sendCustomWebhook(title, description, color = 0xa855f7) {
  const url = db.getSetting('discord_webhook_url');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Infinity IL Store',
        embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
      })
    });
  } catch (e) { /* ignore */ }
}

module.exports = { sendOrderWebhook, sendCustomWebhook };
