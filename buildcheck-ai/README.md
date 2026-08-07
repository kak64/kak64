# BuildCheck AI — בקרת קומפלטים אינטראקטיבית

עוזר בדיקות שטח חכם למנהלי עבודה: מלווה את מנהל העבודה צעד-אחר-צעד בבקרת איכות
של קומפלטים לאינסטלציה מול תוכניות ביצוע, אוכף תנאי סף מחמירים ומחשב מדידות
פיזיות בזמן אמת (שיטת השטיכמוס — קו לייזר בגובה 1 מטר).

An intelligent, interactive field-inspection assistant for construction site
managers: step-by-step quality control for plumbing completions ("קומפלטים")
against execution plans, with a strict pre-check gate and on-the-fly
measurement math.

Zero dependencies — plain Node.js (>=18) + native ES modules in the browser.
No build step.

## Quick start

```bash
# Web chat UI (Hebrew, RTL)
npm start           # -> http://localhost:3030

# Terminal walkthrough
npm run cli                          # uses samples/plan.sample.json
node bin/cli.js samples/plan.sample.txt   # PDF-extracted text format

# Test suite (40 tests)
npm test
```

## Architecture (Section 5 implementation tasks)

| Task | Module | What it does |
|------|--------|--------------|
| 1. Data Model | `src/core/blueprint.js` | Parses blueprint meta-data (building/floor/apartment, room layout, target dimensions) from structured JSON **or** key:value text extracted from a PDF plan; merges plan overrides onto the wet-room station template and pre-computes every derived target. |
| 2. Formula Calculator | `src/core/calculator.js` | Pure functions: `laserOffset()` converts a final height into a `100cm − target` tape step (incl. above-the-line cases), `finishedWallOffset()` adds the 2–3cm plaster+ceramic allowance, `evaluateMeasurement/Range()` applies tolerances, `evaluateSlope()` enforces 1.5%–2%. |
| 3. State Engine | `src/core/engine.js` | `InspectionEngine` enforces the strict sequence `PRE_CHECK_GATE → LASER_CALIBRATION → STATION_INSPECTION → SLOPE_CHECK → APPROVAL`. Any "no" on the 5 mandatory pre-checks **halts** the session; out-of-order actions throw `StateError`; every event is logged into an audit report. |
| 4. Interactive UI | `src/core/script.js` + `public/` + `bin/cli.js` | The script layer renders each state into `{message, inputs, buttons}` — actionable buttons (`[הלייזר מוכן]`, `[הכל תקין, המשך]`, `[דווח על חריגה]`) alongside numeric deviation inputs — consumed by the RTL web chat and the CLI. |

```
public/app.js  ──┐                      ┌── src/core/constants.js   (states, pre-checks, buttons)
bin/cli.js     ──┼── InspectionEngine ──┼── src/core/calculator.js  (datum & tolerance math)
                 │   (src/core/engine)  ├── src/core/blueprint.js   (plan parsing + station resolution)
server.js ───────┘                      └── src/core/script.js      (Hebrew chat prompts)
```

## Inspection flow

1. **שער תנאי סף (PRE_CHECK_GATE)** — 5 mandatory yes/no checks: risers under
   temporary-pump water pressure, sub-contractors done & floor cleared, floor
   swept clean, all pipe openings plugged against gravel, updated tenant-change
   printout handed to the contractor at most one day prior. A single "no"
   halts the process (state `HALTED`) until fixed.
2. **כיול שטיכמוס (LASER_CALIBRATION)** — laser line opened at exactly 1.00m,
   measured from the low external step of the ממ"ד toward the apartment (never
   inside the shelter). Every height check thereafter is
   `100cm − target height` down from the line (or above it when target > 1m).
3. **תחנות (STATION_INSPECTION)** — doorway-first walkthrough:
   * **עמדת כיור** — raw-wall center + 2–3cm plaster (45→47–48cm), water points
     60cm (40cm down the line), drain 50cm (50cm down).
   * **מקלחת / אינטרפוץ** — interpuck center 42cm incl. plaster, water points
     22cm from wall at 110cm (10cm **above** the line), shower drain 42×45cm.
   * **אסלה וניקוזי מזגן** — outlet position vs. the PDF plan, AC drain height.
4. **שיפועים (SLOPE_CHECK)** — waste lines verified at 1.5%–2% with laser,
   tape and spirit level (enter drop/run or confirm).
5. **אישור (APPROVAL)** — approval is blocked while deviations are open;
   a manager may approve "באילוץ" and the override is stamped into the report.

`engine.report()` returns the full audit: pre-check answers, halt history,
laser confirmation, per-station evaluations, slopes, deviations and the
approval record.

## Blueprint input formats

Structured JSON (see `samples/plan.sample.json`):

```json
{
  "building": "A", "floor": 1, "apartment": 1,
  "rooms": [{ "name": "חדר רחצה הורים",
              "overrides": { "sink_center": 45, "ac_drain_height": 240 } }]
}
```

Key:value text as extracted from a PDF (see `samples/plan.sample.txt`) —
Hebrew and English keys, `42x45` / `42 על 45` pairs, free-text lines kept as
notes. Hook your PDF extractor (e.g. `pdftotext`, `pdf-parse`) and feed the
text to `parseBlueprint()`.

## Embedding

```js
import { parseBlueprint } from './src/core/blueprint.js';
import { InspectionEngine } from './src/core/engine.js';

const engine = new InspectionEngine(parseBlueprint(planJsonOrText), { managerName: 'אוהד' });
engine.prompt();                            // -> { state, message, inputs, buttons }
engine.submitPreChecks({ risers_pressure: true, /* ...all five... */ });
engine.confirmLaser();
engine.submitStation({ measurements: { sink_water_height: 60 }, confirmOk: true });
// ... submitSlopes(...) -> approveRoom(...) -> engine.report()
```

The core is isomorphic: the same modules run in Node (CLI, tests) and are
served untranspiled to the browser (`/core/*`).
