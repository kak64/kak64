// BuildCheck Portal — shared utilities: ids, seeded RNG, date helpers.

/** Deterministic RNG (mulberry32) — injectable for reproducible tests. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Execution context: clock + randomness, injectable for tests. */
export function defaultCtx(overrides = {}) {
  return { now: () => new Date().toISOString(), rng: Math.random, ...overrides };
}

export function nextId(db, prefix) {
  const n = db.meta.nextId++;
  return `${prefix}_${n.toString(36).padStart(4, '0')}`;
}

/** Local date as YYYY-MM-DD. */
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;
