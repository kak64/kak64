import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng, todayStr, addDaysStr } from '../src/core/util.js';
import { createDb, seedDemo, placeholderPhoto } from '../src/core/store.js';
import {
  STATUS, dispatchTask, startAssignment, submitReport, getAssignment,
  resolveDefect, companyFines, finesSummary,
} from '../src/core/tasks.js';
import { riskScore } from '../src/core/analytics.js';
import { buildScanReport, analyzePixels } from '../src/core/planstudio.js';
import { buildDefectsCsv, buildReportHtml, buildCertificateHtml, toCsv } from '../src/core/reports.js';
import { createWorker } from '../src/core/auth.js';

function setup() {
  const c = { now: () => new Date().toISOString(), rng: createRng(42) };
  const db = createDb(c);
  seedDemo(db, c);
  const manager = db.users.find((u) => u.username === 'ohad');
  return { db, manager, c };
}

function defectTask(db, manager, worker, c) {
  const task = dispatchTask(db, manager, {
    title: 'בדיקה עם ליקוי', categoryId: 'plumbing', subcategoryId: 'complet',
    target: { roleId: worker.roleId, districtId: worker.districtId },
    execDate: todayStr(), execTime: '08:00', dueDate: addDaysStr(todayStr(), 1),
  }, c);
  startAssignment(db, worker, task.id, c);
  submitReport(db, worker, task.id, {
    items: task.checks.map((l, i) => (i === 0
      ? { status: 'defect', measurement: null, note: 'ליקוי', photos: [placeholderPhoto('x')] }
      : { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('y')] })),
  }, c);
  return task;
}

test('resolveDefect reassign: original rejected, new pending assignment created', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const { user: other } = createWorker(db, manager, { name: 'אינסטלטור 2', roleId: 'plumber' }, c);
  const task = defectTask(db, manager, yossi, c);
  const res = resolveDefect(db, manager, task.id, yossi.id, { kind: 'reassign', toWorkerId: other.id, reason: 'לתקן' }, c);
  assert.equal(res.newWorkerId, other.id);
  assert.equal(getAssignment(task, yossi.id).status, STATUS.REJECTED);
  assert.equal(getAssignment(task, other.id).status, STATUS.PENDING);
});

test('resolveDefect extend: due date pushed, assignment reopened', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const task = defectTask(db, manager, yossi, c);
  const newDue = addDaysStr(task.dueDate, 3);
  resolveDefect(db, manager, task.id, yossi.id, { kind: 'extend', dueDate: newDue, reason: 'עוד זמן' }, c);
  assert.equal(task.dueDate, newDue);
  assert.equal(getAssignment(task, yossi.id).status, STATUS.IN_PROGRESS);
  assert.equal(getAssignment(task, yossi.id).report, null);
});

test('resolveDefect extend rejects an earlier/equal date', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const task = defectTask(db, manager, yossi, c);
  assert.throws(() => resolveDefect(db, manager, task.id, yossi.id, { kind: 'extend', dueDate: task.dueDate }, c), /מאוחר/);
});

test('resolveDefect fine: creates a company fine and rejects assignment', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const task = defectTask(db, manager, yossi, c);
  const before = companyFines(db, manager.companyId).length;
  const { fine } = resolveDefect(db, manager, task.id, yossi.id, { kind: 'fine', amount: 1800, reason: 'ליקוי חוזר' }, c);
  assert.equal(fine.amount, 1800);
  assert.equal(getAssignment(task, yossi.id).status, STATUS.REJECTED);
  assert.equal(companyFines(db, manager.companyId).length, before + 1);
  const sum = finesSummary(db, manager.companyId);
  assert.ok(sum.openAmount >= 1800);
});

test('resolveDefect fine rejects non-positive amount', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const task = defectTask(db, manager, yossi, c);
  assert.throws(() => resolveDefect(db, manager, task.id, yossi.id, { kind: 'fine', amount: 0 }, c), /סכום/);
});

test('only same-company manager may resolve', () => {
  const { db, manager, c } = setup();
  const yossi = db.users.find((u) => u.username === 'yossi');
  const rona = db.users.find((u) => u.username === 'rona');
  const task = defectTask(db, manager, yossi, c);
  assert.throws(() => resolveDefect(db, rona, task.id, yossi.id, { kind: 'fine', amount: 100 }, c), /לא נמצאה/);
});

test('riskScore reflects defects/fines with a band', () => {
  const { db, manager } = setup();
  const risk = riskScore(db, manager.companyId, todayStr());
  assert.ok(risk.score >= 0 && risk.score <= 100);
  assert.ok(['low', 'medium', 'high'].includes(risk.band));
  assert.ok(risk.factors.openFines >= 1); // seed has a fine
});

test('scan report: honest structure with confidence, warnings, must-verify', () => {
  // Drawing-like raster.
  const w = 120, h = 120;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (x % 20 === 0 || y % 20 === 0) ? 10 : 250;
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const m = analyzePixels({ data, width: w, height: h });
  const rep = buildScanReport(m);
  assert.ok(['2d', '3d', 'photo'].includes(rep.kind));
  assert.ok(rep.confidence >= 5 && rep.confidence <= 95);
  assert.ok(rep.findings.length >= 4);
  assert.ok(rep.mustVerify.length >= 3, 'always lists human-verify items');
  assert.ok(Array.isArray(rep.warnings));
});

test('CSV export has a BOM, header row, and defect rows', () => {
  const { db, manager } = setup();
  const name = (id) => db.users.find((u) => u.id === id)?.name ?? '';
  const csv = buildDefectsCsv(db, manager.companyId, name);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /תיאור הליקוי/);
  assert.ok(csv.split('\r\n').length >= 3);
});

test('toCsv escapes commas and quotes', () => {
  const csv = toCsv([['a,b', 'he said "hi"']]);
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"he said ""hi"""/);
});

test('report HTML is a self-contained document with the checks', () => {
  const { db, manager } = setup();
  const t3 = db.tasks.find((t) => t.title.includes('דירה 8'));
  const a = t3.assignments[0];
  const html = buildReportHtml({
    company: { name: 'חברה' }, task: t3, assignment: a,
    workerName: 'דוד', approverName: 'אוהד', categoryName: 'חשמל',
  });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /דוח בקרת שטח/);
  assert.match(html, /שקע מטבח/);
});

test('certificate HTML embeds signature and cert id', () => {
  const html = buildCertificateHtml({
    company: { name: 'חברה' }, task: { title: 'משימה', site: 'אתר', execDate: '2026-08-01' },
    workerName: 'יוסי', approverName: 'אוהד',
    signatureDataUrl: 'data:image/png;base64,AAA', certId: 'CERT-001', date: '2026-08-07',
  });
  assert.match(html, /תעודת מסירה דיגיטלית/);
  assert.match(html, /CERT-001/);
  assert.match(html, /data:image\/png/);
});
