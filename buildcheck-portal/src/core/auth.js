// BuildCheck Portal — accounts & credentials.
// Hierarchy: app admin (מנהל האפליקציה) creates client companies and their
// managers; a company manager creates workers by entering only a name and a
// role picked from the app-level registry — a unique username and password
// are generated automatically and shown once.
//
// NOTE: this is a client-side demo data layer. In production, authentication
// moves to a server with salted password hashing (e.g. bcrypt) — plaintext
// credentials here are demo-only by design.

import { nextId } from './util.js';
import { roleById, districtById, areaById } from './directory.js';
import { randomLogoSeed } from './logo.js';

export class AuthError extends Error {
  constructor(message) { super(message); this.name = 'AuthError'; }
}

/** Unambiguous charset — no 0/O/1/l/I lookalikes a foreman could mistype. */
const PASS_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function genPassword(rng = Math.random, length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) out += PASS_CHARS[Math.floor(rng() * PASS_CHARS.length)];
  return out;
}

/** Unique username from a latin base: plumber, plumber2, plumber3, ... */
export function genUsername(db, base) {
  const clean = String(base ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'user';
  const taken = new Set(db.users.map((u) => u.username));
  if (!taken.has(clean)) return clean;
  let i = 2;
  while (taken.has(`${clean}${i}`)) i++;
  return `${clean}${i}`;
}

function assertKind(actor, kind, what) {
  if (actor?.kind !== kind) throw new AuthError(`אין הרשאה: ${what}`);
}

// ---------------------------------------------------------------------------
// Companies (app admin)
// ---------------------------------------------------------------------------

export function createCompany(db, actor, { name }, ctx) {
  assertKind(actor, 'appadmin', 'רק מנהל האפליקציה פותח חברות');
  if (!name?.trim()) throw new Error('נדרש שם חברה');
  if (db.companies.some((c) => c.name === name.trim())) throw new Error('חברה בשם זה כבר קיימת');
  const company = {
    id: nextId(db, 'co'),
    name: name.trim(),
    logoSeed: randomLogoSeed(ctx.rng),
    createdAt: ctx.now(),
  };
  db.companies.push(company);
  return company;
}

export function regenerateLogo(db, actor, companyId, ctx) {
  assertKind(actor, 'appadmin', 'רק מנהל האפליקציה מחליף לוגו');
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error('חברה לא נמצאה');
  company.logoSeed = randomLogoSeed(ctx.rng);
  return company.logoSeed;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function createManager(db, actor, { companyId, name, username, password }, ctx) {
  assertKind(actor, 'appadmin', 'רק מנהל האפליקציה פותח מנהלי חברה');
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error('חברה לא נמצאה');
  if (!name?.trim()) throw new Error('נדרש שם מנהל');
  return addUser(db, {
    kind: 'manager', companyId, name: name.trim(),
    usernameBase: 'mgr', username, password,
  }, ctx);
}

export function createWorker(db, actor, { name, roleId, districtId, areaId, username, password }, ctx) {
  assertKind(actor, 'manager', 'רק מנהל חברה פותח עובדים');
  if (!name?.trim()) throw new Error('נדרש שם עובד');
  const role = roleById(db, roleId);
  if (!role) throw new Error('יש לבחור תפקיד מתוך התפקידים הרשומים באפליקציה');
  if (districtId && !districtById(db, districtId)) throw new Error('מחוז לא מוכר');
  if (districtId && areaId && !areaById(db, districtId, areaId)) throw new Error('אזור לא שייך למחוז שנבחר');
  return addUser(db, {
    kind: 'worker', companyId: actor.companyId, name: name.trim(),
    roleId, districtId: districtId ?? null, areaId: areaId ?? null,
    usernameBase: role.slug, username, password,
  }, ctx);
}

function addUser(db, { kind, companyId, name, roleId = null, districtId = null, areaId = null, usernameBase, username, password }, ctx) {
  const finalUsername = username ?? genUsername(db, usernameBase);
  if (db.users.some((u) => u.username === finalUsername)) throw new Error('שם המשתמש כבר תפוס');
  const finalPassword = password ?? genPassword(ctx.rng);
  const user = {
    id: nextId(db, 'usr'),
    kind, companyId, name, roleId, districtId, areaId,
    username: finalUsername,
    password: finalPassword,
    active: true,
    createdAt: ctx.now(),
  };
  db.users.push(user);
  return { user, credentials: { username: finalUsername, password: finalPassword } };
}

export function setUserActive(db, actor, userId, active) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  const allowed = actor?.kind === 'appadmin'
    || (actor?.kind === 'manager' && user.kind === 'worker' && user.companyId === actor.companyId);
  if (!allowed) throw new AuthError('אין הרשאה לנהל משתמש זה');
  user.active = Boolean(active);
  return user;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function authenticate(db, username, password) {
  const user = db.users.find((u) => u.username === String(username ?? '').trim().toLowerCase());
  if (!user || !user.active || user.password !== password) return null;
  return user;
}

export function companyOf(db, user) {
  return db.companies.find((c) => c.id === user?.companyId) ?? null;
}
