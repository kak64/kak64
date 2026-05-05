const express = require('express');
const db = require('../db');
const { requireAuth, flash } = require('../middleware');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const items = db.listWishlistFor(req.user.id);
  res.render('wishlist', { title: 'מועדפים', items });
});

router.post('/toggle', requireAuth, (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  if (!productId) return res.redirect(req.get('referer') || '/');
  const added = db.toggleWishlist(req.user.id, productId);
  flash(req, 'success', added ? 'נוסף למועדפים' : 'הוסר מהמועדפים');
  if (req.body.json) return res.json({ ok: true, wishlisted: added });
  res.redirect(req.get('referer') || '/wishlist');
});

module.exports = router;
