import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';

export function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '90d' });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'לא מחובר' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, username, email, color FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'משתמש לא קיים' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'אסימון לא תקין' });
  }
}

// Ensures the current user is a member of :spaceId. Attaches req.space + req.membership.
export function spaceMember(req, res, next) {
  const spaceId = Number(req.params.spaceId);
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
  if (!space) return res.status(404).json({ error: 'מרחב לא נמצא' });
  const membership = db
    .prepare('SELECT * FROM members WHERE space_id = ? AND user_id = ?')
    .get(spaceId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'אין לך גישה למרחב הזה' });
  req.space = space;
  req.membership = membership;
  next();
}
