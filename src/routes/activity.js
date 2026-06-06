import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, homeMember } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authRequired, homeMember);

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const rows = db
    .prepare(
      `SELECT a.id, a.kind, a.action, a.text, a.created_at,
              u.id AS user_id, u.name AS user_name, u.color AS user_color
       FROM activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.home_id = ? ORDER BY a.id DESC LIMIT ?`
    )
    .all(req.home.id, limit);
  res.json({
    activity: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      action: r.action,
      text: r.text,
      createdAt: r.created_at,
      user: r.user_id ? { id: r.user_id, name: r.user_name, color: r.user_color } : null,
    })),
  });
});

export default router;
