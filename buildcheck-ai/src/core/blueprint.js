// BuildCheck AI — Data Model & blueprint parser (Section 5.1).
// Ingests blueprint meta-data (apartment #, floor #, room layout, target
// dimensions) either as a structured object (JSON) or as key:value text
// extracted from a PDF plan, and resolves each wet room into fully derived
// inspection stations (finished offsets + laser steps computed up front).
//
// PDF text extraction itself is delegated to whatever extractor is available
// (e.g. pdftotext / pdf-parse); feed the extracted text to parseBlueprint().

import { CHECK_KINDS } from './constants.js';
import { finishedWallOffset, laserOffset } from './calculator.js';

/**
 * Default wet-room station template (Section 3), ordered from the doorway
 * inward — inspection always starts at the door. Plans may override any
 * numeric target per check id (see room.overrides).
 */
export const WET_ROOM_TEMPLATE = Object.freeze([
  Object.freeze({
    id: 'sink',
    title: 'עמדת כיור',
    location: 'ליד הדלת',
    checks: Object.freeze([
      Object.freeze({ id: 'sink_center', kind: CHECK_KINDS.WALL_OFFSET, label: 'מרכז נקודות מים מהקיר', rawCm: 45 }),
      Object.freeze({ id: 'sink_water_height', kind: CHECK_KINDS.HEIGHT, label: 'גובה נקודות מים', targetCm: 60 }),
      Object.freeze({ id: 'sink_drain_height', kind: CHECK_KINDS.HEIGHT, label: 'גובה ניקוז (דלוחין)', targetCm: 50 }),
    ]),
  }),
  Object.freeze({
    id: 'shower',
    title: 'מקלחת / אמבטיה / אינטרפוץ',
    location: 'המשך מסלול מהדלת',
    checks: Object.freeze([
      Object.freeze({ id: 'interpuck_center', kind: CHECK_KINDS.FINISHED_OFFSET, label: 'מרכז אינטרפוץ מהקיר (כולל טיח)', targetCm: 42 }),
      Object.freeze({ id: 'shower_water_offset', kind: CHECK_KINDS.FINISHED_OFFSET, label: 'מרכז נקודות מים מהקיר', targetCm: 22 }),
      Object.freeze({ id: 'shower_water_height', kind: CHECK_KINDS.HEIGHT, label: 'גובה נקודות מים', targetCm: 110 }),
      Object.freeze({ id: 'shower_drain_center', kind: CHECK_KINDS.POSITION, label: 'מרכז ניקוז מקלחת', targetXcm: 42, targetYcm: 45 }),
    ]),
  }),
  Object.freeze({
    id: 'toilet',
    title: 'אסלה וניקוזי מזגן',
    location: 'עומק החדר',
    checks: Object.freeze([
      Object.freeze({ id: 'toilet_outlet', kind: CHECK_KINDS.PLAN_CHECK, label: 'מיקום יציאת אסלה מול תוכנית ה-PDF' }),
      Object.freeze({ id: 'ac_drain_height', kind: CHECK_KINDS.HEIGHT, label: 'גובה ניקוז מזגן', targetCm: null }),
    ]),
  }),
]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a blueprint from a structured object or from raw key:value text
 * (as extracted from a PDF). Returns a normalized plan:
 *   { building, floor, apartment, rooms: [{ name, overrides, notes }], notes }
 */
export function parseBlueprint(input) {
  if (input == null) throw new TypeError('נדרש קלט תוכנית (אובייקט או טקסט)');
  if (typeof input === 'string') return parseBlueprintText(input);
  return normalizePlan(input);
}

const PLAN_KEYS = [
  [/^(בניין|בנין|building)$/i, 'building'],
  [/^(קומה|floor)$/i, 'floor'],
  [/^(דירה|apartment|apt)$/i, 'apartment'],
];

const ROOM_KEY = /^(חדר|room)$/i;

const OVERRIDE_KEYS = [
  [/^(כיור מרכז|מרכז כיור|sink center)$/i, 'sink_center'],
  [/^(גובה מים כיור|כיור גובה מים|sink water height)$/i, 'sink_water_height'],
  [/^(גובה דלוחין|גובה ניקוז כיור|sink drain height)$/i, 'sink_drain_height'],
  [/^(אינטרפוץ מרכז|מרכז אינטרפוץ|interpuck center)$/i, 'interpuck_center'],
  [/^(מקלחת מרחק מים|מרחק מים מקלחת|shower water offset)$/i, 'shower_water_offset'],
  [/^(גובה מים מקלחת|מקלחת גובה מים|shower water height)$/i, 'shower_water_height'],
  [/^(ניקוז מקלחת|מרכז ניקוז מקלחת|shower drain)$/i, 'shower_drain_center'],
  [/^(גובה ניקוז מזגן|ניקוז מזגן|ac drain height)$/i, 'ac_drain_height'],
];

/**
 * Parse key:value lines extracted from a PDF plan. Hebrew and English keys
 * are recognized; a `חדר:`/`room:` line opens a new room; unknown lines are
 * kept as free-text notes so no plan information is silently dropped.
 */
export function parseBlueprintText(text) {
  const plan = { building: '', floor: null, apartment: null, rooms: [], notes: [] };
  let room = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep === -1) {
      (room ? room.notes : plan.notes).push(line);
      continue;
    }
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();

    const planField = PLAN_KEYS.find(([re]) => re.test(key))?.[1];
    if (planField) {
      plan[planField] = planField === 'building' ? value : parseNumeric(value) ?? value;
      continue;
    }
    if (ROOM_KEY.test(key)) {
      room = { name: value || 'חדר רטוב', overrides: {}, notes: [] };
      plan.rooms.push(room);
      continue;
    }
    const checkId = OVERRIDE_KEYS.find(([re]) => re.test(key))?.[1];
    if (checkId) {
      if (!room) {
        room = { name: 'חדר רטוב', overrides: {}, notes: [] };
        plan.rooms.push(room);
      }
      room.overrides[checkId] = parseValue(value);
      continue;
    }
    (room ? room.notes : plan.notes).push(line);
  }

  return normalizePlan(plan);
}

/** Normalize a structured plan object; guarantees at least one room. */
export function normalizePlan(obj) {
  const plan = {
    building: obj.building ?? '',
    floor: obj.floor ?? null,
    apartment: obj.apartment ?? null,
    rooms: [],
    notes: Array.isArray(obj.notes) ? [...obj.notes] : [],
  };
  const rooms = Array.isArray(obj.rooms) && obj.rooms.length > 0
    ? obj.rooms
    : [{ name: 'חדר רטוב', overrides: {} }];
  for (const r of rooms) {
    plan.rooms.push({
      name: r.name ?? 'חדר רטוב',
      overrides: { ...(r.overrides ?? {}) },
      notes: Array.isArray(r.notes) ? [...r.notes] : [],
      stations: r.stations, // optional full custom station list
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Station resolution (template + overrides -> derived measurement steps)
// ---------------------------------------------------------------------------

/**
 * Resolve a room into concrete inspection stations: applies plan overrides
 * onto the wet-room template and pre-computes every derived measurement —
 * finished wall offsets (raw + 2–3cm) and laser steps (100cm - target).
 */
export function resolveStations(room = {}) {
  const template = room.stations ?? WET_ROOM_TEMPLATE;
  const overrides = room.overrides ?? {};
  const stations = structuredClone(template).map((station) => ({
    ...station,
    checks: station.checks.map((check) => deriveCheck(applyOverride(check, overrides[check.id]))),
  }));
  return stations;
}

function applyOverride(check, override) {
  if (override == null) return { ...check };
  const out = { ...check };
  if (typeof override === 'number') {
    if (check.kind === CHECK_KINDS.WALL_OFFSET) out.rawCm = override;
    else out.targetCm = override;
  } else if (typeof override === 'object') {
    if (override.x != null) out.targetXcm = override.x;
    if (override.y != null) out.targetYcm = override.y;
    if (override.rawCm != null) out.rawCm = override.rawCm;
    if (override.targetCm != null) out.targetCm = override.targetCm;
  }
  return out;
}

function deriveCheck(check) {
  switch (check.kind) {
    case CHECK_KINDS.WALL_OFFSET:
      check.finished = finishedWallOffset(check.rawCm);
      break;
    case CHECK_KINDS.HEIGHT:
      check.laser = check.targetCm != null ? laserOffset(check.targetCm) : null;
      break;
    default:
      break;
  }
  return check;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function parseNumeric(value) {
  const m = String(value).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Parse an override value: plain number, or a pair like "42x45" / "42 על 45". */
function parseValue(value) {
  const pair = String(value).match(/(-?\d+(?:\.\d+)?)\s*(?:x|X|\*|על)\s*(-?\d+(?:\.\d+)?)/);
  if (pair) return { x: Number(pair[1]), y: Number(pair[2]) };
  const n = parseNumeric(value);
  return n ?? value;
}
