// BuildCheck AI — Interactive chat script (Section 4 + Section 5.4).
// Pure presentation layer: renders the current engine state into a prompt
// object { state, message, inputs, buttons } consumed by the web chat UI
// and the CLI. All numbers come pre-computed from the calculator/blueprint
// modules — nothing is calculated here.

import { STATES, PRE_CHECKS, CHECK_KINDS, BUTTONS } from './constants.js';
import { SLOPE_RANGE_PCT } from './calculator.js';

export function buildPrompt(engine) {
  switch (engine.state) {
    case STATES.PRE_CHECK_GATE: return preCheckPrompt(engine);
    case STATES.HALTED: return haltedPrompt(engine);
    case STATES.LASER_CALIBRATION: return laserPrompt(engine);
    case STATES.STATION_INSPECTION: return stationPrompt(engine);
    case STATES.SLOPE_CHECK: return slopePrompt(engine);
    case STATES.APPROVAL: return approvalPrompt(engine);
    case STATES.APPROVED: return approvedPrompt(engine);
    default:
      throw new Error(`מצב לא מוכר: ${engine.state}`);
  }
}

function projectLabel(engine) {
  const { building, floor, apartment } = engine.plan;
  const parts = [];
  if (building) parts.push(`בניין ${building}`);
  if (floor != null) parts.push(`קומה ${floor}`);
  if (apartment != null) parts.push(`דירה ${apartment}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------

function preCheckPrompt(engine) {
  const where = projectLabel(engine);
  const lines = [
    `שלום ${engine.managerName}. לפני שמאשרים לקבלן האינסטלציה להיכנס לביצוע קומפלטים${where ? ` ב${where}` : ''} — אנא אשר לי ביצוע 5 בדיקות חובה:`,
    ...PRE_CHECKS.map((c, i) => `${i + 1}. **${c.title}**: ${c.question} (כן/לא)`),
    '',
    '⚠️ תשובה שלילית על אחד מהסעיפים עוצרת את התהליך — אין כניסה לקומפלטים ללא 5 אישורים.',
  ];
  return {
    state: engine.state,
    message: lines.join('\n'),
    inputs: PRE_CHECKS.map((c, i) => ({
      id: c.id,
      type: 'boolean',
      label: `${i + 1}. ${c.title}`,
      hint: c.question,
    })),
    buttons: [{ id: BUTTONS.SUBMIT_PRECHECKS, label: 'שלח אישורי בדיקות' }],
  };
}

function haltedPrompt(engine) {
  const lastHalt = engine.records.haltHistory[engine.records.haltHistory.length - 1];
  const failedTitles = (lastHalt?.failed ?? [])
    .map((id) => PRE_CHECKS.find((c) => c.id === id)?.title ?? id);
  return {
    state: engine.state,
    message: [
      '⛔ **התהליך נעצר — תנאי הסף לא מולאו.**',
      'הבדיקות הבאות נכשלו:',
      ...failedTitles.map((t) => `• ${t}`),
      '',
      'יש להשלים את התנאים בשטח (לחץ מים, פינוי קומה, ניקיון, פקיקת צנרת, תוכניות מעודכנות) ורק אז לחזור לשער הבדיקות.',
    ].join('\n'),
    inputs: [],
    buttons: [{ id: BUTTONS.RESTART, label: 'בוצע תיקון — חזרה ל-5 הבדיקות' }],
  };
}

function laserPrompt(engine) {
  return {
    state: engine.state,
    message: [
      `מעולה, כל תנאי הסף מולאו. נעבור ל**${engine.room.name}**.`,
      '',
      '📐 **שלב 1: כיול שטיכמוס (קו ייחוס לייזר)**',
      'קח לייזר ופתח קו שטיכמוס בגובה **1.00 מטר** מחוץ לממ"ד: מדוד 100 ס"מ מהמדרגה החיצונית הנמוכה של הממ"ד לכיוון הדירה (לא לתוך הממ"ד עצמו).',
      'פתח את הלייזר לגובה המסומן כך שהקו נכנס אל חדר הרחצה.',
      '',
      'מרגע זה כל בדיקת גובה נמדדת מקו הלייזר: **מרחק במטר = 100 ס"מ − גובה היעד מהרצפה**.',
    ].join('\n'),
    inputs: [],
    buttons: [{ id: BUTTONS.LASER_READY, label: 'הלייזר מוכן' }],
  };
}

// ---------------------------------------------------------------------------
// Station instructions — computed targets rendered as field steps
// ---------------------------------------------------------------------------

export function laserStepText(laser) {
  if (!laser) return 'לפי גובה המצוין בתוכנית ה-PDF';
  return laser.direction === 'down'
    ? `פתח מטר מקו הלייזר למטה — המרחק למרכז חייב להיות **${laser.distanceCm} ס"מ** (100 − ${laser.targetHeightCm})`
    : `מדוד **${laser.distanceCm} ס"מ מעל קו הלייזר** (${laser.targetHeightCm} − 100)`;
}

export function checkInstruction(check, index) {
  const n = `${index + 1}.`;
  switch (check.kind) {
    case CHECK_KINDS.WALL_OFFSET:
      return `${n} **${check.label}**: בתוכנית ${check.rawCm} ס"מ מהקיר הגולמי. בתוספת 2–3 ס"מ טיח וקרמיקה — היעד **${check.finished.nominalCm}–${check.finished.maxCm} ס"מ** (נומינלי ${check.finished.nominalCm} ס"מ).`;
    case CHECK_KINDS.FINISHED_OFFSET:
      return `${n} **${check.label}**: יעד **${check.targetCm} ס"מ** (מידה סופית כולל טיח).`;
    case CHECK_KINDS.HEIGHT:
      return check.targetCm != null
        ? `${n} **${check.label}**: יעד **${check.targetCm} ס"מ** מריצוף סופי. ${laserStepText(check.laser)}.`
        : `${n} **${check.label}**: אמת גובה מול תוכנית ה-PDF ומדוד ביחס לקו הלייזר.`;
    case CHECK_KINDS.POSITION:
      return `${n} **${check.label}**: מרכז במידה **${check.targetXcm} על ${check.targetYcm} ס"מ**.`;
    case CHECK_KINDS.PLAN_CHECK:
      return `${n} **${check.label}**: בדוק מיקום וגובה מול תוכנית הביצוע המעודכנת.`;
    default:
      return `${n} ${check.label}`;
  }
}

function stationInputs(check) {
  switch (check.kind) {
    case CHECK_KINDS.WALL_OFFSET:
      return [{ id: check.id, type: 'number', unit: 'ס"מ', label: check.label, placeholder: check.finished.nominalCm }];
    case CHECK_KINDS.FINISHED_OFFSET:
    case CHECK_KINDS.HEIGHT:
      return check.targetCm != null
        ? [{ id: check.id, type: 'number', unit: 'ס"מ', label: check.label, placeholder: check.targetCm }]
        : [{ id: check.id, type: 'number', unit: 'ס"מ', label: check.label, placeholder: '' }];
    case CHECK_KINDS.POSITION:
      return [
        { id: `${check.id}.x`, type: 'number', unit: 'ס"מ', label: `${check.label} — ציר X`, placeholder: check.targetXcm },
        { id: `${check.id}.y`, type: 'number', unit: 'ס"מ', label: `${check.label} — ציר Y`, placeholder: check.targetYcm },
      ];
    case CHECK_KINDS.PLAN_CHECK:
      return [{ id: check.id, type: 'boolean', label: check.label, hint: 'תואם לתוכנית?' }];
    default:
      return [];
  }
}

function stationPrompt(engine) {
  const station = engine.currentStation;
  const idx = engine.stationIndex;
  const header = idx === 0
    ? 'נפתח בבדיקה אקטיבית. תמיד מתחילים מהדלת ונכנסים פנימה.\n'
    : '';
  const lines = [
    header + `📍 **תחנה ${idx + 1}: ${station.title}**${station.location ? ` (${station.location})` : ''}`,
    'לפי התוכניות לדירה זו:',
    ...station.checks.map((c, i) => checkInstruction(c, i)),
    '',
    'הקלד את המידות שנמדדו בשטח, או אשר שהכל תקין.',
  ];
  const isLast = idx === engine.stations.length - 1;
  return {
    state: engine.state,
    stationId: station.id,
    message: lines.join('\n'),
    inputs: station.checks.flatMap(stationInputs),
    buttons: [
      { id: BUTTONS.STATION_OK, label: isLast ? 'הכל תקין, המשך לשיפועים' : 'הכל תקין, המשך' },
      { id: BUTTONS.STATION_REPORT, label: 'דווח על חריגה' },
    ],
  };
}

function slopePrompt(engine) {
  return {
    state: engine.state,
    message: [
      '📏 **שלב אחרון: שיפועים ומערכת דלוחין**',
      `בעזרת קו הלייזר, מטר ופלס — ודא שיפוע תקין של **${SLOPE_RANGE_PCT.min}%–${SLOPE_RANGE_PCT.max}%** בכל קווי הדלוחין לכיוון הקולטן.`,
      'ניתן להזין מדידה: ירידה אנכית (ס"מ) על פני אורך קו (ס"מ), או לאשר לאחר בדיקה עם פלס.',
    ].join('\n'),
    inputs: [
      { id: 'slope_name', type: 'text', label: 'שם הקו', placeholder: 'קו דלוחין ראשי' },
      { id: 'slope_drop', type: 'number', unit: 'ס"מ', label: 'ירידה אנכית', placeholder: 3 },
      { id: 'slope_run', type: 'number', unit: 'ס"מ', label: 'אורך הקו', placeholder: 200 },
    ],
    buttons: [
      { id: BUTTONS.SLOPES_SUBMIT, label: 'שלח מדידת שיפוע' },
      { id: BUTTONS.SLOPES_OK, label: 'נבדק עם פלס — הכל תקין' },
    ],
  };
}

function approvalPrompt(engine) {
  const dev = engine.deviations;
  const lines = [
    '🏁 **סיכום בדיקת החדר**',
    `${projectLabel(engine)} — ${engine.room.name}`,
    `תחנות שנבדקו: ${engine.records.stations.length}/${engine.stations.length}`,
  ];
  if (dev.length === 0) {
    lines.push('', '✅ לא נמצאו חריגות. ניתן לאשר את החדר ולמסור לקבלן להמשך.');
  } else {
    lines.push('', `⚠️ נמצאו **${dev.length} חריגות**:`);
    for (const d of dev) lines.push(`• ${d.stationTitle} — ${d.label}${formatDeviation(d.evaluation)}`);
    lines.push('', 'אישור החדר חסום עד תיקון החריגות, אלא אם תבחר לאשר באילוץ (יירשם בדו"ח).');
  }
  const buttons = dev.length === 0
    ? [{ id: BUTTONS.APPROVE, label: 'אשר חדר ✔' }]
    : [{ id: BUTTONS.APPROVE_OVERRIDE, label: 'אשר באילוץ (עם חריגות)' }];
  return { state: engine.state, message: lines.join('\n'), inputs: [], buttons };
}

function formatDeviation(ev) {
  if (ev == null) return '';
  if (typeof ev.deviationCm === 'number') return ` (סטייה ${ev.deviationCm > 0 ? '+' : ''}${ev.deviationCm} ס"מ)`;
  if (typeof ev.percent === 'number') return ` (שיפוע ${ev.percent}%)`;
  if (ev.x || ev.y) {
    const parts = [];
    if (ev.x && !ev.x.ok) parts.push(`X ${ev.x.deviationCm > 0 ? '+' : ''}${ev.x.deviationCm}`);
    if (ev.y && !ev.y.ok) parts.push(`Y ${ev.y.deviationCm > 0 ? '+' : ''}${ev.y.deviationCm}`);
    return parts.length ? ` (${parts.join(', ')} ס"מ)` : '';
  }
  if (ev.confirmedAgainstPlan === false) return ' (לא תואם לתוכנית)';
  return '';
}

function approvedPrompt(engine) {
  const a = engine.records.approval;
  return {
    state: engine.state,
    message: [
      `✅ **החדר אושר** — ${engine.room.name}, ${projectLabel(engine)}.`,
      a?.overrideUsed ? '⚠️ האישור ניתן באילוץ עם חריגות פתוחות — מתועד בדו"ח.' : 'כל הבדיקות עברו בהצלחה.',
      `מאשר: ${a?.approvedBy ?? engine.managerName}`,
      '',
      'דו"ח מלא זמין בפלט report() — כולל תיעוד 5 בדיקות הסף, כיול הלייזר, מדידות התחנות, שיפועים וחריגות.',
    ].join('\n'),
    inputs: [],
    buttons: [],
  };
}
