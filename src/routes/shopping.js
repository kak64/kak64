import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { authRequired, homeMember } from '../auth.js';

// mergeParams so :homeId from the parent mount is available here.
const router = Router({ mergeParams: true });
router.use(authRequired, homeMember);

function item(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    checked: !!row.checked,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM shopping_items WHERE home_id = ?
       ORDER BY checked ASC, category ASC, sort ASC, id ASC`
    )
    .all(req.home.id);
  res.json({ items: rows.map(item) });
});

router.post('/', (req, res) => {
  const names = Array.isArray(req.body.names) ? req.body.names : [req.body.name];
  const category = (req.body.category || 'אחר').trim() || 'אחר';
  const created = [];
  for (const raw of names) {
    const name = (raw || '').trim();
    if (!name) continue;
    const info = db
      .prepare('INSERT INTO shopping_items (home_id, name, category, created_by) VALUES (?, ?, ?, ?)')
      .run(req.home.id, name, category, req.user.id);
    const row = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(info.lastInsertRowid);
    created.push(item(row));
    logActivity(req.home.id, req.user.id, 'shopping', 'added', name);
  }
  if (!created.length) return res.status(400).json({ error: 'אין פריט להוספה' });
  res.json({ items: created });
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND home_id = ?').get(req.params.id, req.home.id);
  if (!row) return res.status(404).json({ error: 'פריט לא נמצא' });

  if (typeof req.body.checked === 'boolean') {
    db.prepare('UPDATE shopping_items SET checked = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.body.checked ? 1 : 0, row.id);
    logActivity(req.home.id, req.user.id, 'shopping', req.body.checked ? 'completed' : 'reopened', row.name);
  }
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    db.prepare('UPDATE shopping_items SET name = ? WHERE id = ?').run(req.body.name.trim(), row.id);
  }
  if (typeof req.body.category === 'string' && req.body.category.trim()) {
    db.prepare('UPDATE shopping_items SET category = ? WHERE id = ?').run(req.body.category.trim(), row.id);
  }
  const updated = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(row.id);
  res.json({ item: item(updated) });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND home_id = ?').get(req.params.id, req.home.id);
  if (!row) return res.status(404).json({ error: 'פריט לא נמצא' });
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(row.id);
  logActivity(req.home.id, req.user.id, 'shopping', 'removed', row.name);
  res.json({ ok: true });
});

// Clear all checked items.
router.post('/clear-checked', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE home_id = ? AND checked = 1').run(req.home.id);
  res.json({ ok: true });
});

export default router;
