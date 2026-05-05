// Public API used by the FiveM resource to redeem receipt codes.
// Auth: Bearer token from /admin/settings (key: fivem_api_token).

const express = require('express');
const db = require('../db');
const { sendCustomWebhook } = require('../discord');
const router = express.Router();

function requireToken(req, res, next) {
  const expected = db.getSetting('fivem_api_token');
  if (!expected) return res.status(503).json({ ok: false, error: 'API token not configured on server' });
  const auth = req.get('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.query.token || req.body.token || '');
  if (provided !== expected) return res.status(401).json({ ok: false, error: 'unauthorized' });
  next();
}

// Inspect a code without redeeming. Useful for the FiveM script to preview
// the perk before applying it.
router.get('/redeem/:code', requireToken, (req, res) => {
  const item = db.getItemByCode(req.params.code);
  if (!item) return res.status(404).json({ ok: false, error: 'code not found' });
  res.json({
    ok: true,
    redeemed: !!item.redeemed,
    redeemedAt: item.redeemed_at,
    paid: item.order_status === 'paid',
    product: {
      id: item.product_id,
      name: item.product_full_name || item.product_name,
      description: item.product_description,
      features: item.product_features,
      tags: item.product_tags,
      is_package: !!item.is_package,
      qty: item.qty
    },
    buyer: { username: item.username }
  });
});

// Redeem a code. Marks the item as redeemed and returns the perk metadata
// so the FiveM script can grant the appropriate in-game reward.
router.post('/redeem', express.json(), requireToken, (req, res) => {
  const code = (req.body.code || '').trim();
  const player = (req.body.player || req.body.identifier || '').toString().trim();
  if (!code) return res.status(400).json({ ok: false, error: 'missing code' });
  const result = db.redeemReceiptCode(code, player);
  if (!result.ok) return res.status(409).json(result);

  // Notify Discord (optional, fire-and-forget) so admins see redemptions live.
  const sym = process.env.CURRENCY_SYMBOL || '₪';
  sendCustomWebhook(
    `🎁 קוד מומש: ${result.product.name}`,
    `**${result.buyer.username || 'משתמש'}** מימש קוד \`${code}\` (${sym}${result.product.qty})\nשחקן בשרת: \`${player || '—'}\``,
    0xf59e0b
  ).catch(() => {});

  res.json(result);
});

module.exports = router;
