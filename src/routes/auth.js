import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, authRequired } from '../auth.js';

const router = Router();

const COLORS = ['#ef8e4a', '#5b8def', '#34c759', '#ff9f0a', '#af52de', '#ff375f', '#30b0c7', '#ffcc00'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, email: u.email, color: u.color };
}

router.post('/register', (req, res) => {
  const name = (req.body.name || '').trim();
  const username = (req.body.username || '').trim().toLowerCase();
  const email = (req.body.email || '').trim().toLowerCase() || null;
  const password = req.body.password || '';

  if (!name || !username || !password)
    return res.status(400).json({ error: 'יש למלא שם, שם משתמש וסיסמה' });
  if (password.length < 6)
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
  if (!/^[a-z0-9_.]+$/.test(username))
    return res.status(400).json({ error: 'שם משתמש יכול להכיל אותיות באנגלית, מספרים, נקודה וקו תחתון' });

  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
  if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'האימייל כבר רשום' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, username, email, password, color) VALUES (?, ?, ?, ?, ?)')
    .run(name, username, email, hash, randomColor());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const id = (req.body.username || req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!id || !password) return res.status(400).json({ error: 'יש למלא שם משתמש וסיסמה' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(id, id);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', authRequired, (req, res) => {
  const name = (req.body.name || '').trim();
  const color = (req.body.color || '').trim();
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  if (color) db.prepare('UPDATE users SET color = ? WHERE id = ?').run(color, req.user.id);
  const user = db.prepare('SELECT id, name, username, email, color FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

router.delete('/me', authRequired, (req, res) => {
  // Re-assign / cascade: homes owned by the user are deleted with them.
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default router;
