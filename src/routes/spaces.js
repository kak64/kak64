import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, spaceMember } from '../auth.js';

const router = Router();
router.use(authRequired);

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (db.prepare('SELECT 1 FROM spaces WHERE invite_code = ?').get(code));
  return code;
}

function members(spaceId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.username, u.color, m.role
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.space_id = ?
       ORDER BY (m.role = 'owner') DESC, m.joined_at ASC`
    )
    .all(spaceId);
}

function counts(spaceId) {
  const total = db.prepare('SELECT COUNT(*) c FROM items i JOIN lists l ON l.id = i.list_id WHERE l.space_id = ?').get(spaceId).c;
  const done = db.prepare('SELECT COUNT(*) c FROM items i JOIN lists l ON l.id = i.list_id WHERE l.space_id = ? AND i.done = 1').get(spaceId).c;
  const lists = db.prepare('SELECT COUNT(*) c FROM lists WHERE space_id = ?').get(spaceId).c;
  return { total, done, open: total - done, lists };
}

function spaceSummary(spaceId, userId) {
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
  const c = counts(spaceId);
  return {
    id: space.id,
    name: space.name,
    type: space.type,
    emoji: space.emoji,
    inviteCode: space.invite_code,
    ownerId: space.owner_id,
    isOwner: space.owner_id === userId,
    members: members(spaceId),
    open: c.open,
    done: c.done,
    total: c.total,
    listsCount: c.lists,
  };
}

// List spaces the user belongs to.
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id FROM spaces s JOIN members m ON m.space_id = s.id
       WHERE m.user_id = ? ORDER BY m.joined_at ASC`
    )
    .all(req.user.id);
  res.json({ spaces: rows.map((r) => spaceSummary(r.id, req.user.id)) });
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  const type = (req.body.type || 'home').trim();
  const emoji = (req.body.emoji || '🏠').trim();
  if (!name) return res.status(400).json({ error: 'יש לתת שם למרחב' });
  const code = makeInviteCode();
  const info = db.prepare('INSERT INTO spaces (name, type, emoji, owner_id, invite_code) VALUES (?, ?, ?, ?, ?)')
    .run(name, type, emoji, req.user.id, code);
  const spaceId = info.lastInsertRowid;
  db.prepare('INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)').run(spaceId, req.user.id, 'owner');

  // Seed a couple of starter lists so the space isn't empty.
  const seed = Array.isArray(req.body.starterLists) ? req.body.starterLists : [];
  seed.forEach((l, i) => {
    db.prepare('INSERT INTO lists (space_id, title, emoji, color, sort, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(spaceId, l.title, l.emoji || '📝', l.color || '#6c5ce7', i, req.user.id);
  });

  res.json({ space: spaceSummary(spaceId, req.user.id) });
});

router.post('/join', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'יש להזין קוד הצטרפות' });
  const space = db.prepare('SELECT * FROM spaces WHERE invite_code = ?').get(code);
  if (!space) return res.status(404).json({ error: 'קוד הצטרפות לא תקין' });
  const exists = db.prepare('SELECT 1 FROM members WHERE space_id = ? AND user_id = ?').get(space.id, req.user.id);
  if (!exists)
    db.prepare('INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)').run(space.id, req.user.id, 'member');
  res.json({ space: spaceSummary(space.id, req.user.id) });
});

router.get('/:spaceId', spaceMember, (req, res) => {
  res.json({ space: spaceSummary(req.space.id, req.user.id) });
});

// Rich dashboard summary: per-list progress, weekly stats, contributions, recent activity.
router.get('/:spaceId/dashboard', spaceMember, (req, res) => {
  const sid = req.space.id;
  const summary = spaceSummary(sid, req.user.id);

  const lists = db
    .prepare(
      `SELECT l.id, l.title, l.emoji, l.color,
              (SELECT COUNT(*) FROM items WHERE list_id = l.id) AS total,
              (SELECT COUNT(*) FROM items WHERE list_id = l.id AND done = 1) AS done
       FROM lists l WHERE l.space_id = ? ORDER BY l.sort ASC, l.id ASC`
    )
    .all(sid)
    .map((l) => ({ ...l, open: l.total - l.done }));

  const doneThisWeek = db
    .prepare(
      `SELECT COUNT(*) c FROM items i JOIN lists l ON l.id = i.list_id
       WHERE l.space_id = ? AND i.done = 1 AND i.updated_at >= datetime('now','-7 days')`
    )
    .get(sid).c;

  const addedThisWeek = db
    .prepare(
      `SELECT COUNT(*) c FROM items i JOIN lists l ON l.id = i.list_id
       WHERE l.space_id = ? AND i.created_at >= datetime('now','-7 days')`
    )
    .get(sid).c;

  // Per-member contribution (items they completed).
  const contributions = db
    .prepare(
      `SELECT u.id, u.name, u.color, COUNT(i.id) AS done
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN items i ON i.done_by = u.id AND i.done = 1
         AND i.list_id IN (SELECT id FROM lists WHERE space_id = ?)
       WHERE m.space_id = ?
       GROUP BY u.id ORDER BY done DESC`
    )
    .all(sid, sid);

  const activity = db
    .prepare(
      `SELECT a.id, a.action, a.text, a.emoji, a.created_at,
              u.id AS uid, u.name AS uname, u.color AS ucolor
       FROM activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.space_id = ? ORDER BY a.id DESC LIMIT 12`
    )
    .all(sid)
    .map((r) => ({
      id: r.id, action: r.action, text: r.text, emoji: r.emoji, createdAt: r.created_at,
      user: r.uid ? { id: r.uid, name: r.uname, color: r.ucolor } : null,
    }));

  res.json({
    space: summary,
    lists,
    stats: {
      open: summary.open,
      done: summary.done,
      total: summary.total,
      completion: summary.total ? Math.round((summary.done / summary.total) * 100) : 0,
      doneThisWeek,
      addedThisWeek,
    },
    contributions,
    activity,
  });
});

router.patch('/:spaceId', spaceMember, (req, res) => {
  if (req.space.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל המרחב יכול לשנות' });
  const name = (req.body.name || '').trim();
  const emoji = (req.body.emoji || '').trim();
  if (name) db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(name, req.space.id);
  if (emoji) db.prepare('UPDATE spaces SET emoji = ? WHERE id = ?').run(emoji, req.space.id);
  res.json({ space: spaceSummary(req.space.id, req.user.id) });
});

router.post('/:spaceId/invite/regenerate', spaceMember, (req, res) => {
  if (req.space.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל המרחב יכול' });
  const code = makeInviteCode();
  db.prepare('UPDATE spaces SET invite_code = ? WHERE id = ?').run(code, req.space.id);
  res.json({ space: spaceSummary(req.space.id, req.user.id) });
});

router.delete('/:spaceId/members/:userId', spaceMember, (req, res) => {
  if (req.space.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל המרחב יכול להסיר חברים' });
  const target = Number(req.params.userId);
  if (target === req.space.owner_id) return res.status(400).json({ error: 'לא ניתן להסיר את בעל המרחב' });
  db.prepare('DELETE FROM members WHERE space_id = ? AND user_id = ?').run(req.space.id, target);
  res.json({ space: spaceSummary(req.space.id, req.user.id) });
});

router.post('/:spaceId/leave', spaceMember, (req, res) => {
  if (req.space.owner_id === req.user.id)
    return res.status(400).json({ error: 'בעל המרחב לא יכול לעזוב — יש למחוק את המרחב' });
  db.prepare('DELETE FROM members WHERE space_id = ? AND user_id = ?').run(req.space.id, req.user.id);
  res.json({ ok: true });
});

router.delete('/:spaceId', spaceMember, (req, res) => {
  if (req.space.owner_id !== req.user.id) return res.status(403).json({ error: 'רק בעל המרחב יכול למחוק' });
  db.prepare('DELETE FROM spaces WHERE id = ?').run(req.space.id);
  res.json({ ok: true });
});

export default router;
