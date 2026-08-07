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

/** Who may edit a company's branding: the app admin, or that company's manager. */
function assertCanBrand(actor, company) {
  const allowed = actor?.kind === 'appadmin'
    || (actor?.kind === 'manager' && actor.companyId === company.id);
  if (!allowed) throw new AuthError('אין הרשאה לשנות את מיתוג החברה');
}

export function regenerateLogo(db, actor, companyId, ctx) {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error('חברה לא נמצאה');
  assertCanBrand(actor, company);
  company.logoSeed = randomLogoSeed(ctx.rng);
  company.logoImage = null; // switch back to the generated mark
  return company.logoSeed;
}

/** Upload a custom logo image (data URL). Overrides the generated mark. */
export function setCompanyLogoImage(db, actor, companyId, dataUrl) {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error('חברה לא נמצאה');
  assertCanBrand(actor, company);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('נדרש קובץ תמונה תקין');
  }
  company.logoImage = dataUrl;
  return company;
}

export function clearCompanyLogoImage(db, actor, companyId) {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error('חברה לא נמצאה');
  assertCanBrand(actor, company);
  company.logoImage = null;
  return company;
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

// ---------------------------------------------------------------------------
// User management — rename, custom username, password reset, delete.
// Permission tiers:
//   - app admin: full control over managers and workers.
//   - company manager: full control over workers in their own company.
//   - supervisory workers (מנהל פרויקט / מהנדס ביצוע / מנהל עבודה): may reset a
//     forgotten password and toggle activity for workers in their own company.
// ---------------------------------------------------------------------------

export const SUPERVISORY_ROLES = Object.freeze(['project-manager', 'site-engineer', 'foreman']);

function sameCompanyWorker(actor, target) {
  return target.kind === 'worker' && target.companyId === actor.companyId;
}

/** Full control: rename, set username, delete. */
export function canManageFully(actor, target) {
  if (!actor || !target) return false;
  if (actor.kind === 'appadmin') return target.kind !== 'appadmin';
  if (actor.kind === 'manager') return sameCompanyWorker(actor, target);
  return false;
}

/** Reset password / toggle active — broader (supervisors included). */
export function canResetCredentials(actor, target) {
  if (canManageFully(actor, target)) return true;
  if (actor?.kind === 'worker' && SUPERVISORY_ROLES.includes(actor.roleId)) {
    return sameCompanyWorker(actor, target) && target.id !== actor.id;
  }
  return false;
}

export function setUserActive(db, actor, userId, active) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (!canResetCredentials(actor, user)) throw new AuthError('אין הרשאה לנהל משתמש זה');
  user.active = Boolean(active);
  return user;
}

export function renameUser(db, actor, userId, name) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (!canManageFully(actor, user)) throw new AuthError('אין הרשאה לשנות שם משתמש זה');
  if (!name?.trim()) throw new Error('נדרש שם');
  user.name = name.trim();
  return user;
}

/**
 * Reset a user's password. Pass a specific password, or omit to generate one.
 * Returns the new password so the manager can hand it to the worker.
 */
export function resetPassword(db, actor, userId, newPassword, ctx = { rng: Math.random }) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (!canResetCredentials(actor, user)) throw new AuthError('אין הרשאה לאפס סיסמה למשתמש זה');
  const pass = newPassword?.trim() || genPassword(ctx.rng);
  if (pass.length < 4) throw new Error('הסיסמה חייבת להכיל לפחות 4 תווים');
  user.password = pass;
  return pass;
}

/** Change a user's login username to a chosen value (validated + unique). */
export function changeUsername(db, actor, userId, username) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (!canManageFully(actor, user)) throw new AuthError('אין הרשאה לשנות שם משתמש זה');
  const clean = normalizeUsername(username);
  if (clean.length < 3) throw new Error('שם משתמש חייב לפחות 3 תווים (אותיות אנגלית, ספרות, מקף)');
  if (db.users.some((u) => u.username === clean && u.id !== userId)) throw new Error('שם המשתמש כבר תפוס');
  user.username = clean;
  return clean;
}

export function deleteUser(db, actor, userId) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (user.id === actor.id) throw new Error('אי אפשר למחוק את המשתמש שלך');
  if (!canManageFully(actor, user)) throw new AuthError('אין הרשאה למחוק משתמש זה');
  if (user.kind === 'manager') {
    const workers = db.users.filter((u) => u.kind === 'worker' && u.companyId === user.companyId);
    if (workers.length > 0) throw new Error('לא ניתן למחוק מנהל שיש תחתיו עובדים — מחק/העבר אותם קודם');
  }
  // Remove the user's task assignments so nothing is orphaned.
  for (const task of db.tasks) {
    task.assignments = task.assignments.filter((a) => a.workerId !== userId);
  }
  db.users = db.users.filter((u) => u.id !== userId);
  return user;
}

/** Latin-only, lowercased, safe username slug. */
export function normalizeUsername(raw) {
  return String(raw ?? '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
}

/** Is a chosen username free (and valid) for a new/edited user? */
export function usernameAvailable(db, username, exceptId = null) {
  const clean = normalizeUsername(username);
  if (clean.length < 3) return false;
  return !db.users.some((u) => u.username === clean && u.id !== exceptId);
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
