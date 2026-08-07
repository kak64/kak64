import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng, todayStr, addDaysStr } from '../src/core/util.js';
import { createDb, seedDemo } from '../src/core/store.js';
import { analyzePixels, guessProjectName, buildProgram, dispatchProgram, PROGRAM_CAP } from '../src/core/planstudio.js';
import { STATUS } from '../src/core/tasks.js';

// --- synthetic rasters ------------------------------------------------------

function raster(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = painter(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** White sheet with black axis-aligned grid lines — like a floor plan. */
const drawingRaster = () => raster(120, 120, (x, y) => (x % 20 === 0 || y % 20 === 0 ? 10 : 250));
/** Pseudo-random noise — like a site photo. */
const noiseRaster = () => {
  const rng = createRng(9);
  return raster(120, 120, () => Math.floor(rng() * 256));
};

test('analyzePixels: recognizes an architectural drawing', () => {
  const m = analyzePixels(drawingRaster());
  assert.equal(m.isDrawing, true);
  assert.ok(m.hvScore > 0.8, `hvScore ${m.hvScore}`);
  assert.ok(m.whiteRatio > 0.8);
  assert.ok(m.complexity >= 1 && m.complexity <= 5);
});

test('analyzePixels: rejects a noisy photo', () => {
  const m = analyzePixels(noiseRaster());
  assert.equal(m.isDrawing, false);
});

test('guessProjectName cleans file names', () => {
  assert.equal(guessProjectName('נופי_הים_גרמושקה.pdf.png'), 'נופי הים גרמושקה');
  assert.equal(guessProjectName('scan-003.png'), 'פרויקט חדש');
  assert.equal(guessProjectName(''), 'פרויקט חדש');
});

// --- program generation -----------------------------------------------------

function setup() {
  const c = { now: () => new Date().toISOString(), rng: createRng(42) };
  const db = createDb(c);
  seedDemo(db, c);
  const manager = db.users.find((u) => u.username === 'ohad');
  return { db, manager, c, today: todayStr() };
}

const PROFILE = (today, overrides = {}) => ({
  projectName: 'מגדלי הדוגמה',
  floors: 6,
  apartmentsPerFloor: 4,
  hasElevator: true,
  hasMamad: true,
  hasRoof: true,
  startDate: today,
  categoryIds: ['plumbing', 'electric', 'elevator'],
  ...overrides,
});

test('buildProgram: floor groups, phases, and role mapping', () => {
  const { db, today } = setup();
  const { proposals, capped } = buildProgram(db, PROFILE(today));
  assert.ok(proposals.length > 0);
  assert.equal(capped, proposals.length === PROGRAM_CAP ? capped : false);
  const complet = proposals.filter((p) => p.subcategoryId === 'complet');
  assert.equal(complet.length, 2, '6 floors -> 2 groups of 3');
  assert.match(complet[0].title, /קומות 1-3/);
  assert.ok(complet.every((p) => p.roleId === 'plumber'));
  const comm = proposals.find((p) => p.subcategoryId === 'comm');
  assert.equal(comm.roleId, 'lowvolt');
  const shaft = proposals.filter((p) => p.subcategoryId === 'shaft');
  assert.equal(shaft.length, 1, 'per-building sub gets one task');
  for (const p of proposals) {
    assert.ok(p.execDate >= today);
    assert.equal(p.dueDate, addDaysStr(p.execDate, 2));
  }
});

test('buildProgram: elevator excluded without an elevator', () => {
  const { db, today } = setup();
  const { proposals } = buildProgram(db, PROFILE(today, { hasElevator: false }));
  assert.ok(proposals.every((p) => p.categoryId !== 'elevator'));
});

test('buildProgram: validates inputs', () => {
  const { db, today } = setup();
  assert.throws(() => buildProgram(db, PROFILE(today, { projectName: ' ' })), /שם פרויקט/);
  assert.throws(() => buildProgram(db, PROFILE(today, { startDate: null })), /תאריך/);
});

test('dispatchProgram: sends matched roles, skips unmatched, records project', () => {
  const { db, manager, c, today } = setup();
  const { proposals } = buildProgram(db, PROFILE(today));
  const before = db.tasks.length;
  const { project, sent, skipped } = dispatchProgram(db, manager, {
    projectName: 'מגדלי הדוגמה', analysis: { isDrawing: true }, proposals,
  }, c);
  // Seed has plumber+electrician but no lowvolt/elevator workers.
  assert.ok(sent.length > 0);
  assert.ok(skipped.length > 0);
  assert.ok(skipped.every((s) => s.reason.includes('אין עובד')));
  assert.equal(db.tasks.length, before + sent.length);
  assert.equal(project.taskIds.length, sent.length);
  assert.equal(db.projects.at(-1).id, project.id);
  const dispatched = db.tasks.find((t) => t.id === project.taskIds[0]);
  assert.equal(dispatched.site, 'מגדלי הדוגמה');
  assert.ok(dispatched.assignments.every((a) => a.status === STATUS.PENDING));
});

test('dispatchProgram: manager-only', () => {
  const { db, c, today } = setup();
  const worker = db.users.find((u) => u.username === 'yossi');
  const { proposals } = buildProgram(db, PROFILE(today));
  assert.throws(() => dispatchProgram(db, worker, { projectName: 'x', proposals }, c), /רק מנהל/);
});
