// BuildCheck AI — web chat controller (Section 5.4).
// Renders the engine's prompt (message + action buttons + numeric deviation
// inputs) as an RTL chat, and feeds the manager's responses back into the
// strict state engine.

import { parseBlueprint } from '/core/blueprint.js';
import { InspectionEngine } from '/core/engine.js';
import { BUTTONS, STATES, CHECK_KINDS } from '/core/constants.js';

const chatEl = document.getElementById('chat');
const composerEl = document.getElementById('composer');
const stateBadge = document.getElementById('state-badge');

const FALLBACK_PLAN = {
  building: 'A',
  floor: 1,
  apartment: 1,
  rooms: [{ name: 'חדר רחצה הורים', overrides: { sink_center: 45, ac_drain_height: 240 } }],
};

let engine;

init();

async function init() {
  let planSource = FALLBACK_PLAN;
  try {
    const res = await fetch('/samples/plan.sample.json');
    if (res.ok) planSource = await res.json();
  } catch { /* offline / file mode — use the fallback plan */ }
  engine = new InspectionEngine(parseBlueprint(planSource), { managerName: 'אוהד' });
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  const prompt = engine.prompt();
  stateBadge.textContent = prompt.state;
  addBubble('ai', prompt.message);
  renderComposer(prompt);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addBubble(who, text, extraNode) {
  const div = document.createElement('div');
  div.className = `bubble ${who}`;
  div.innerHTML = mdLite(text);
  if (extraNode) div.appendChild(extraNode);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function mdLite(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderComposer(prompt) {
  composerEl.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'composer-inner';

  const values = { booleans: {}, numbers: {}, texts: {} };

  if (prompt.inputs.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'inputs';
    for (const input of prompt.inputs) {
      grid.appendChild(input.type === 'boolean' ? boolField(input, values) : textField(input, values));
    }
    inner.appendChild(grid);
  }

  if (prompt.buttons.length > 0) {
    const row = document.createElement('div');
    row.className = 'buttons';
    prompt.buttons.forEach((btn, i) => {
      const b = document.createElement('button');
      b.className = 'action-btn' + (btn.id === BUTTONS.STATION_REPORT ? ' danger' : i > 0 ? ' secondary' : '');
      b.textContent = btn.label;
      b.onclick = () => handleAction(btn, values);
      row.appendChild(b);
    });
    inner.appendChild(row);
  }

  composerEl.appendChild(inner);
}

function boolField(input, values) {
  const wrap = document.createElement('div');
  wrap.className = 'bool-field';
  const q = document.createElement('div');
  q.className = 'q';
  q.innerHTML = escapeHtml(input.label) + (input.hint ? `<span class="hint">${escapeHtml(input.hint)}</span>` : '');
  const seg = document.createElement('div');
  seg.className = 'seg';
  const yes = document.createElement('button');
  yes.textContent = 'כן';
  const no = document.createElement('button');
  no.textContent = 'לא';
  yes.onclick = () => { values.booleans[input.id] = true; yes.className = 'on-yes'; no.className = ''; };
  no.onclick = () => { values.booleans[input.id] = false; no.className = 'on-no'; yes.className = ''; };
  seg.append(yes, no);
  wrap.append(q, seg);
  return wrap;
}

function textField(input, values) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = input.unit ? `${input.label} (${input.unit})` : input.label;
  const el = document.createElement('input');
  el.type = input.type === 'number' ? 'number' : 'text';
  el.step = 'any';
  el.placeholder = input.placeholder ?? '';
  el.oninput = () => {
    if (input.type === 'number') {
      if (el.value === '') delete values.numbers[input.id];
      else values.numbers[input.id] = Number(el.value);
    } else {
      values.texts[input.id] = el.value;
    }
  };
  wrap.append(label, el);
  return wrap;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function handleAction(btn, values) {
  try {
    switch (btn.id) {
      case BUTTONS.SUBMIT_PRECHECKS: {
        const answers = values.booleans;
        addBubble('user', summarizeBooleans(answers));
        engine.submitPreChecks(answers);
        break;
      }
      case BUTTONS.RESTART:
        addBubble('user', btn.label);
        engine.restartAfterHalt();
        break;
      case BUTTONS.LASER_READY:
        addBubble('user', btn.label);
        engine.confirmLaser();
        break;
      case BUTTONS.STATION_OK:
      case BUTTONS.STATION_REPORT: {
        const measurements = collectMeasurements(values);
        let note = '';
        if (btn.id === BUTTONS.STATION_REPORT) {
          note = window.prompt('תאר את החריגה שנמצאה בתחנה:') ?? '';
          if (!note.trim() && Object.keys(measurements).length === 0) return;
        }
        addBubble('user', summarizeStationSubmit(btn.label, measurements, note));
        const record = engine.submitStation({ measurements, confirmOk: true, note });
        addStationFeedback(record);
        break;
      }
      case BUTTONS.SLOPES_SUBMIT: {
        const drop = values.numbers.slope_drop;
        const run = values.numbers.slope_run;
        if (drop == null || run == null) {
          window.alert('נא להזין ירידה אנכית ואורך קו (בס"מ)');
          return;
        }
        const name = values.texts.slope_name || 'קו דלוחין ראשי';
        addBubble('user', `מדידת שיפוע — ${name}: ירידה ${drop} ס"מ על ${run} ס"מ`);
        const slopes = engine.submitSlopes([{ name, dropCm: drop, runCm: run }]);
        for (const line of slopes.lines) {
          addBubble('ai', line.ok
            ? `שיפוע ${line.name}: **${line.percent}%** — בתחום התקין ✔`
            : `שיפוע ${line.name}: **${line.percent}%** — מחוץ לתחום ${line.minPct}%–${line.maxPct}% ⚠️`);
        }
        break;
      }
      case BUTTONS.SLOPES_OK:
        addBubble('user', btn.label);
        engine.submitSlopes({ confirmOk: true });
        break;
      case BUTTONS.APPROVE:
      case BUTTONS.APPROVE_OVERRIDE: {
        addBubble('user', btn.label);
        const result = engine.approveRoom({ overrideDeviations: btn.id === BUTTONS.APPROVE_OVERRIDE, approvedBy: 'אוהד' });
        if (result.approved) {
          const pre = document.createElement('pre');
          pre.className = 'report';
          pre.textContent = JSON.stringify(result.report, null, 2);
          addBubble('ai', 'דו"ח הבדיקה המלא:', pre);
        }
        break;
      }
      default:
        return;
    }
    render();
  } catch (err) {
    addBubble('ai', `⚠️ ${err.message}`);
  }
}

function collectMeasurements(values) {
  const measurements = {};
  for (const [id, val] of Object.entries(values.numbers)) {
    if (id.startsWith('slope_')) continue;
    if (id.endsWith('.x') || id.endsWith('.y')) {
      const base = id.slice(0, -2);
      measurements[base] = measurements[base] ?? {};
      measurements[base][id.slice(-1)] = val;
    } else {
      measurements[id] = val;
    }
  }
  for (const [id, val] of Object.entries(values.booleans)) measurements[id] = val;
  // Drop half-filled position pairs — the engine expects both axes.
  for (const [id, val] of Object.entries(measurements)) {
    if (val && typeof val === 'object' && (val.x == null || val.y == null)) delete measurements[id];
  }
  return measurements;
}

function summarizeBooleans(answers) {
  const entries = Object.entries(answers);
  if (entries.length === 0) return 'נשלח ללא תשובות';
  const yes = entries.filter(([, v]) => v).length;
  return `אישורי בדיקות סף: ${yes}/${entries.length} כן` + (yes < entries.length ? ' ⚠️' : ' ✔');
}

function summarizeStationSubmit(label, measurements, note) {
  const parts = [label];
  const ms = Object.entries(measurements)
    .map(([id, v]) => typeof v === 'object' ? `${id}: ${v.x}×${v.y}` : `${id}: ${v}`);
  if (ms.length) parts.push('מדידות — ' + ms.join(', '));
  if (note) parts.push(`חריגה: ${note}`);
  return parts.join('\n');
}

function addStationFeedback(record) {
  const devs = record.results.filter((r) => r.status === 'deviation');
  if (devs.length === 0) {
    addBubble('ai', `✔ ${record.title}: כל המדידות שנקלטו תקינות.`);
  } else {
    const lines = devs.map((d) => `• ${d.label} — חריגה`);
    addBubble('ai', `⚠️ ${record.title}: נמצאו ${devs.length} חריגות:\n${lines.join('\n')}\n(נרשמו בדו"ח — נמשיך בבדיקה)`);
  }
}

// Guard against direct file:// usage where module fetch may fail silently.
window.addEventListener('error', (e) => {
  if (!engine && chatEl.childElementCount === 0) {
    chatEl.textContent = 'שגיאת טעינה: יש להריץ npm start ולגשת דרך http://localhost:3030';
  }
});

// Expose for debugging in DevTools.
Object.defineProperty(window, 'engine', { get: () => engine });
export { STATES, CHECK_KINDS };
