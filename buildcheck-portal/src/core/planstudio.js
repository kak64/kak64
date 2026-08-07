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
 * Analyze a raster of RGBA pixels. This is a real but HEURISTIC pixel scan —
 * it measures signal, it does not "read" a drawing. Returns:
 *  - inkRatio / whiteRatio: ink vs. near-white background share
 *  - hvScore: share of strong edges that are axis-aligned (buildings are
 *    dominated by H/V lines; photos are not)
 *  - diagScore: share of strong edges that are diagonal (3D sketches / hatching)
 *  - isDrawing: heuristic — white ground + moderate ink + strong H/V structure
 *  - complexity: 1..5 density estimate
 *  - zones: estimated distinct dense regions (rooms/detail blocks) via a grid
 *  - colorRatio: share of saturated (non-gray) pixels — colored legends/3D
 *  - titleBlock: a dense rectangular corner region was detected (title block)
 */
export function analyzePixels({ data, width, height }) {
  const gray = new Float32Array(width * height);
  let white = 0;
  let ink = 0;
  let colored = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const v = (r + g + b) / 3;
    gray[i] = v;
    if (v > 225) white++;
    if (v < 120) ink++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > 40) colored++;
  }
  const total = width * height;
  const whiteRatio = white / total;
  const inkRatio = ink / total;
  const colorRatio = colored / total;

  let strong = 0;
  let axis = 0;
  let diag = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const dx = Math.abs(gray[i + 1] - gray[i - 1]);
      const dy = Math.abs(gray[i + width] - gray[i - width]);
      const mag = dx + dy;
      if (mag > 60) {
        strong++;
        if (dx > dy * 3 || dy > dx * 3) axis++;
        else if (Math.abs(dx - dy) < Math.max(dx, dy) * 0.5) diag++;
      }
    }
  }
  const hvScore = strong > 0 ? axis / strong : 0;
  const diagScore = strong > 0 ? diag / strong : 0;

  // Region grid: how many cells carry meaningful ink (rooms / detail blocks).
  const GRID = 6;
  const cell = new Array(GRID * GRID).fill(0);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y / height) * GRID));
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] < 120) {
        const gx = Math.min(GRID - 1, Math.floor((x / width) * GRID));
        cell[gy * GRID + gx]++;
      }
    }
  }
  const cellArea = total / (GRID * GRID);
  const detailCells = cell.filter((c) => c / cellArea > 0.02).length;
  const zones = Math.max(1, Math.round(detailCells / 2));

  // Title block: a corner cell far denser than the sheet average.
  const avgCell = cell.reduce((s, c) => s + c, 0) / cell.length;
  const corners = [cell[0], cell[GRID - 1], cell[GRID * (GRID - 1)], cell[GRID * GRID - 1]];
  const titleBlock = avgCell > 0 && Math.max(...corners) > avgCell * 2.2;

  const isDrawing = whiteRatio > 0.45 && inkRatio > 0.01 && inkRatio < 0.5 && hvScore > 0.5 && strong > total * 0.005;
  const complexity = Math.max(1, Math.min(5, Math.round(inkRatio * 25 + (strong / total) * 30)));
  return {
    inkRatio: round3(inkRatio),
    whiteRatio: round3(whiteRatio),
    colorRatio: round3(colorRatio),
    hvScore: round3(hvScore),
    diagScore: round3(diagScore),
    strongEdges: strong,
    isDrawing,
    complexity,
    detailCells,
    zones,
    titleBlock,
  };
}

/**
 * Turn raw metrics into a THOROUGH, HONEST scan report for the manager.
 * Because a mis-scan can expose the company to fines, this never claims to
 * have read dimensions or a legend it cannot; instead it reports what the
 * pixel scan can and cannot establish, a 0–100 confidence, a findings list,
 * and an explicit list of items a human MUST verify before dispatch.
 */
export function buildScanReport(m) {
  const kind = m.isDrawing
    ? (m.diagScore > 0.28 ? '3d' : '2d')
    : (m.colorRatio > 0.25 || m.diagScore > 0.3 ? '3d' : 'photo');

  const findings = [];
  findings.push({ ok: m.isDrawing, label: m.isDrawing ? 'זוהה שרטוט הנדסי (רקע לבן + מבנה קווים)' : 'לא זוהה שרטוט הנדסי מובהק — ייתכן צילום או סקיצה' });
  findings.push({ ok: true, label: `${Math.round(m.hvScore * 100)}% מהקווים אנכיים/אופקיים${m.diagScore > 0.25 ? `, ${Math.round(m.diagScore * 100)}% אלכסוניים (סקיצת 3D?)` : ''}` });
  findings.push({ ok: m.detailCells >= 3, label: `זוהו כ-${m.zones} אזורי תוכן (חדרים/פרטים) ב-${m.detailCells} תאי צפיפות` });
  findings.push({ ok: m.titleBlock, label: m.titleBlock ? 'זוהתה מסגרת/גוש כותרת בפינה' : 'לא זוהתה מסגרת כותרת ברורה — ודא שהתוכנית מלאה' });
  findings.push({ ok: true, label: `צפיפות שרטוט ${m.complexity}/5` });

  // Confidence: strong when it looks like a clean, framed, detailed drawing.
  let confidence = 0;
  if (m.isDrawing) confidence += 45;
  confidence += Math.round(Math.min(1, m.hvScore) * 25);
  confidence += Math.min(15, m.detailCells * 2);
  if (m.titleBlock) confidence += 10;
  if (m.whiteRatio > 0.6) confidence += 5;
  confidence = Math.max(5, Math.min(95, confidence));

  // What a mis-scan can't safely infer — the human MUST confirm these.
  const mustVerify = [
    'מספר הקומות והדירות בפועל מול התוכנית',
    'קנה המידה והמידות (הסריקה אינה קוראת מספרים בשרטוט)',
    'התאמת תחומי הביקורת שנבחרו לתוכן התוכנית',
    'שינויי דיירים ועדכוני תכנון אחרונים',
  ];
  const warnings = [];
  if (!m.isDrawing) warnings.push('הקובץ אינו נראה כשרטוט הנדסי סטנדרטי — אמת ידנית לפני שיגור.');
  if (!m.titleBlock) warnings.push('לא זוהתה מסגרת כותרת — ודא שהועלתה התוכנית המלאה ולא קטע ממנה.');
  if (m.complexity <= 1) warnings.push('צפיפות נמוכה — ייתכן שזו סקיצה חלקית או תמונה באיכות נמוכה.');
  if (confidence < 55) warnings.push('רמת ודאות נמוכה — מומלץ ניתוח ידני מדוקדק והצלבה מול קונסטרוקטור/אדריכל.');

  return {
    kind, // '2d' | '3d' | 'photo'
    kindLabel: { '2d': 'תוכנית 2D', '3d': 'סקיצת/מודל 3D', photo: 'צילום או סקיצה חופשית' }[kind],
    confidence,
    metrics: m,
    findings,
    mustVerify,
    warnings,
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
