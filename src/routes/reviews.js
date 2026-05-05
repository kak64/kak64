const express = require('express');
const db = require('../db');
const { requireAuth, flash } = require('../middleware');
const router = express.Router();

router.post('/:productId', requireAuth, (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const rating = Math.min(5, Math.max(1, parseInt(req.body.rating || '5', 10)));
  const comment = (req.body.comment || '').trim().slice(0, 1000);
  const product = db.getProduct(productId);
  if (!product) {
    flash(req, 'error', 'מוצר לא נמצא');
    return res.redirect('/');
  }
  // Must have a paid order containing this product
  const orders = db.listOrdersForUser(req.user.id);
  const eligible = orders.some(o => {
    if (o.status !== 'paid') return false;
    const items = db.raw.prepare('SELECT product_id FROM order_items WHERE order_id = ?').all(o.id);
    return items.some(i => i.product_id === productId);
  });
  if (!eligible) {
    flash(req, 'error', 'ניתן להגיב רק על מוצר שרכשתם');
    return res.redirect('/product/' + productId);
  }
  db.upsertReview({
    product_id: productId,
    user_id: req.user.id,
    username: req.user.username,
    rating,
    comment
  });
  flash(req, 'success', 'תודה על הביקורת!');
  res.redirect('/product/' + productId + '#reviews');
});

module.exports = router;
