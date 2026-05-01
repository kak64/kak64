const { db } = require('./db');

function attachUser(req, res, next) {
  res.locals.user = null;
  if (req.session && req.session.userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.flash('error', 'יש להתחבר כדי לגשת לאזור זה');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    req.flash('error', 'הגישה מוגבלת למנהלים בלבד');
    return res.redirect('/login');
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
