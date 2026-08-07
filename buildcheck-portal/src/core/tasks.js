// BuildCheck Portal — task dispatch & field reports.
// A company manager targets workers by district / area / role (any
// combination), sets an execution date+time and a completion deadline, and
// each matched worker gets an assignment. Workers submit a per-check report:
// every check REQUIRES at least one photo; defects require a description;
// measurements are optional, in cm or meters.

import { nextId, DATE_RE, TIME_RE } from './util.js';
import { categoryById, subcategoryById } from './directory.js';

export const STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const STATUS_LABELS = Object.freeze({
  pending: 'ממתין',
  in_progress: 'בביצוע',
  submitted: 'דוח נשלח',
  approved: 'אושר',
  rejected: 'נדחה',
});

export const MEASUREMENT_UNITS = Object.freeze([
  { id: 'cm', label: 'ס"מ' },
  { id: 'm', label: 'מטר' },
]);

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * Active workers of a company matching the target filters. Every filter is
 * optional; filters combine (role AND district AND area).
 */
export function resolveAssignees(db, companyId, target = {}) {
  return db.users.filter((u) =>
    u.kind === 'worker'
    && u.companyId === companyId
    && u.active
    && (!target.roleId || u.roleId === target.roleId)
    && (!target.districtId || u.districtId === target.districtId)
    && (!target.areaId || u.areaId === target.areaId));
}

// ---------------------------------------------------------------------------
// Dispatch (manager)
// ---------------------------------------------------------------------------

export function dispatchTask(db, actor, input, ctx) {
  if (actor?.kind !== 'manager') throw new Error('רק מנהל חברה שולח משימות');
  const { title, description = '', categoryId, subcategoryId, target = {}, execDate, execTime = '08:00', dueDate, site = '' } = input;

  if (!title?.trim()) throw new Error('נדרשת כותרת משימה');
  const category = categoryById(db, categoryId);
  if (!category) throw new Error('יש לבחור קטגוריה');
  const sub = subcategoryById(db, categoryId, subcategoryId);
  if (!sub) throw new Error('יש לבחור תת-קטגוריה');
  if (!DATE_RE.test(execDate ?? '')) throw new Error('נדרש תאריך ביצוע (YYYY-MM-DD)');
  if (!TIME_RE.test(execTime)) throw new Error('שעת ביצוע לא תקינה (HH:MM)');
  if (!DATE_RE.test(dueDate ?? '')) throw new Error('נדרש תאריך יעד לסיום');
  if (dueDate < execDate) throw new Error('תאריך היעד חייב להיות בתאריך הביצוע או אחריו');

  const checks = (input.checks ?? sub.checks).map((c) => String(c).trim()).filter(Boolean);
  if (checks.length === 0) throw new Error('נדרשת לפחות בדיקה אחת במשימה');

  const assignees = resolveAssignees(db, actor.companyId, target);
  if (assignees.length === 0) throw new Error('לא נמצאו עובדים פעילים התואמים ליעד שנבחר');

  const task = {
    id: nextId(db, 'task'),
    companyId: actor.companyId,
    title: title.trim(),
    description: description.trim(),
    site: site.trim(),
    categoryId,
    subcategoryId,
    checks,
    target: { roleId: target.roleId ?? null, districtId: target.districtId ?? null, areaId: target.areaId ?? null },
    execDate,
    execTime,
    dueDate,
    createdBy: actor.id,
    createdAt: ctx.now(),
    assignments: assignees.map((w) => ({ workerId: w.id, status: STATUS.PENDING, draft: null, report: null })),
  };
  db.tasks.push(task);
  return task;
}

// ---------------------------------------------------------------------------
// Worker views & lifecycle
// ---------------------------------------------------------------------------

export function getAssignment(task, workerId) {
  return task.assignments.find((a) => a.workerId === workerId) ?? null;
}

/** Tasks assigned to a worker, optionally filtered to one execution date. */
export function tasksForWorker(db, workerId, { date } = {}) {
  return db.tasks
    .filter((t) => (!date || t.execDate === date) && getAssignment(t, workerId))
    .map((t) => ({ task: t, assignment: getAssignment(t, workerId) }))
    .sort((a, b) => (a.task.execDate + a.task.execTime).localeCompare(b.task.execDate + b.task.execTime));
}

export function startAssignment(db, actor, taskId, ctx) {
  const { task, assignment } = requireAssignment(db, actor, taskId);
  if (assignment.status !== STATUS.PENDING) throw new Error('המשימה כבר החלה');
  assignment.status = STATUS.IN_PROGRESS;
  assignment.startedAt = ctx.now();
  if (!assignment.draft) {
    assignment.draft = { items: task.checks.map(() => emptyDraftItem()) };
  }
  return assignment;
}

export function emptyDraftItem() {
  return { status: null, value: '', unit: 'cm', note: '', photos: [] };
}

export function saveDraft(db, actor, taskId, draft) {
  const { assignment } = requireAssignment(db, actor, taskId);
  if (assignment.status === STATUS.SUBMITTED || assignment.status === STATUS.APPROVED) {
    throw new Error('הדוח כבר נשלח — אין לערוך טיוטה');
  }
  assignment.draft = draft;
  return assignment;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * Validate a report against the task's checks. Returns a Hebrew error list
 * (empty = valid). Rules: an item per check; each item marked ok/defect;
 * EVERY item carries at least one photo (mandatory); defects require a
 * description; measurement optional — positive number in cm or m.
 */
export function validateReport(task, report) {
  const errors = [];
  const items = report?.items;
  if (!Array.isArray(items) || items.length !== task.checks.length) {
    return [`הדוח חייב לכלול את כל ${task.checks.length} הבדיקות`];
  }
  items.forEach((item, i) => {
    const label = task.checks[i];
    if (item.status !== 'ok' && item.status !== 'defect') {
      errors.push(`"${label}": יש לסמן תקין או ליקוי`);
    }
    if (!Array.isArray(item.photos) || item.photos.length === 0) {
      errors.push(`"${label}": חובה לצרף לפחות תמונה אחת`);
    }
    if (item.status === 'defect' && !item.note?.trim()) {
      errors.push(`"${label}": בליקוי חובה לתאר את הממצא`);
    }
    if (item.measurement != null) {
      const { value, unit } = item.measurement;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        errors.push(`"${label}": ערך מדידה חייב להיות מספר חיובי`);
      }
      if (unit !== 'cm' && unit !== 'm') {
        errors.push(`"${label}": יחידת מדידה חייבת להיות ס"מ או מטר`);
      }
    }
  });
  return errors;
}

export function submitReport(db, actor, taskId, report, ctx) {
  const { task, assignment } = requireAssignment(db, actor, taskId);
  if (assignment.status === STATUS.SUBMITTED || assignment.status === STATUS.APPROVED) {
    throw new Error('הדוח כבר נשלח');
  }
  const errors = validateReport(task, report);
  if (errors.length > 0) {
    const err = new Error('הדוח אינו שלם:\n• ' + errors.join('\n• '));
    err.errors = errors;
    throw err;
  }
  assignment.report = {
    items: report.items,
    summary: report.summary?.trim() ?? '',
    submittedAt: ctx.now(),
  };
  assignment.status = STATUS.SUBMITTED;
  assignment.draft = null;
  return assignment;
}

function requireManagerTask(db, actor, taskId) {
  if (actor?.kind !== 'manager') throw new Error('רק מנהל חברה מבצע פעולה זו');
  const task = db.tasks.find((t) => t.id === taskId && t.companyId === actor.companyId);
  if (!task) throw new Error('משימה לא נמצאה');
  return task;
}

export function approveAssignment(db, actor, taskId, workerId, ctx, { signature = null } = {}) {
  const task = requireManagerTask(db, actor, taskId);
  const assignment = getAssignment(task, workerId);
  if (!assignment) throw new Error('שיוך לא נמצא');
  if (assignment.status !== STATUS.SUBMITTED) throw new Error('ניתן לאשר רק דוח שנשלח');
  assignment.status = STATUS.APPROVED;
  assignment.approvedAt = ctx.now();
  assignment.approvedBy = actor.id;
  assignment.resolution = { kind: 'approved', at: ctx.now() };
  if (signature) {
    assignment.certificate = { signature, signedBy: actor.id, at: ctx.now() };
  }
  return assignment;
}

/**
 * Reject a report that has defects. Three outcomes, all recorded on the
 * assignment's `resolution` and (for fines) the company ledger:
 *   - 'reassign': send the SAME task to another worker (new pending assignment).
 *   - 'extend':   push the due date out and reopen this worker's assignment.
 *   - 'fine':     hold the company responsible with a monetary penalty.
 */
export function resolveDefect(db, actor, taskId, workerId, resolution, ctx) {
  const task = requireManagerTask(db, actor, taskId);
  const assignment = getAssignment(task, workerId);
  if (!assignment) throw new Error('שיוך לא נמצא');
  if (assignment.status !== STATUS.SUBMITTED) throw new Error('ניתן לטפל רק בדוח שנשלח');
  const { kind } = resolution;

  if (kind === 'reassign') {
    const toWorkerId = resolution.toWorkerId;
    const toWorker = db.users.find((u) => u.id === toWorkerId && u.kind === 'worker' && u.companyId === task.companyId && u.active);
    if (!toWorker) throw new Error('יש לבחור עובד פעיל להעברת המשימה');
    if (getAssignment(task, toWorkerId)) throw new Error('המשימה כבר משויכת לעובד זה');
    assignment.status = STATUS.REJECTED;
    assignment.resolution = { kind: 'reassigned', to: toWorkerId, reason: resolution.reason ?? '', at: ctx.now() };
    task.assignments.push({ workerId: toWorkerId, status: STATUS.PENDING, draft: null, report: null, reassignedFrom: workerId });
    return { task, newWorkerId: toWorkerId };
  }

  if (kind === 'extend') {
    if (!DATE_RE.test(resolution.dueDate ?? '')) throw new Error('נדרש תאריך יעד חדש תקין');
    if (resolution.dueDate <= task.dueDate) throw new Error('התאריך החדש חייב להיות מאוחר מהנוכחי');
    task.dueDate = resolution.dueDate;
    assignment.status = STATUS.IN_PROGRESS;
    assignment.report = null;
    assignment.resolution = { kind: 'extended', newDueDate: resolution.dueDate, reason: resolution.reason ?? '', at: ctx.now() };
    return { task };
  }

  if (kind === 'fine') {
    const amount = Number(resolution.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('נדרש סכום קנס חיובי');
    assignment.status = STATUS.REJECTED;
    assignment.resolution = { kind: 'fined', amount, reason: resolution.reason ?? '', at: ctx.now() };
    db.fines = db.fines ?? [];
    const fine = {
      id: `fine_${(db.meta.nextId++).toString(36).padStart(4, '0')}`,
      companyId: task.companyId,
      taskId, workerId,
      taskTitle: task.title,
      amount,
      reason: resolution.reason ?? '',
      status: 'open',
      issuedBy: actor.id,
      at: ctx.now(),
    };
    db.fines.push(fine);
    return { task, fine };
  }

  throw new Error('סוג טיפול לא מוכר');
}

export function companyFines(db, companyId) {
  return (db.fines ?? []).filter((f) => f.companyId === companyId);
}

export function finesSummary(db, companyId) {
  const fines = companyFines(db, companyId);
  const open = fines.filter((f) => f.status === 'open');
  return {
    count: fines.length,
    openCount: open.length,
    openAmount: open.reduce((s, f) => s + f.amount, 0),
    totalAmount: fines.reduce((s, f) => s + f.amount, 0),
  };
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const TERMINAL = new Set([STATUS.SUBMITTED, STATUS.APPROVED, STATUS.REJECTED]);

export function isOverdue(task, assignment, today) {
  return task.dueDate < today && !TERMINAL.has(assignment.status);
}

export function companyTasks(db, companyId) {
  return db.tasks
    .filter((t) => t.companyId === companyId)
    .sort((a, b) => (b.execDate + b.execTime).localeCompare(a.execDate + a.execTime));
}

export function companyStats(db, companyId, today) {
  const stats = { total: 0, pending: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0, overdue: 0 };
  for (const task of companyTasks(db, companyId)) {
    for (const a of task.assignments) {
      stats.total++;
      stats[a.status]++;
      if (isOverdue(task, a, today)) stats.overdue++;
    }
  }
  return stats;
}

function requireAssignment(db, actor, taskId) {
  if (actor?.kind !== 'worker') throw new Error('פעולה זו שמורה לעובדים');
  const task = db.tasks.find((t) => t.id === taskId);
  const assignment = task ? getAssignment(task, actor.id) : null;
  if (!task || !assignment) throw new Error('משימה לא נמצאה עבור עובד זה');
  return { task, assignment };
}
