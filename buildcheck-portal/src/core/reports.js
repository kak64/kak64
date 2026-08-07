// BuildCheck Portal — report & document builders.
// Produces detailed, shareable artifacts from field data: a CSV (opens in
// Excel) for defect ledgers, a fully-formatted printable HTML report (the
// user saves it as PDF via the browser's print dialog), and a signed digital
// handover certificate. Pure string builders — unit-testable, no DOM.

import { STATUS_LABELS } from './tasks.js';
import { categoryById } from './directory.js';

const UNIT = (u) => (u === 'cm' ? 'ס"מ' : u === 'm' ? 'מטר' : u ?? '');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// CSV (Excel) — UTF-8 BOM so Hebrew opens correctly in Excel.
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  return '﻿' + body; // BOM
}

/** Defect ledger across the company → CSV rows. */
export function buildDefectsCsv(db, companyId, userName) {
  const rows = [['#', 'משימה', 'אתר', 'קטגוריה', 'בדיקה', 'עובד', 'מדידה', 'תיאור הליקוי', 'תמונות', 'תאריך']];
  let n = 0;
  for (const task of db.tasks.filter((t) => t.companyId === companyId)) {
    for (const a of task.assignments) {
      (a.report?.items ?? []).forEach((item, i) => {
        if (item.status !== 'defect') return;
        n++;
        rows.push([
          n, task.title, task.site ?? '',
          categoryById(db, task.categoryId)?.name ?? '',
          task.checks[i] ?? '',
          userName(a.workerId),
          item.measurement ? `${item.measurement.value} ${UNIT(item.measurement.unit)}` : '',
          item.note ?? '', item.photos?.length ?? 0,
          (a.report?.submittedAt ?? '').slice(0, 10),
        ]);
      });
    }
  }
  return toCsv(rows);
}

/** Fines ledger → CSV rows. */
export function buildFinesCsv(db, companyId, userName) {
  const rows = [['#', 'משימה', 'עובד', 'סכום (₪)', 'סיבה', 'סטטוס', 'תאריך']];
  (db.fines ?? []).filter((f) => f.companyId === companyId).forEach((f, i) => {
    rows.push([i + 1, f.taskTitle, userName(f.workerId), f.amount, f.reason, f.status === 'open' ? 'פתוח' : 'שולם', f.at.slice(0, 10)]);
  });
  return toCsv(rows);
}

// ---------------------------------------------------------------------------
// Printable detailed report (save-as-PDF via print)
// ---------------------------------------------------------------------------

/**
 * A complete, self-contained HTML document for one field report — company
 * header, task metadata, every check with status/measurement/note and its
 * photos, and a signature line. Print → save as PDF.
 */
export function buildReportHtml({ company, task, assignment, workerName, approverName, categoryName = '', logoDataUrl }) {
  const report = assignment.report ?? { items: [], summary: '' };
  const defects = report.items.filter((i) => i.status === 'defect').length;
  const catName = categoryName;

  const items = report.items.map((item, i) => {
    const photos = (item.photos ?? []).map((src) => `<img src="${esc(src)}" alt="תמונה"/>`).join('');
    const badge = item.status === 'defect'
      ? '<span class="b bad">ליקוי</span>'
      : '<span class="b good">תקין</span>';
    const meas = item.measurement ? `<span class="meas">📏 ${esc(item.measurement.value)} ${esc(UNIT(item.measurement.unit))}</span>` : '';
    return `<div class="chk ${item.status}">
      <div class="chk-h"><span class="chk-t">${i + 1}. ${esc(task.checks[i] ?? '')}</span>${meas}${badge}</div>
      ${item.note ? `<div class="note">${esc(item.note)}</div>` : ''}
      <div class="ph">${photos}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>דוח שטח — ${esc(task.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI","Noto Sans Hebrew",Arial,sans-serif; color: #15181c; margin: 0; padding: 28px; background: #fff; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #16324f; padding-bottom: 14px; margin-bottom: 18px; }
  header .logo { width: 54px; height: 54px; border-radius: 10px; overflow: hidden; flex-shrink: 0; }
  header .logo img, header .logo svg { width: 100%; height: 100%; object-fit: cover; }
  header h1 { font-size: 20px; margin: 0; }
  header .sub { color: #64686e; font-size: 13px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 13px; margin-bottom: 16px; }
  .meta b { color: #64686e; font-weight: 600; }
  .summary { background: #f3f5f8; border-inline-start: 3px solid #16324f; padding: 10px 14px; border-radius: 8px; margin-bottom: 18px; font-size: 14px; }
  .tally { display: flex; gap: 10px; margin-bottom: 16px; }
  .tally span { font-size: 13px; padding: 4px 12px; border-radius: 999px; }
  .tally .ok { background: #e4f2e9; color: #1f7a44; }
  .tally .bad { background: #f9e4e2; color: #b23a34; }
  .chk { border: 1px solid #e2ddd3; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
  .chk.defect { border-inline-start: 4px solid #b23a34; }
  .chk.ok { border-inline-start: 4px solid #1f7a44; }
  .chk-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chk-t { font-weight: 700; flex: 1; }
  .b { font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 700; }
  .b.good { background: #e4f2e9; color: #1f7a44; }
  .b.bad { background: #f9e4e2; color: #b23a34; }
  .meas { font-size: 12px; color: #64686e; font-family: monospace; }
  .note { margin-top: 6px; font-size: 13px; color: #7a2f2a; }
  .ph { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .ph img { width: 150px; height: 112px; object-fit: cover; border-radius: 8px; border: 1px solid #e2ddd3; }
  footer { margin-top: 26px; border-top: 1px solid #e2ddd3; padding-top: 14px; display: flex; justify-content: space-between; font-size: 13px; color: #64686e; }
  .sign { margin-top: 30px; display: flex; gap: 60px; }
  .sign div { border-top: 1px solid #15181c; padding-top: 6px; min-width: 180px; font-size: 12px; }
  @media print { body { padding: 0; } @page { margin: 14mm; } }
</style></head><body>
  <header>
    <div class="logo">${logoDataUrl ? `<img src="${esc(logoDataUrl)}"/>` : ''}</div>
    <div><h1>דוח בקרת שטח</h1><div class="sub">${esc(company.name)} · BuildCheck Portal</div></div>
  </header>
  <div class="meta">
    <div><b>משימה:</b> ${esc(task.title)}</div>
    <div><b>קטגוריה:</b> ${esc(catName)}</div>
    <div><b>אתר:</b> ${esc(task.site ?? '—')}</div>
    <div><b>עובד מבצע:</b> ${esc(workerName)}</div>
    <div><b>תאריך ביצוע:</b> ${esc(task.execDate)} ${esc(task.execTime ?? '')}</div>
    <div><b>סטטוס:</b> ${esc(STATUS_LABELS[assignment.status] ?? assignment.status)}</div>
  </div>
  <div class="tally">
    <span class="ok">תקין: ${report.items.length - defects}</span>
    <span class="bad">ליקויים: ${defects}</span>
  </div>
  ${report.summary ? `<div class="summary"><b>סיכום העובד:</b> ${esc(report.summary)}</div>` : ''}
  ${items}
  <div class="sign">
    <div>חתימת העובד: ${esc(workerName)}</div>
    <div>אישור מנהל: ${esc(approverName ?? '__________')}</div>
  </div>
  <footer><span>הופק ב-BuildCheck Portal</span><span>${esc(task.execDate)}</span></footer>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Digital handover certificate (תעודת מסירה דיגיטלית)
// ---------------------------------------------------------------------------

export function buildCertificateHtml({ company, task, workerName, approverName, signatureDataUrl, certId, date, logoDataUrl }) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>תעודת מסירה — ${esc(task.title)}</title>
<style>
  body { font-family: "Segoe UI","Noto Sans Hebrew",Arial,sans-serif; color: #15181c; margin: 0; padding: 40px; background: #fff; }
  .cert { max-width: 720px; margin: 0 auto; border: 2px solid #16324f; border-radius: 16px; padding: 40px; position: relative; }
  .cert::before { content: ""; position: absolute; inset: 10px; border: 1px solid #c8801f; border-radius: 10px; pointer-events: none; }
  .head { text-align: center; margin-bottom: 26px; }
  .head .logo { width: 64px; height: 64px; border-radius: 12px; overflow: hidden; margin: 0 auto 10px; }
  .head .logo img, .head .logo svg { width: 100%; height: 100%; object-fit: cover; }
  .head .k { letter-spacing: 3px; color: #c8801f; font-size: 12px; font-weight: 700; }
  .head h1 { font-size: 26px; margin: 6px 0 2px; }
  .head .co { color: #64686e; }
  .body { font-size: 15px; line-height: 1.9; text-align: center; margin: 24px 0; }
  .body b { color: #16324f; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 13px; margin: 22px 0; }
  .grid .c { background: #f3f5f8; border-radius: 8px; padding: 8px 12px; }
  .grid .c b { display: block; color: #64686e; font-size: 11px; }
  .sign { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; gap: 20px; }
  .sign .box { text-align: center; flex: 1; }
  .sign img { max-height: 70px; max-width: 200px; }
  .sign .line { border-top: 1px solid #15181c; margin-top: 6px; padding-top: 6px; font-size: 12px; color: #64686e; }
  .cid { text-align: center; font-family: monospace; font-size: 11px; color: #9a978f; margin-top: 18px; }
  @media print { @page { margin: 12mm; } }
</style></head><body>
  <div class="cert">
    <div class="head">
      <div class="logo">${logoDataUrl ? `<img src="${esc(logoDataUrl)}"/>` : ''}</div>
      <div class="k">תעודת מסירה דיגיטלית</div>
      <h1>אישור השלמת בדיקה</h1>
      <div class="co">${esc(company.name)}</div>
    </div>
    <div class="body">
      ניתן בזאת אישור כי המשימה <b>"${esc(task.title)}"</b><br/>
      בוצעה ונבדקה בהתאם לדרישות, ואושרה למסירה.
    </div>
    <div class="grid">
      <div class="c"><b>אתר</b>${esc(task.site ?? '—')}</div>
      <div class="c"><b>עובד מבצע</b>${esc(workerName)}</div>
      <div class="c"><b>תאריך ביצוע</b>${esc(task.execDate)}</div>
      <div class="c"><b>תאריך אישור</b>${esc(date)}</div>
    </div>
    <div class="sign">
      <div class="box">${signatureDataUrl ? `<img src="${esc(signatureDataUrl)}" alt="חתימה"/>` : ''}<div class="line">חתימת המאשר: ${esc(approverName)}</div></div>
      <div class="box"><div class="line">חותמת החברה</div></div>
    </div>
    <div class="cid">מס' תעודה: ${esc(certId)}</div>
  </div>
</body></html>`;
}
