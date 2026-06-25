import { Router } from 'express';
import { store } from '../store.js';
import type { FamilyMember, TaskCategory } from '../types.js';

const router = Router();

// GET /api/tasks
router.get('/', (_req, res) => {
  res.json(store.getTasks());
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, category, assignee, dueAt } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title נדרש' });
  }
  const task = store.addTask({
    title: title.trim(),
    category: (category as TaskCategory) ?? 'סידורים',
    assignee: (assignee as FamilyMember) ?? 'משותף',
    dueAt: typeof dueAt === 'string' ? dueAt : undefined,
  });
  res.status(201).json(task);
});

// PATCH /api/tasks/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const task = store.toggleTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'משימה לא נמצאה' });
  res.json(task);
});

export default router;
