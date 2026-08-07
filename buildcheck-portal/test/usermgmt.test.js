import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/util.js';
import { createDb, seedDemo } from '../src/core/store.js';
import {
  createCompany, createManager, createWorker, authenticate,
  renameUser, resetPassword, changeUsername, deleteUser, usernameAvailable,
  setCompanyLogoImage, clearCompanyLogoImage, regenerateLogo,
  canResetCredentials, canManageFully, AuthError,
} from '../src/core/auth.js';

const ctx = () => ({ now: () => '2026-08-07T08:00:00.000Z', rng: createRng(7) });

function setup() {
  const c = ctx();
  const db = createDb(c);
  const admin = db.users[0];
  const company = createCompany(db, admin, { name: 'חברת בדיקה' }, c);
  const { user: manager } = createManager(db, admin, { companyId: company.id, name: 'מנהל' }, c);
  return { db, admin, company, manager, c };
}

test('custom username on worker creation (non-random)', () => {
  const { db, manager, c } = setup();
  const { user, credentials } = createWorker(db, manager, { name: 'יוסי', roleId: 'plumber', username: 'yossi-k' }, c);
  assert.equal(credentials.username, 'yossi-k');
  assert.equal(authenticate(db, 'yossi-k', credentials.password), user);
});

test('usernameAvailable enforces length and uniqueness', () => {
  const { db, manager, c } = setup();
  createWorker(db, manager, { name: 'א', roleId: 'plumber', username: 'sami' }, c);
  assert.equal(usernameAvailable(db, 'sami'), false);
  assert.equal(usernameAvailable(db, 'ab'), false);
  assert.equal(usernameAvailable(db, 'newguy'), true);
});

test('rename, reset password, change username by manager', () => {
  const { db, manager, c } = setup();
  const { user } = createWorker(db, manager, { name: 'שם ישן', roleId: 'tiler' }, c);
  renameUser(db, manager, user.id, 'שם חדש');
  assert.equal(user.name, 'שם חדש');

  const newPass = resetPassword(db, manager, user.id, 'temp123', c);
  assert.equal(newPass, 'temp123');
  assert.ok(authenticate(db, user.username, 'temp123'));

  const generated = resetPassword(db, manager, user.id, null, c);
  assert.equal(generated.length, 8);

  changeUsername(db, manager, user.id, 'Avi_New!');
  assert.equal(user.username, 'avinew');
  assert.ok(authenticate(db, 'avinew', generated));
});

test('reset password rejects too-short values', () => {
  const { db, manager, c } = setup();
  const { user } = createWorker(db, manager, { name: 'א', roleId: 'tiler' }, c);
  assert.throws(() => resetPassword(db, manager, user.id, '12', c), /4 תווים/);
});

test('supervisory worker can reset a peer password but not rename/delete', () => {
  const { db, manager, c } = setup();
  const { user: pm } = createWorker(db, manager, { name: 'מנהל פרויקט', roleId: 'project-manager' }, c);
  const { user: worker } = createWorker(db, manager, { name: 'עובד', roleId: 'tiler' }, c);
  assert.equal(canResetCredentials(pm, worker), true);
  assert.equal(canManageFully(pm, worker), false);
  const p = resetPassword(db, pm, worker.id, 'reset99', c);
  assert.equal(p, 'reset99');
  assert.throws(() => renameUser(db, pm, worker.id, 'x'), AuthError);
  assert.throws(() => deleteUser(db, pm, worker.id), AuthError);
});

test('a plain worker cannot reset anyone', () => {
  const { db, manager, c } = setup();
  const { user: a } = createWorker(db, manager, { name: 'א', roleId: 'tiler' }, c);
  const { user: b } = createWorker(db, manager, { name: 'ב', roleId: 'tiler' }, c);
  assert.equal(canResetCredentials(a, b), false);
});

test('delete removes the user and their task assignments', () => {
  const c = ctx();
  const db = createDb(c);
  seedDemo(db, c);
  const manager = db.users.find((u) => u.username === 'ohad');
  const yossi = db.users.find((u) => u.username === 'yossi');
  const before = db.tasks.filter((t) => t.assignments.some((a) => a.workerId === yossi.id)).length;
  assert.ok(before > 0);
  deleteUser(db, manager, yossi.id);
  assert.equal(db.users.some((u) => u.id === yossi.id), false);
  assert.equal(db.tasks.some((t) => t.assignments.some((a) => a.workerId === yossi.id)), false);
});

test('cannot delete self; manager cannot delete another company worker', () => {
  const { db, admin, manager, c } = setup();
  const other = createCompany(db, admin, { name: 'חברה ב' }, c);
  const { user: om } = createManager(db, admin, { companyId: other.id, name: 'מנהל ב' }, c);
  const { user: worker } = createWorker(db, manager, { name: 'א', roleId: 'tiler' }, c);
  assert.throws(() => deleteUser(db, manager, manager.id), /שלך/);
  assert.throws(() => deleteUser(db, om, worker.id), AuthError);
});

test('logo image upload overrides generated mark; regenerate clears it', () => {
  const { db, admin, manager, company, c } = setup();
  const png = 'data:image/png;base64,AAAA';
  setCompanyLogoImage(db, admin, company.id, png);
  assert.equal(company.logoImage, png);
  regenerateLogo(db, admin, company.id, c);
  assert.equal(company.logoImage, null);

  // The company's own manager may also brand; a foreign manager may not.
  setCompanyLogoImage(db, manager, company.id, png);
  assert.equal(company.logoImage, png);
  clearCompanyLogoImage(db, manager, company.id);
  assert.equal(company.logoImage, null);
  const other = createManager(db, admin, { companyId: createCompany(db, admin, { name: 'ג' }, c).id, name: 'מ' }, c).user;
  assert.throws(() => setCompanyLogoImage(db, other, company.id, png), AuthError);
});

test('logo upload rejects non-image data', () => {
  const { db, admin, company } = setup();
  assert.throws(() => setCompanyLogoImage(db, admin, company.id, 'hello'), /תמונה/);
});
