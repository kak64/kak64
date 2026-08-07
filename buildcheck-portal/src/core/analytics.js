// BuildCheck Portal — dashboard aggregations (pure, unit-testable).

import { addDaysStr } from './util.js';
import { STATUS, companyTasks, companyStats, finesSummary } from './tasks.js';
import { categoryById } from './directory.js';

/**
 * Composite project-health risk score (0–100, higher = riskier) with a band.
 * Blends four real signals: defect rate, overdue share, rejected share, and
 * open fines. Meant as a triage indicator, not a guarantee.
 */
export function riskScore(db, companyId, today) {
  const stats = companyStats(db, companyId, today);
  const defects = defectsByCategory(db, companyId);
  const totalChecks = defects.reduce((s, d) => s + d.checks, 0);
  const totalDefects = defects.reduce((s, d) => s + d.defects, 0);
  const fines = finesSummary(db, companyId);

  const defectRate = totalChecks > 0 ? totalDefects / totalChecks : 0;
  const overdueRate = stats.total > 0 ? stats.overdue / stats.total : 0;
  const rejectRate = stats.total > 0 ? stats.rejected / stats.total : 0;

  const score = Math.round(Math.min(100,
    defectRate * 55 + overdueRate * 30 + rejectRate * 25 + Math.min(15, fines.openCount * 5)));
  const band = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return {
    score,
    band,
    bandLabel: { low: 'נמוך', medium: 'בינוני', high: 'גבוה' }[band],
    factors: {
      defectRate: Math.round(defectRate * 100),
      overdueRate: Math.round(overdueRate * 100),
      rejectRate: Math.round(rejectRate * 100),
      openFines: fines.openCount,
    },
  };
}

/**
 * Reports-per-day trend over the trailing `days` window (inclusive of
 * today). A "report" = an assignment that reached submitted/approved,
 * counted on its task's execution date.
 */
export function reportTrend(db, companyId, today, days = 14) {
  const start = addDaysStr(today, -(days - 1));
  const buckets = new Map();
  for (let i = 0; i < days; i++) buckets.set(addDaysStr(start, i), 0);
  for (const task of companyTasks(db, companyId)) {
    if (!buckets.has(task.execDate)) continue;
    for (const a of task.assignments) {
      if (a.status === STATUS.SUBMITTED || a.status === STATUS.APPROVED) {
        buckets.set(task.execDate, buckets.get(task.execDate) + 1);
      }
    }
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/** Defect counts per category, sorted descending, with check totals. */
export function defectsByCategory(db, companyId) {
  const byCat = new Map();
  for (const task of companyTasks(db, companyId)) {
    for (const a of task.assignments) {
      for (const item of a.report?.items ?? []) {
        const entry = byCat.get(task.categoryId) ?? { defects: 0, checks: 0 };
        entry.checks++;
        if (item.status === 'defect') entry.defects++;
        byCat.set(task.categoryId, entry);
      }
    }
  }
  return [...byCat.entries()]
    .map(([categoryId, { defects, checks }]) => ({
      categoryId,
      name: categoryById(db, categoryId)?.name ?? categoryId,
      defects,
      checks,
    }))
    .sort((a, b) => b.defects - a.defects);
}

/** Open (unapproved-defect) count for the export report. */
export function collectDefects(db, companyId) {
  const rows = [];
  for (const task of companyTasks(db, companyId)) {
    for (const a of task.assignments) {
      (a.report?.items ?? []).forEach((item, i) => {
        if (item.status === 'defect') {
          rows.push({
            task: task.title,
            site: task.site,
            check: task.checks[i],
            note: item.note,
            workerId: a.workerId,
            measurement: item.measurement,
            photos: item.photos.length,
          });
        }
      });
    }
  }
  return rows;
}
