const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfMiddleware(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  const submitted = (req.body && req.body._csrf) ||
                    req.headers['x-csrf-token'] ||
                    req.headers['csrf-token'];

  if (!submitted || submitted !== req.session.csrfToken) {
    if (req.accepts('html')) {
      res.status(403);
      return res.render('error', {
        title: 'בקשה דחויה',
        message: 'תוקף הטופס פג. רענן את הדף ונסה שוב. (CSRF)'
      });
    }
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

module.exports = { csrfMiddleware };
