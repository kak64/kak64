import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/util.js';
import { createDb, placeholderPhoto } from '../src/core/store.js';
import { createCompany, createManager, createWorker } from '../src/core/auth.js';
import {
  STATUS, resolveAssignees, dispatchTask, tasksForWorker, startAssignment,
  saveDraft, validateReport, submitReport, approveAssignment, isOverdue, companyStats,
} from '../src/core/tasks.js';

const ctx = () => ({ now: () => '2026-08-07T08:00:00.000Z', rng: createRng(42) });

function setup() {
  const c = ctx();
  const db = createDb(c);
  const admin = db.users[0];
  const company = createCompany(db, admin, { name: 'חברת בדיקה' }, c);
  const { user: manager } = createManager(db, admin, { companyId: company.id, name: 'מנהל' }, c);
  const { user: plumberCenter } = createWorker(db, manager, { name: 'יוסי', roleId: 'plumber', districtId: 'center', areaId: 'petah-tikva' }, c);
  const { user: plumberNorth } = createWorker(db, manager, { name: 'חיים', roleId: 'plumber', districtId: 'north', areaId: 'haifa' }, c);
  const { user: electricianCenter } = createWorker(db, manager, { name: 'דוד', roleId: 'electrician', districtId: 'center', areaId: 'rishon' }, c);
  return { db, admin, company, manager, plumberCenter, plumberNorth, electricianCenter, c };
}

const VALID_INPUT = {
  title: 'בדיקת קומפלטים',
  categoryId: 'plumbing',
  subcategoryId: 'complet',
  execDate: '2026-08-07',
  execTime: '08:00',
  dueDate: '2026-08-09',
};

function okItem() {
  return { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('בדיקה')] };
}

test('resolveAssignees filters by role, district, area — and combines filters', () => {
  const { db, company, plumberCenter, plumberNorth, electricianCenter } = setup();
  const all = resolveAssignees(db, company.id, {});
  assert.equal(all.length, 3);
  assert.deepEqual(resolveAssignees(db, company.id, { roleId: 'plumber' }).map((u) => u.id).sort(),
    [plumberCenter.id, plumberNorth.id].sort());
  assert.deepEqual(resolveAssignees(db, company.id, { districtId: 'center' }).map((u) => u.id).sort(),
    [plumberCenter.id, electricianCenter.id].sort());
  assert.deepEqual(resolveAssignees(db, company.id, { areaId: 'haifa' }).map((u) => u.id), [plumberNorth.id]);
  assert.deepEqual(resolveAssignees(db, company.id, { roleId: 'plumber', districtId: 'center' }).map((u) => u.id), [plumberCenter.id]);
});

test('dispatch creates one assignment per matched worker with default checks', () => {
  const { db, manager, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  assert.equal(task.assignments.length, 2);
  assert.ok(task.checks.length >= 3);
  assert.equal(task.assignments[0].status, STATUS.PENDING);
});

test('dispatch validation: dates, category, empty target', () => {
  const { db, manager, c } = setup();
  assert.throws(() => dispatchTask(db, manager, { ...VALID_INPUT, title: ' ' }, c), /כותרת/);
  assert.throws(() => dispatchTask(db, manager, { ...VALID_INPUT, categoryId: 'nope' }, c), /קטגוריה/);
  assert.throws(() => dispatchTask(db, manager, { ...VALID_INPUT, execDate: '7.8.2026' }, c), /תאריך ביצוע/);
  assert.throws(() => dispatchTask(db, manager, { ...VALID_INPUT, dueDate: '2026-08-06' }, c), /תאריך היעד/);
  assert.throws(() => dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'tiler' } }, c), /לא נמצאו עובדים/);
});

test('workers see tasks filtered by execution date, sorted by time', () => {
  const { db, manager, plumberCenter, c } = setup();
  dispatchTask(db, manager, { ...VALID_INPUT, title: 'מחר', execDate: '2026-08-08', dueDate: '2026-08-09', target: { roleId: 'plumber' } }, c);
  dispatchTask(db, manager, { ...VALID_INPUT, title: 'היום מאוחר', execTime: '14:00', target: { roleId: 'plumber' } }, c);
  dispatchTask(db, manager, { ...VALID_INPUT, title: 'היום מוקדם', execTime: '07:00', target: { roleId: 'plumber' } }, c);
  const today = tasksForWorker(db, plumberCenter.id, { date: '2026-08-07' });
  assert.deepEqual(today.map((x) => x.task.title), ['היום מוקדם', 'היום מאוחר']);
  assert.equal(tasksForWorker(db, plumberCenter.id).length, 3);
});

test('start moves to in_progress and creates an empty draft per check', () => {
  const { db, manager, plumberCenter, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  const a = startAssignment(db, plumberCenter, task.id, c);
  assert.equal(a.status, STATUS.IN_PROGRESS);
  assert.equal(a.draft.items.length, task.checks.length);
  assert.throws(() => startAssignment(db, plumberCenter, task.id, c), /כבר החלה/);
});

test('validateReport enforces mandatory photos per check', () => {
  const { db, manager, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  const items = task.checks.map(() => okItem());
  items[1].photos = [];
  const errors = validateReport(task, { items });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /חובה לצרף לפחות תמונה אחת/);
});

test('validateReport: defect requires note; measurement must be positive cm/m', () => {
  const { db, manager, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  const items = task.checks.map(() => okItem());
  items[0] = { ...okItem(), status: 'defect', note: '' };
  items[1] = { ...okItem(), measurement: { value: -5, unit: 'cm' } };
  items[2] = { ...okItem(), measurement: { value: 3, unit: 'inch' } };
  const errors = validateReport(task, { items });
  assert.equal(errors.length, 3);
  assert.match(errors[0], /לתאר את הממצא/);
  assert.match(errors[1], /מספר חיובי/);
  assert.match(errors[2], /ס"מ או מטר/);
});

test('validateReport rejects missing items and unmarked checks', () => {
  const { db, manager, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  assert.match(validateReport(task, { items: [okItem()] })[0], /כל/);
  const items = task.checks.map(() => okItem());
  items[0].status = null;
  assert.match(validateReport(task, { items })[0], /תקין או ליקוי/);
});

test('submit stores the report, clears the draft, and blocks re-submission', () => {
  const { db, manager, plumberCenter, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  startAssignment(db, plumberCenter, task.id, c);
  const items = task.checks.map(() => okItem());
  const a = submitReport(db, plumberCenter, task.id, { items, summary: 'הכל תקין' }, c);
  assert.equal(a.status, STATUS.SUBMITTED);
  assert.equal(a.draft, null);
  assert.equal(a.report.items.length, task.checks.length);
  assert.throws(() => submitReport(db, plumberCenter, task.id, { items }, c), /כבר נשלח/);
  assert.throws(() => saveDraft(db, plumberCenter, task.id, {}), /כבר נשלח/);
});

test('submit with invalid report throws with the error list attached', () => {
  const { db, manager, plumberCenter, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  const items = task.checks.map(() => ({ ...okItem(), photos: [] }));
  assert.throws(() => submitReport(db, plumberCenter, task.id, { items }, c), (err) => {
    assert.equal(err.errors.length, task.checks.length);
    return true;
  });
});

test('approval: manager-only, submitted-only, same company', () => {
  const { db, admin, manager, plumberCenter, plumberNorth, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  assert.throws(() => approveAssignment(db, manager, task.id, plumberCenter.id, c), /רק דוח שנשלח/);
  startAssignment(db, plumberCenter, task.id, c);
  submitReport(db, plumberCenter, task.id, { items: task.checks.map(() => okItem()) }, c);
  assert.throws(() => approveAssignment(db, admin, task.id, plumberCenter.id, c), /רק מנהל חברה/);
  const a = approveAssignment(db, manager, task.id, plumberCenter.id, c);
  assert.equal(a.status, STATUS.APPROVED);
  assert.equal(a.approvedBy, manager.id);

  const other = createCompany(db, admin, { name: 'חברה ב' }, c);
  const { user: otherManager } = createManager(db, admin, { companyId: other.id, name: 'מ' }, c);
  assert.throws(() => approveAssignment(db, otherManager, task.id, plumberNorth.id, c), /לא נמצאה/);
});

test('overdue: past due date and not yet submitted', () => {
  const { db, manager, plumberCenter, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: { roleId: 'plumber' } }, c);
  const a = task.assignments.find((x) => x.workerId === plumberCenter.id);
  assert.equal(isOverdue(task, a, '2026-08-09'), false);
  assert.equal(isOverdue(task, a, '2026-08-10'), true);
  startAssignment(db, plumberCenter, task.id, c);
  submitReport(db, plumberCenter, task.id, { items: task.checks.map(() => okItem()) }, c);
  assert.equal(isOverdue(task, a, '2026-08-10'), false);
});

test('companyStats aggregates assignment statuses', () => {
  const { db, company, manager, plumberCenter, c } = setup();
  const task = dispatchTask(db, manager, { ...VALID_INPUT, target: {} }, c); // all 3 workers
  startAssignment(db, plumberCenter, task.id, c);
  const stats = companyStats(db, company.id, '2026-08-07');
  assert.equal(stats.total, 3);
  assert.equal(stats.pending, 2);
  assert.equal(stats.in_progress, 1);
});
