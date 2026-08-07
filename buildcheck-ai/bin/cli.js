#!/usr/bin/env node
// BuildCheck AI — interactive terminal walkthrough of a full room inspection.
// Usage: node bin/cli.js [path/to/plan.json|plan.txt]

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { parseBlueprint } from '../src/core/blueprint.js';
import { InspectionEngine } from '../src/core/engine.js';
import { STATES, BUTTONS } from '../src/core/constants.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rl = readline.createInterface({ input, output });
const lines = rl[Symbol.asyncIterator]();

// Works both interactively and with piped input (rl.question drops buffered
// lines once stdin reaches EOF; the async iterator buffers them properly).
async function ask(question) {
  output.write(question);
  const { value, done } = await lines.next();
  if (done) {
    output.write('\n(הקלט הסתיים — יציאה)\n');
    printReport(engine);
    process.exit(0);
  }
  return value;
}

const planPath = process.argv[2] ?? path.join(ROOT, 'samples', 'plan.sample.json');
const raw = await readFile(planPath, 'utf8');
const plan = parseBlueprint(planPath.endsWith('.json') ? JSON.parse(raw) : raw);
const engine = new InspectionEngine(plan, { managerName: 'אוהד' });

console.log('=== BuildCheck AI — בקרת קומפלטים ===\n');

while (engine.state !== STATES.APPROVED) {
  const prompt = engine.prompt();
  console.log('\n' + stripMd(prompt.message) + '\n');

  switch (engine.state) {
    case STATES.PRE_CHECK_GATE: {
      const answers = {};
      for (const q of prompt.inputs) {
        const a = (await ask(`${q.label} — ${q.hint} [כן/לא] `)).trim();
        answers[q.id] = /^(כן|y|yes|1)$/i.test(a);
      }
      engine.submitPreChecks(answers);
      break;
    }
    case STATES.HALTED: {
      await ask('לחץ Enter לאחר תיקון הליקויים בשטח... ');
      engine.restartAfterHalt();
      break;
    }
    case STATES.LASER_CALIBRATION: {
      await ask('[הלייזר מוכן] — לחץ Enter לאישור... ');
      engine.confirmLaser();
      break;
    }
    case STATES.STATION_INSPECTION: {
      const measurements = {};
      for (const field of prompt.inputs) {
        if (field.type === 'boolean') {
          const a = (await ask(`${field.label} — ${field.hint ?? ''} [כן/לא, Enter=כן] `)).trim();
          measurements[field.id] = a === '' || /^(כן|y|yes|1)$/i.test(a);
          continue;
        }
        const a = (await ask(`${field.label}${field.placeholder !== '' ? ` (יעד ${field.placeholder} ס"מ)` : ''} [מספר / Enter=תקין] `)).trim();
        if (a !== '' && !Number.isNaN(Number(a))) setMeasurement(measurements, field.id, Number(a));
      }
      const note = (await ask('הערת חריגה (Enter=אין): ')).trim();
      const record = engine.submitStation({ measurements, confirmOk: true, note });
      printStationResult(record);
      break;
    }
    case STATES.SLOPE_CHECK: {
      const a = (await ask('מדידת שיפוע: הקלד "ירידה,אורך" בס"מ (למשל 3,200) או Enter לאישור עם פלס: ')).trim();
      if (a === '') {
        engine.submitSlopes({ confirmOk: true });
      } else {
        const [drop, run] = a.split(',').map(Number);
        const { lines } = engine.submitSlopes([{ name: 'קו דלוחין ראשי', dropCm: drop, runCm: run }]);
        for (const line of lines) {
          console.log(line.ok ? `  ✔ שיפוע ${line.percent}% — תקין` : `  ⚠ שיפוע ${line.percent}% — מחוץ לתחום ${line.minPct}%–${line.maxPct}%`);
        }
      }
      break;
    }
    case STATES.APPROVAL: {
      const override = prompt.buttons.some((b) => b.id === BUTTONS.APPROVE_OVERRIDE);
      const q = override ? 'קיימות חריגות. לאשר באילוץ? [כן/לא] ' : 'לאשר את החדר? [כן/לא] ';
      const a = (await ask(q)).trim();
      if (/^(כן|y|yes|1)$/i.test(a)) {
        engine.approveRoom({ overrideDeviations: override, approvedBy: 'אוהד' });
      } else {
        console.log('האישור בוטל. ניתן לעצור כאן ולתקן בשטח (המצב נשמר בדו"ח).');
        printReport(engine);
        process.exit(0);
      }
      break;
    }
  }
}

console.log('\n' + stripMd(engine.prompt().message));
printReport(engine);
rl.close();

function setMeasurement(measurements, id, value) {
  if (id.endsWith('.x') || id.endsWith('.y')) {
    const base = id.slice(0, -2);
    measurements[base] = measurements[base] ?? {};
    measurements[base][id.slice(-1)] = value;
  } else {
    measurements[id] = value;
  }
}

function printStationResult(record) {
  for (const r of record.results) {
    const mark = { ok: '✔', deviation: '⚠', confirmed: '·', skipped: '−' }[r.status] ?? '?';
    console.log(`  ${mark} ${r.label} — ${r.status}`);
  }
}

function printReport(engine) {
  console.log('\n--- דו"ח בדיקה (JSON) ---');
  console.log(JSON.stringify(engine.report(), null, 2));
}

function stripMd(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}
