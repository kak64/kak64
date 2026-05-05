const db = require('./db');

function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = db.getUserById(req.session.userId) || null;
  } else {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', text: 'יש להתחבר כדי להמשיך' };
    return res.redirect('/auth/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).render('error', { title: '403', message: 'אין לך הרשאות לצפייה בעמוד זה' });
  }
  next();
}

function flash(req, type, text) {
  req.session.flash = { type, text };
}

function formatCurrency(amount) {
  const sym = process.env.CURRENCY_SYMBOL || '₪';
  const n = Number(amount || 0);
  return `${sym}${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Price logic: flash_deal beats sale_price beats price.
function effectivePrice(product, flashDeal) {
  if (flashDeal && flashDeal.deal_price != null) return Number(flashDeal.deal_price);
  if (product.sale_price && product.sale_price > 0) return Number(product.sale_price);
  return Number(product.price);
}

function avgRating(product) {
  if (!product.rating_count) return 0;
  return product.rating_sum / product.rating_count;
}

module.exports = { attachUser, requireAuth, requireAdmin, flash, formatCurrency, effectivePrice, avgRating };
