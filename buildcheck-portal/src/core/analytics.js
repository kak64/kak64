// BuildCheck Portal — dashboard aggregations (pure, unit-testable).

import { addDaysStr } from './util.js';
import { STATUS, companyTasks } from './tasks.js';
import { categoryById } from './directory.js';

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
