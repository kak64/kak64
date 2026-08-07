import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/util.js';
import { createDb, seedDemo, serializeDb, deserializeDb } from '../src/core/store.js';
import { addRole, addCategory, addSubcategory, subcategoryById } from '../src/core/directory.js';
import { generateLogo, initialsOf } from '../src/core/logo.js';
import { authenticate } from '../src/core/auth.js';
import { STATUS } from '../src/core/tasks.js';

const ctx = () => ({ now: () => '2026-08-07T08:00:00.000Z', rng: createRng(42) });

test('base registries: roles, districts with areas, categories with subs and checks', () => {
  const db = createDb(ctx());
  assert.ok(db.roles.length >= 8);
  assert.ok(db.districts.every((d) => d.areas.length >= 3));
  assert.ok(db.categories.length >= 5);
  for (const cat of db.categories) {
    assert.ok(cat.subs.length >= 3, `category ${cat.id} needs subs`);
    for (const sub of cat.subs) assert.ok(sub.checks.length >= 3, `sub ${sub.id} needs checks`);
  }
});

test('registry management is app-admin only; additions get unique ids', () => {
  const c = ctx();
  const db = createDb(c);
  const admin = db.users[0];
  const role = addRole(db, admin, { name: 'מסגר' });
  assert.ok(db.roles.some((r) => r.id === role.id));
  assert.throws(() => addRole(db, { kind: 'manager' }, { name: 'אחר' }), /מנהל האפליקציה/);
  assert.throws(() => addRole(db, admin, { name: 'מסגר' }), /כבר קיים/);

  const cat = addCategory(db, admin, { name: 'פיתוח חוץ', icon: '🌳' });
  const sub = addSubcategory(db, admin, cat.id, { name: 'ריצוף שבילים', checks: ['פילוס', 'תשתית'] });
  assert.equal(subcategoryById(db, cat.id, sub.id).checks.length, 2);
  assert.throws(() => addSubcategory(db, admin, 'nope', { name: 'x' }), /לא נמצאה/);
});

test('logo: deterministic per seed, varies across seeds, carries initials', () => {
  const a1 = generateLogo(7, 'א.ב. בנייה והנדסה');
  const a2 = generateLogo(7, 'א.ב. בנייה והנדסה');
  const b = generateLogo(1234567, 'א.ב. בנייה והנדסה');
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.match(a1, /<svg /);
  assert.ok(a1.includes('אב'));
  assert.equal(initialsOf('חברה אחת בע"מ'), 'חא');
  assert.equal(initialsOf('סולו'), 'ס');
});

test('demo seed: fixed credentials, two companies, live history with photos', () => {
  const c = ctx();
  const db = createDb(c);
  seedDemo(db, c);
  assert.ok(authenticate(db, 'admin', '1234'));
  assert.ok(authenticate(db, 'ohad', '1234'));
  assert.ok(authenticate(db, 'yossi', '1234'));
  assert.ok(authenticate(db, 'rona', '1234'));
  assert.equal(db.companies.length, 2);
  assert.equal(db.tasks.length, 13);
  const submitted = db.tasks.flatMap((t) => t.assignments).filter((a) => a.status === STATUS.SUBMITTED);
  const approved = db.tasks.flatMap((t) => t.assignments).filter((a) => a.status === STATUS.APPROVED);
  assert.equal(submitted.length, 3);
  assert.equal(approved.length, 8);
  assert.ok(submitted.every((a) => a.report.items.every((i) => i.photos.length >= 1)));
  assert.ok(submitted.some((a) => a.report.items.some((i) => i.status === 'defect')));
});

test('serialization round-trip preserves the db; bad json rejected', () => {
  const c = ctx();
  const db = createDb(c);
  seedDemo(db, c);
  const restored = deserializeDb(serializeDb(db));
  assert.deepEqual(restored, db);
  assert.equal(deserializeDb('not json'), null);
  assert.equal(deserializeDb('{"version":99}'), null);
});
