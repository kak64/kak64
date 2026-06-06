import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { authRequired, spaceMember } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authRequired, spaceMember);

// Verify the list belongs to the space, return it (or null).
function getList(spaceId, listId) {
  return db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(listId, spaceId);
}
const out = (i) => ({ id: i.id, text: i.text, done: !!i.done, createdBy: i.created_by, createdAt: i.created_at });

router.post('/', (req, res) => {
  const list = getList(req.space.id, req.params.listId);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  const names = Array.isArray(req.body.texts) ? req.body.texts : [req.body.text];
  const created = [];
  let sort = (db.prepare('SELECT MAX(sort) m FROM items WHERE list_id = ?').get(list.id).m ?? 0);
  for (const raw of names) {
    const text = (raw || '').trim();
    if (!text) continue;
    sort += 1;
    const info = db.prepare('INSERT INTO items (list_id, text, created_by, sort) VALUES (?, ?, ?, ?)')
      .run(list.id, text, req.user.id, sort);
    created.push(out(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid)));
    logActivity(req.space.id, req.user.id, 'added', text, list.emoji);
  }
  if (!created.length) return res.status(400).json({ error: 'אין פריט להוספה' });
  res.json({ items: created });
});

router.patch('/:itemId', (req, res) => {
  const list = getList(req.space.id, req.params.listId);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND list_id = ?').get(req.params.itemId, list.id);
  if (!item) return res.status(404).json({ error: 'פריט לא נמצא' });

  if (typeof req.body.done === 'boolean') {
    db.prepare('UPDATE items SET done = ?, done_by = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.body.done ? 1 : 0, req.body.done ? req.user.id : null, item.id);
    logActivity(req.space.id, req.user.id, req.body.done ? 'done' : 'reopened', item.text, list.emoji);
  }
  if (req.body.text?.trim()) db.prepare('UPDATE items SET text = ? WHERE id = ?').run(req.body.text.trim(), item.id);
  res.json({ item: out(db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)) });
});

router.delete('/:itemId', (req, res) => {
  const list = getList(req.space.id, req.params.listId);
  if (!list) return res.status(404).json({ error: 'רשימה לא נמצאה' });
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND list_id = ?').get(req.params.itemId, list.id);
  if (!item) return res.status(404).json({ error: 'פריט לא נמצא' });
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  logActivity(req.space.id, req.user.id, 'removed', item.text, list.emoji);
  res.json({ ok: true });
});

export default router;
