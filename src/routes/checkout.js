const express = require('express');
const db = require('../db');
const { requireAuth, flash } = require('../middleware');
const { cartWithProducts } = require('./cart');
const { sendOrderWebhook } = require('../discord');
const { sendReceiptEmail } = require('../email');
const router = express.Router();

function computeTotals(req) {
  const items = cartWithProducts(req);
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const extraFee = Number(db.getSetting('extra_fee') || 0);

  // Coupon discount
  const couponDiscount = req.session.discount || 0;

  // Points redemption
  const pointsToRedeem = Math.max(0, Number(req.session.pointsToRedeem || 0));
  const redeemRate = Number(db.getSetting('points_redeem_rate') || 100); // points → 1 currency
  const pointsDiscount = redeemRate > 0 ? Math.floor(pointsToRedeem / redeemRate) : 0;

  const total = Math.max(0, subtotal + extraFee - couponDiscount - pointsDiscount);
  return { items, subtotal, extraFee, couponDiscount, pointsToRedeem, pointsDiscount, total };
}

router.get('/', requireAuth, (req, res) => {
  const t = computeTotals(req);
  if (!t.items.length) {
    flash(req, 'error', 'העגלה ריקה');
    return res.redirect('/cart');
  }
  const pointsPer = Number(db.getSetting('points_per_currency') || 1);
  const pointsToEarn = Math.floor(t.total * pointsPer);
  res.render('checkout', {
    title: 'תשלום',
    ...t,
    discountCode: req.session.discountCode || null,
    pointsToEarn,
    redeemRate: Number(db.getSetting('points_redeem_rate') || 100),
    paypalEnabled: !!process.env.PAYPAL_CLIENT_ID,
    bitEnabled: true
  });
});

router.post('/discount', requireAuth, (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) {
    req.session.discountCode = null;
    req.session.discount = 0;
    return res.redirect('/checkout');
  }
  const raw = db.getSetting('discount_codes') || '';
  const map = {};
  raw.split(',').forEach(p => {
    const [k, v] = p.split(':');
    if (k && v) map[k.trim().toUpperCase()] = Number(v);
  });
  if (map[code]) {
    req.session.discountCode = code;
    req.session.discount = map[code];
    flash(req, 'success', `קופון הופעל: -${map[code]}${process.env.CURRENCY_SYMBOL || '₪'}`);
  } else {
    req.session.discountCode = null;
    req.session.discount = 0;
    flash(req, 'error', 'קוד קופון לא תקף');
  }
  res.redirect('/checkout');
});

router.post('/redeem', requireAuth, (req, res) => {
  const requested = Math.max(0, parseInt(req.body.points || '0', 10));
  const available = req.user.points || 0;
  const use = Math.min(requested, available);
  req.session.pointsToRedeem = use;
  if (use > 0) flash(req, 'success', `${use} נקודות יופחתו מההזמנה`);
  else flash(req, 'success', 'פדיון נקודות בוטל');
  res.redirect('/checkout');
});

router.post('/pay', requireAuth, async (req, res) => {
  const t = computeTotals(req);
  if (!t.items.length) {
    flash(req, 'error', 'העגלה ריקה');
    return res.redirect('/cart');
  }

  // Final stock check
  for (const it of t.items) {
    const fresh = db.getProduct(it.product.id);
    if (fresh.stock !== null && fresh.stock !== undefined && fresh.stock < it.qty) {
      flash(req, 'error', `אין מספיק במלאי: ${fresh.name}`);
      return res.redirect('/cart');
    }
  }

  const method = req.body.method || 'paypal';
  const pointsPer = Number(db.getSetting('points_per_currency') || 1);
  const pointsEarned = Math.floor(t.total * pointsPer);

  const orderNotes = [];
  if (req.session.discountCode) orderNotes.push(`coupon:${req.session.discountCode}`);
  if (t.pointsDiscount > 0) orderNotes.push(`points_redeemed:${t.pointsToRedeem}`);

  const orderId = db.createOrder(
    req.user.id,
    t.items.map(i => ({ product_id: i.product.id, name: i.product.name, qty: i.qty, price: i.unit })),
    t.total, method, null, orderNotes.join('; ') || null,
    pointsEarned
  );

  // Auto-mark mock payments as paid; real PayPal/Bit would webhook to confirm
  if (!process.env.PAYPAL_CLIENT_ID && !process.env.BIT_API_KEY) {
    db.updateOrderStatus(orderId, 'paid');

    // Bump sold counts + decrement stock
    t.items.forEach(it => db.bumpProductSold(it.product.id, it.qty));

    // Award points
    if (pointsEarned > 0) db.addUserPoints(req.user.id, pointsEarned);
    // Deduct redeemed points
    if (t.pointsToRedeem > 0) db.addUserPoints(req.user.id, -t.pointsToRedeem);

    // Referral bonus on FIRST paid order
    if (req.user.referred_by) {
      const userOrders = db.listOrdersForUser(req.user.id).filter(o => o.status === 'paid');
      if (userOrders.length === 1) {
        const bonus = Number(db.getSetting('referral_bonus') || 10);
        db.addUserPoints(req.user.referred_by, bonus * Number(db.getSetting('points_redeem_rate') || 100));
        db.addUserPoints(req.user.id, bonus * Number(db.getSetting('points_redeem_rate') || 100));
      }
    }

    // Discord webhook + email (fire-and-forget)
    const order = db.getOrder(orderId);
    sendOrderWebhook(order, order.items, req.user).catch(() => {});
    sendReceiptEmail(req.user, order, order.items).catch(() => {});
  }

  req.session.cart = [];
  req.session.discount = 0;
  req.session.discountCode = null;
  req.session.pointsToRedeem = 0;
  res.redirect('/checkout/success/' + orderId);
});

router.get('/success/:id', requireAuth, (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order || order.user_id !== req.user.id) {
    return res.status(404).render('error', { title: '404', message: 'הזמנה לא נמצאה' });
  }
  res.render('success', { title: 'הזמנה הושלמה', order });
});

module.exports = router;
