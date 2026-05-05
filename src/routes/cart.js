const express = require('express');
const db = require('../db');
const { flash, effectivePrice } = require('../middleware');
const router = express.Router();

function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

function cartWithProducts(req) {
  const cart = getCart(req);
  return cart.map(item => {
    const p = db.getProduct(item.product_id);
    if (!p) return null;
    const flash = db.getActiveFlashForProduct(p.id);
    const unit = effectivePrice(p, flash);
    return { ...item, product: p, flash, unit, lineTotal: unit * item.qty };
  }).filter(Boolean);
}

router.get('/', (req, res) => {
  const items = cartWithProducts(req);
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  res.render('cart', { title: 'עגלת קניות', items, subtotal });
});

router.post('/add', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const qty = Math.max(1, parseInt(req.body.qty || '1', 10));
  const product = db.getProduct(productId);
  if (!product) {
    flash(req, 'error', 'מוצר לא נמצא');
    return res.redirect(req.get('referer') || '/');
  }
  // Stock check
  if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
    flash(req, 'error', 'המוצר אזל מהמלאי');
    return res.redirect(req.get('referer') || '/');
  }
  const cart = getCart(req);
  const exist = cart.find(c => c.product_id === productId);
  if (exist) exist.qty += qty;
  else cart.push({ product_id: productId, qty });
  flash(req, 'success', `נוסף לעגלה: ${product.name}`);
  res.redirect(req.body.redirect || '/cart');
});

router.post('/update', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const qty = parseInt(req.body.qty || '1', 10);
  const cart = getCart(req);
  const item = cart.find(c => c.product_id === productId);
  if (item) {
    if (qty <= 0) req.session.cart = cart.filter(c => c.product_id !== productId);
    else item.qty = qty;
  }
  res.redirect('/cart');
});

router.post('/remove', (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  req.session.cart = getCart(req).filter(c => c.product_id !== productId);
  res.redirect('/cart');
});

router.post('/clear', (req, res) => {
  req.session.cart = [];
  res.redirect('/cart');
});

module.exports = router;
module.exports.cartWithProducts = cartWithProducts;
