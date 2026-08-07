// BuildCheck Portal — סטודיו תוכניות (Plan Studio).
// The manager uploads a גרמושקה sheet / 3D sketch photo; the studio runs a
// real pixel analysis (drawing detection, line-orientation profile,
// complexity score) — computed locally, no server — then walks a short
// wizard and GENERATES a complete inspection program: staged, role-targeted
// tasks across floors and categories, dispatched in one click.

import { addDaysStr } from './util.js';
import { categoryById } from './directory.js';
import { resolveAssignees, dispatchTask } from './tasks.js';

// ---------------------------------------------------------------------------
// Image analysis (pure math over ImageData-like {data, width, height})
// ---------------------------------------------------------------------------

/**
 * Analyze a raster of RGBA pixels. Returns:
 *  - inkRatio: share of dark "ink" pixels
 *  - whiteRatio: share of near-white background pixels
 *  - hvScore: of the strong edges, how many are axis-aligned (drawings of
 *    buildings are dominated by horizontal/vertical lines; photos are not)
 *  - isDrawing: heuristic — white background + moderate ink + strong H/V grid
 *  - complexity: 1..5 estimate of the sheet's density
 */
export function analyzePixels({ data, width, height }) {
  const gray = new Float32Array(width * height);
  let white = 0;
  let ink = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const v = (r + g + b) / 3;
    gray[i] = v;
    if (v > 225) white++;
    if (v < 120) ink++;
  }
  const total = width * height;
  const whiteRatio = white / total;
  const inkRatio = ink / total;

  let strong = 0;
  let axis = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const dx = Math.abs(gray[i + 1] - gray[i - 1]);
      const dy = Math.abs(gray[i + width] - gray[i - width]);
      const mag = dx + dy;
      if (mag > 60) {
        strong++;
        // An axis-aligned edge has one dominant gradient direction.
        if (dx > dy * 3 || dy > dx * 3) axis++;
      }
    }
  }
  const hvScore = strong > 0 ? axis / strong : 0;
  const isDrawing = whiteRatio > 0.45 && inkRatio > 0.01 && inkRatio < 0.5 && hvScore > 0.5 && strong > total * 0.005;
  const complexity = Math.max(1, Math.min(5, Math.round(inkRatio * 25 + (strong / total) * 30)));
  return {
    inkRatio: round3(inkRatio),
    whiteRatio: round3(whiteRatio),
    hvScore: round3(hvScore),
    strongEdges: strong,
    isDrawing,
    complexity,
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** A readable project-name guess from an uploaded file's name. */
export function guessProjectName(filename) {
  const base = String(filename ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b(scan|img|image|plan|pdf|copy|final|v\d+|\d{3,})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length >= 3 ? base : 'פרויקט חדש';
}

// ---------------------------------------------------------------------------
// Inspection-program generation
// ---------------------------------------------------------------------------

/** Which registered role executes each category (sub-level overrides). */
export const CATEGORY_ROLE = {
  shell: 'foreman',
  plumbing: 'plumber',
  electric: 'electrician',
  hvac: 'hvac',
  sealing: 'sealer',
  finish: 'tiler',
  safety: 'safety',
  elevator: 'elevator',
  development: 'gardener',
};

export const SUB_ROLE = {
  formwork: 'formwork',
  rebar: 'rebar',
  casting: 'concrete',
  points: 'electrician',
  comm: 'lowvolt',
  paint: 'painter',
  doors: 'carpenter',
  aluminum: 'aluminum',
};

/** Phase order — earlier categories get earlier execution dates. */
const CATEGORY_PHASE = {
  shell: 0, safety: 0,
  plumbing: 1, electric: 1, hvac: 1, sealing: 1,
  elevator: 2, finish: 2,
  development: 3,
};

export const PROGRAM_CAP = 40;

/**
 * Build a proposed inspection program from a project profile.
 * profile: { projectName, floors, apartmentsPerFloor, hasElevator, hasMamad,
 *            hasRoof, startDate, categoryIds }
 * Returns proposals: [{title, categoryId, subcategoryId, roleId, execDate,
 *                      dueDate, checks?}], capped at PROGRAM_CAP with `capped`
 *                      flag so the UI never silently truncates.
 */
export function buildProgram(db, profile) {
  const {
    projectName, floors = 1, apartmentsPerFloor = 1,
    hasElevator = false, hasMamad = true, hasRoof = true,
    startDate, categoryIds = [],
  } = profile;
  if (!startDate) throw new Error('נדרש תאריך התחלה לתוכנית');
  if (!projectName?.trim()) throw new Error('נדרש שם פרויקט');

  const floorGroups = groupFloors(Math.max(1, Math.floor(floors)));
  const proposals = [];

  for (const categoryId of categoryIds) {
    const category = categoryById(db, categoryId);
    if (!category) continue;
    if (categoryId === 'elevator' && !hasElevator) continue;
    const phase = CATEGORY_PHASE[categoryId] ?? 1;

    for (const sub of category.subs) {
      if (sub.id === 'seismic' && !hasMamad) continue;
      if (sub.id === 'roof' && !hasRoof) continue;
      const roleId = SUB_ROLE[sub.id] ?? CATEGORY_ROLE[categoryId] ?? null;

      // Per-building subs (roof, machine room…) get one task; per-floor subs
      // get one task per floor group.
      const groups = PER_BUILDING_SUBS.has(sub.id) ? [null] : floorGroups;
      groups.forEach((group, gi) => {
        const where = group ? `קומות ${group.from}-${group.to}` : 'כלל הבניין';
        proposals.push({
          title: `${category.name} · ${sub.name} — ${where}`,
          categoryId,
          subcategoryId: sub.id,
          roleId,
          execDate: addDaysStr(startDate, phase * 7 + gi * 2),
          dueDate: addDaysStr(startDate, phase * 7 + gi * 2 + 2),
          apartments: group ? (group.to - group.from + 1) * apartmentsPerFloor : null,
        });
      });
    }
  }

  proposals.sort((a, b) => a.execDate.localeCompare(b.execDate));
  const capped = proposals.length > PROGRAM_CAP;
  return { proposals: proposals.slice(0, PROGRAM_CAP), capped, totalBeforeCap: proposals.length };
}

const PER_BUILDING_SUBS = new Set(['roof', 'basement', 'machine', 'shaft', 'install', 'drainage', 'landscape', 'paving', 'scaffold', 'ppe', 'electric-temp']);

function groupFloors(floors) {
  const groups = [];
  const size = floors <= 4 ? 2 : 3;
  for (let from = 1; from <= floors; from += size) {
    groups.push({ from, to: Math.min(floors, from + size - 1) });
  }
  return groups.slice(0, 6);
}

/**
 * Dispatch a generated program: creates the project record and one task per
 * proposal whose target role has active matching workers. Proposals with no
 * matching worker are returned as `skipped` — never silently dropped.
 */
export function dispatchProgram(db, actor, { projectName, analysis, proposals }, ctx) {
  if (actor?.kind !== 'manager') throw new Error('רק מנהל חברה משגר תוכנית ביקורת');
  const sent = [];
  const skipped = [];
  const taskIds = [];

  for (const p of proposals) {
    const matched = p.roleId ? resolveAssignees(db, actor.companyId, { roleId: p.roleId }) : [];
    if (matched.length === 0) {
      skipped.push({ ...p, reason: 'אין עובד פעיל בתפקיד המתאים' });
      continue;
    }
    const task = dispatchTask(db, actor, {
      title: p.title,
      site: projectName,
      description: p.apartments ? `תוכנית ביקורת אוטומטית · כ-${p.apartments} דירות במקטע` : 'תוכנית ביקורת אוטומטית',
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId,
      target: { roleId: p.roleId },
      execDate: p.execDate,
      execTime: '08:00',
      dueDate: p.dueDate,
    }, ctx);
    taskIds.push(task.id);
    sent.push(p);
  }

  db.projects = db.projects ?? [];
  const project = {
    id: `prj_${(db.meta.nextId++).toString(36).padStart(4, '0')}`,
    companyId: actor.companyId,
    name: projectName,
    analysis: analysis ?? null,
    taskIds,
    skippedCount: skipped.length,
    createdAt: ctx.now(),
    createdBy: actor.id,
  };
  db.projects.push(project);
  return { project, sent, skipped };
}
