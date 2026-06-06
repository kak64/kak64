import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { authRequired, spaceMember } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authRequired, spaceMember);

function listWithCounts(id) {
  const l = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  if (!l) return null;
  const total = db.prepare('SELECT COUNT(*) c FROM items WHERE list_id = ?').get(id).c;
  const done = db.prepare('SELECT COUNT(*) c FROM items WHERE list_id = ? AND done = 1').get(id).c;
  return { id: l.id, title: l.title, emoji: l.emoji, color: l.color, total, done, open: total - done, createdBy: l.created_by };
}

// All lists in the space (with counts).
router.get('/', (req, res) => {
  const ids = db.prepare('SELECT id FROM lists WHERE space_id = ? ORDER BY sort ASC, id ASC').all(req.space.id);
  res.json({ lists: ids.map((r) => listWithCounts(r.id)) });
});

router.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  const emoji = (req.body.emoji || '📝').trim();
  const color = (req.body.color || '#6c5ce7').trim();
  if (!title) return res.status(400).json({ error: 'יש לתת שם לרשימה' });
  const sort = (db.prepare('SELECT MAX(sort) m FROM lists WHERE space_id = ?').get(req.space.id).m ?? 0) + 1;
  const info = db.prepare('INSERT INTO lists (space_id, title, emoji, color, sort, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.space.id, title, emoji, color, sort, req.user.id);
  logActivity(req.space.id, req.user.id, 'created_list', title, emoji);
  res.json({ list: listWithCounts(info.lastInsertRowid) });
});

// Single list + its items.
router.get('/:listId', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, req.space.id);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  const items = db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY done ASC, sort ASC, id ASC').all(list.id)
    .map((i) => ({ id: i.id, text: i.text, done: !!i.done, createdBy: i.created_by, createdAt: i.created_at }));
  res.json({ list: { id: list.id, title: list.title, emoji: list.emoji, color: list.color }, items });
});

router.patch('/:listId', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, req.space.id);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  if (req.body.title?.trim()) db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(req.body.title.trim(), list.id);
  if (req.body.emoji?.trim()) db.prepare('UPDATE lists SET emoji = ? WHERE id = ?').run(req.body.emoji.trim(), list.id);
  if (req.body.color?.trim()) db.prepare('UPDATE lists SET color = ? WHERE id = ?').run(req.body.color.trim(), list.id);
  res.json({ list: listWithCounts(list.id) });
});

router.delete('/:listId', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, req.space.id);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
  logActivity(req.space.id, req.user.id, 'removed_list', list.title, list.emoji);
  res.json({ ok: true });
});

router.post('/:listId/clear-done', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, req.space.id);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  db.prepare('DELETE FROM items WHERE list_id = ? AND done = 1').run(list.id);
  res.json({ ok: true });
});

export default router;
