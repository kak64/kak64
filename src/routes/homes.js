import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, homeMember } from '../auth.js';

const router = Router();
router.use(authRequired);

function makeInviteCode() {
  // Friendly 6-char code, no ambiguous chars.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (db.prepare('SELECT 1 FROM homes WHERE invite_code = ?').get(code));
  return code;
}

function homeSummary(homeId, userId) {
  const home = db.prepare('SELECT * FROM homes WHERE id = ?').get(homeId);
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.color, m.role
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.home_id = ?
       ORDER BY (m.role = 'owner') DESC, m.joined_at ASC`
    )
    .all(homeId);
  const openTasks = db.prepare('SELECT COUNT(*) c FROM tasks WHERE home_id = ? AND done = 0').get(homeId).c;
  const openShopping = db.prepare('SELECT COUNT(*) c FROM shopping_items WHERE home_id = ? AND checked = 0').get(homeId).c;
  return {
    id: home.id,
    name: home.name,
    inviteCode: home.invite_code,
    ownerId: home.owner_id,
    isOwner: home.owner_id === userId,
    members,
    openTasks,
    openShopping,
  };
}

// List homes the user belongs to.
router.get('/', (req, res) => {
  const homes = db
    .prepare(
      `SELECT h.id FROM homes h JOIN members m ON m.home_id = h.id
       WHERE m.user_id = ? ORDER BY m.joined_at ASC`
    )
    .all(req.user.id);
  res.json({ homes: homes.map((h) => homeSummary(h.id, req.user.id)) });
});

// Create a new home (creator becomes owner + member).
router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'יש לתת שם לבית' });
  const code = makeInviteCode();
  const info = db.prepare('INSERT INTO homes (name, owner_id, invite_code) VALUES (?, ?, ?)').run(
    name, req.user.id, code
  );
  db.prepare('INSERT INTO members (home_id, user_id, role) VALUES (?, ?, ?)').run(
    info.lastInsertRowid, req.user.id, 'owner'
  );
  res.json({ home: homeSummary(info.lastInsertRowid, req.user.id) });
});

// Join a home by invite code.
router.post('/join', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'יש להזין קוד הצטרפות' });
  const home = db.prepare('SELECT * FROM homes WHERE invite_code = ?').get(code);
  if (!home) return res.status(404).json({ error: 'קוד הצטרפות לא תקין' });
  const exists = db.prepare('SELECT 1 FROM members WHERE home_id = ? AND user_id = ?').get(home.id, req.user.id);
  if (!exists) {
    db.prepare('INSERT INTO members (home_id, user_id, role) VALUES (?, ?, ?)').run(home.id, req.user.id, 'member');
  }
  res.json({ home: homeSummary(home.id, req.user.id) });
});

router.get('/:homeId', homeMember, (req, res) => {
  res.json({ home: homeSummary(req.home.id, req.user.id) });
});

// Rename home (owner only).
router.patch('/:homeId', homeMember, (req, res) => {
  if (req.home.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל הבית יכול לשנות' });
  const name = (req.body.name || '').trim();
  if (name) db.prepare('UPDATE homes SET name = ? WHERE id = ?').run(name, req.home.id);
  res.json({ home: homeSummary(req.home.id, req.user.id) });
});

// Regenerate invite code (owner only).
router.post('/:homeId/invite/regenerate', homeMember, (req, res) => {
  if (req.home.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל הבית יכול' });
  const code = makeInviteCode();
  db.prepare('UPDATE homes SET invite_code = ? WHERE id = ?').run(code, req.home.id);
  res.json({ home: homeSummary(req.home.id, req.user.id) });
});

// Remove a member (owner only). Owner can't be removed.
router.delete('/:homeId/members/:userId', homeMember, (req, res) => {
  if (req.home.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל הבית יכול להסיר חברים' });
  const target = Number(req.params.userId);
  if (target === req.home.owner_id) return res.status(400).json({ error: 'לא ניתן להסיר את בעל הבית' });
  db.prepare('DELETE FROM members WHERE home_id = ? AND user_id = ?').run(req.home.id, target);
  res.json({ home: homeSummary(req.home.id, req.user.id) });
});

// Leave a home (non-owner). Owner must delete the home instead.
router.post('/:homeId/leave', homeMember, (req, res) => {
  if (req.home.owner_id === req.user.id)
    return res.status(400).json({ error: 'בעל הבית לא יכול לעזוב — יש למחוק את הבית' });
  db.prepare('DELETE FROM members WHERE home_id = ? AND user_id = ?').run(req.home.id, req.user.id);
  res.json({ ok: true });
});

// Delete a home entirely (owner only).
router.delete('/:homeId', homeMember, (req, res) => {
  if (req.home.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל הבית יכול למחוק את הבית' });
  db.prepare('DELETE FROM homes WHERE id = ?').run(req.home.id);
  res.json({ ok: true });
});

export default router;
