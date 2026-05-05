const express = require('express');
const db = require('../db');
const { requireAuth, flash } = require('../middleware');
const { cartWithProducts } = require('./cart');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const items = cartWithProducts(req);
  if (!items.length) {
    flash(req, 'error', 'העגלה ריקה');
    return res.redirect('/cart');
  }
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  // Optional admin-defined extra fee (set in settings)
  const extraFee = Number(db.getSetting('extra_fee') || 0);
  const discountCode = req.session.discountCode || null;
  const discount = req.session.discount || 0;
  const total = Math.max(0, subtotal + extraFee - discount);
  res.render('checkout', {
    title: 'תשלום',
    items, subtotal, extraFee, discount, discountCode, total,
    paypalEnabled: !!process.env.PAYPAL_CLIENT_ID,
    bitEnabled: true
  });
});

router.post('/discount', requireAuth, (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  // simple sample codes managed via settings: discount_codes = "WELCOME10:10,SUMMER20:20"
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

router.post('/pay', requireAuth, (req, res) => {
  const method = req.body.method;
  const items = cartWithProducts(req);
  if (!items.length) {
    flash(req, 'error', 'העגלה ריקה');
    return res.redirect('/cart');
  }
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const extraFee = Number(db.getSetting('extra_fee') || 0);
  const discount = req.session.discount || 0;
  const total = Math.max(0, subtotal + extraFee - discount);

  // For PayPal real flow you'd create an order via PayPal Orders API and redirect to approval URL.
  // For Bit you'd integrate via Pelecard/Tranzila. We keep both as a mock that captures the order
  // and shows a success page — admins can mark as paid manually.
  const orderId = db.createOrder(
    req.user.id,
    items.map(i => ({ product_id: i.product.id, name: i.product.name, qty: i.qty, price: i.unit })),
    total, method, null,
    req.session.discountCode ? `coupon:${req.session.discountCode}` : null
  );
  // Auto-mark mock payments as paid; real PayPal/Bit would webhook to confirm
  if (!process.env.PAYPAL_CLIENT_ID && !process.env.BIT_API_KEY) {
    db.updateOrderStatus(orderId, 'paid');
  }
  req.session.cart = [];
  req.session.discount = 0;
  req.session.discountCode = null;
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
