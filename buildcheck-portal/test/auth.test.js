import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/util.js';
import { createDb } from '../src/core/store.js';
import {
  genPassword, genUsername, createCompany, createManager, createWorker,
  authenticate, setUserActive, regenerateLogo, AuthError,
} from '../src/core/auth.js';

const ctx = () => ({ now: () => '2026-08-07T08:00:00.000Z', rng: createRng(42) });

function setup() {
  const c = ctx();
  const db = createDb(c);
  const admin = db.users[0];
  const company = createCompany(db, admin, { name: 'חברת בדיקה' }, c);
  const { user: manager } = createManager(db, admin, { companyId: company.id, name: 'מנהל בדיקה' }, c);
  return { db, admin, company, manager, c };
}

test('db starts with a single app-admin (admin/1234)', () => {
  const db = createDb(ctx());
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].kind, 'appadmin');
  assert.ok(authenticate(db, 'admin', '1234'));
});

test('generated passwords use the unambiguous charset', () => {
  const pass = genPassword(createRng(7), 8);
  assert.equal(pass.length, 8);
  assert.doesNotMatch(pass, /[0O1lIi]/);
});

test('usernames are unique: base, base2, base3...', () => {
  const { db, manager, c } = setup();
  const first = createWorker(db, manager, { name: 'א', roleId: 'plumber' }, c);
  const second = createWorker(db, manager, { name: 'ב', roleId: 'plumber' }, c);
  const third = createWorker(db, manager, { name: 'ג', roleId: 'plumber' }, c);
  assert.equal(first.credentials.username, 'plumber');
  assert.equal(second.credentials.username, 'plumber2');
  assert.equal(third.credentials.username, 'plumber3');
  assert.equal(genUsername(db, 'plumber'), 'plumber4');
});

test('only the app admin creates companies and managers', () => {
  const { db, manager, c } = setup();
  assert.throws(() => createCompany(db, manager, { name: 'אחרת' }, c), AuthError);
  assert.throws(() => createManager(db, manager, { companyId: 'x', name: 'מ' }, c), AuthError);
});

test('worker creation needs only name + registered role; credentials auto-generated', () => {
  const { db, manager, c } = setup();
  const { user, credentials } = createWorker(db, manager, { name: 'יוסי כהן', roleId: 'plumber' }, c);
  assert.equal(user.kind, 'worker');
  assert.equal(user.companyId, manager.companyId);
  assert.equal(user.roleId, 'plumber');
  assert.ok(credentials.username.startsWith('plumber'));
  assert.equal(credentials.password.length, 8);
  assert.equal(authenticate(db, credentials.username, credentials.password), user);
});

test('worker creation rejects unknown role, district, or mismatched area', () => {
  const { db, manager, c } = setup();
  assert.throws(() => createWorker(db, manager, { name: 'א', roleId: 'nope' }, c), /תפקיד/);
  assert.throws(() => createWorker(db, manager, { name: 'א', roleId: 'plumber', districtId: 'nope' }, c), /מחוז/);
  assert.throws(() => createWorker(db, manager, { name: 'א', roleId: 'plumber', districtId: 'north', areaId: 'rishon' }, c), /אזור/);
});

test('only managers create workers', () => {
  const { db, admin, c } = setup();
  assert.throws(() => createWorker(db, admin, { name: 'א', roleId: 'plumber' }, c), AuthError);
});

test('authenticate rejects wrong password and inactive users', () => {
  const { db, manager, c } = setup();
  const { user, credentials } = createWorker(db, manager, { name: 'א', roleId: 'tiler' }, c);
  assert.equal(authenticate(db, credentials.username, 'wrong'), null);
  setUserActive(db, manager, user.id, false);
  assert.equal(authenticate(db, credentials.username, credentials.password), null);
});

test('a manager cannot deactivate workers of another company', () => {
  const { db, admin, manager, c } = setup();
  const other = createCompany(db, admin, { name: 'חברה שנייה' }, c);
  const { user: otherManager } = createManager(db, admin, { companyId: other.id, name: 'מנהל ב' }, c);
  const { user: worker } = createWorker(db, manager, { name: 'א', roleId: 'plumber' }, c);
  assert.throws(() => setUserActive(db, otherManager, worker.id, false), AuthError);
});

test('logo regeneration: own company manager + admin allowed, foreign manager not', () => {
  const { db, admin, manager, company, c } = setup();
  const before = company.logoSeed;
  const after = regenerateLogo(db, admin, company.id, c);
  assert.notEqual(after, before);
  // The company's own manager may also re-brand.
  const own = regenerateLogo(db, manager, company.id, c);
  assert.notEqual(own, after);
  // A manager of another company may not.
  const other = createCompany(db, admin, { name: 'חברה אחרת' }, c);
  const { user: foreignManager } = createManager(db, admin, { companyId: other.id, name: 'זר' }, c);
  assert.throws(() => regenerateLogo(db, foreignManager, company.id, c), AuthError);
});
