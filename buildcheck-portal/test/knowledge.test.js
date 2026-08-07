import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng, todayStr } from '../src/core/util.js';
import { createDb, seedDemo } from '../src/core/store.js';
import { askAssistant, KNOWLEDGE } from '../src/core/knowledge.js';
import { reportTrend, defectsByCategory, collectDefects } from '../src/core/analytics.js';

function setup() {
  const c = { now: () => new Date().toISOString(), rng: createRng(42) };
  const db = createDb(c);
  seedDemo(db, c);
  const manager = db.users.find((u) => u.username === 'ohad');
  const worker = db.users.find((u) => u.username === 'yossi');
  const admin = db.users.find((u) => u.username === 'admin');
  return { db, manager, worker, admin, today: todayStr() };
}

test('assistant: manager overdue query answers from live data', () => {
  const { db, manager, today } = setup();
  const res = askAssistant(db, manager, 'כמה משימות באיחור?', { today });
  assert.equal(res.source, 'data');
  assert.match(res.answer, /באיחור/);
});

test('assistant: manager defect breakdown counts real defects per category', () => {
  const { db, manager, today } = setup();
  const res = askAssistant(db, manager, 'מה מצב הליקויים?', { today });
  assert.equal(res.source, 'data');
  assert.match(res.answer, /ליקויים בסך הכול/);
  assert.match(res.answer, /אינסטלציה|איטום|גמר|בטיחות|חשמל/);
});

test('assistant: top-worker ranking', () => {
  const { db, manager, today } = setup();
  const res = askAssistant(db, manager, 'מי העובד המוביל הכי טוב?', { today });
  assert.equal(res.source, 'data');
  assert.match(res.answer, /דוחות/);
});

test('assistant: worker "today" lists only own open tasks', () => {
  const { db, worker, today } = setup();
  const res = askAssistant(db, worker, 'מה יש לי היום?', { today });
  assert.equal(res.source, 'data');
  assert.match(res.answer, /קומפלטים|אין לך משימות/);
  assert.doesNotMatch(res.answer, /ניקוזי מזגן/); // moshe's task, not yossi's
});

test('assistant: knowledge base answers norms with dispatch action for managers', () => {
  const { db, manager, worker, today } = setup();
  const m = askAssistant(db, manager, 'מה גובה נקודות מים בכיור?', { today });
  assert.equal(m.source, 'knowledge');
  assert.match(m.answer, /60 ס"מ/);
  assert.equal(m.actions[0]?.type, 'dispatch_draft');
  const w = askAssistant(db, worker, 'איזה שיפוע דלוחין תקין?', { today });
  assert.equal(w.source, 'knowledge');
  assert.match(w.answer, /1\.5%–2%/);
  assert.equal(w.actions.length, 0);
});

test('assistant: unknown question falls back to help', () => {
  const { db, worker, today } = setup();
  const res = askAssistant(db, worker, 'מה השעה בטוקיו?', { today });
  assert.equal(res.source, 'help');
});

test('assistant: app admin gets system-level summary', () => {
  const { db, admin, today } = setup();
  const res = askAssistant(db, admin, 'מה הסטטוס?', { today });
  assert.match(res.answer, /2 חברות/);
});

test('knowledge base entries are well-formed', () => {
  for (const entry of KNOWLEDGE) {
    assert.ok(entry.keywords.length >= 2, entry.id);
    assert.ok(entry.answer.length > 30, entry.id);
  }
});

test('analytics: trend buckets cover the window and count history', () => {
  const { db, manager, today } = setup();
  const trend = reportTrend(db, manager.companyId, today, 14);
  assert.equal(trend.length, 14);
  assert.equal(trend[13].date, today);
  const total = trend.reduce((s, b) => s + b.count, 0);
  assert.ok(total >= 8, `expected >=8 historical reports in window, got ${total}`);
});

test('analytics: defect rates and export rows', () => {
  const { db, manager } = setup();
  const defects = defectsByCategory(db, manager.companyId);
  assert.ok(defects.length >= 3);
  assert.ok(defects[0].defects >= 1);
  assert.ok(defects.every((d) => d.checks >= d.defects));
  const rows = collectDefects(db, manager.companyId);
  assert.ok(rows.length >= 4);
  assert.ok(rows.every((r) => r.note && r.photos >= 1));
});
