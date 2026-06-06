import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { authRequired, homeMember } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authRequired, homeMember);

function task(row) {
  return {
    id: row.id,
    title: row.title,
    done: !!row.done,
    dueAt: row.due_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tasks WHERE home_id = ? ORDER BY done ASC, (due_at IS NULL), due_at ASC, id DESC')
    .all(req.home.id);
  res.json({ tasks: rows.map(task) });
});

router.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  const dueAt = req.body.dueAt || null;
  if (!title) return res.status(400).json({ error: 'יש להזין משימה' });
  const info = db
    .prepare('INSERT INTO tasks (home_id, title, due_at, created_by) VALUES (?, ?, ?, ?)')
    .run(req.home.id, title, dueAt, req.user.id);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  logActivity(req.home.id, req.user.id, 'task', 'added', title);
  res.json({ task: task(row) });
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND home_id = ?').get(req.params.id, req.home.id);
  if (!row) return res.status(404).json({ error: 'משימה לא נמצאה' });

  if (typeof req.body.done === 'boolean') {
    db.prepare('UPDATE tasks SET done = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.body.done ? 1 : 0, row.id);
    logActivity(req.home.id, req.user.id, 'task', req.body.done ? 'completed' : 'reopened', row.title);
  }
  if (typeof req.body.title === 'string' && req.body.title.trim()) {
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(req.body.title.trim(), row.id);
  }
  if ('dueAt' in req.body) {
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(req.body.dueAt || null, row.id);
  }
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.id);
  res.json({ task: task(updated) });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND home_id = ?').get(req.params.id, req.home.id);
  if (!row) return res.status(404).json({ error: 'משימה לא נמצאה' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(row.id);
  logActivity(req.home.id, req.user.id, 'task', 'removed', row.title);
  res.json({ ok: true });
});

export default router;
