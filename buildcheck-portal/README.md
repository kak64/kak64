# BuildCheck Portal — ניהול עבודות ובקרת שטח

פורטל רב-חברתי (multi-tenant) לניהול עבודות שטח בבנייה: מנהל האפליקציה פותח
חברות לקוח (כל אחת עם לוגו ייחודי מתחלף), מנהל חברה רושם עובדים ושולח משימות
לפי מחוז / אזור / תפקיד עם תאריך ושעת ביצוע ותאריך יעד, והעובד מבצע בשטח —
כל בדיקה עם **חובת צילום**, מדידות בס"מ/מטר, ליקויים ודוח מסכם לאישור המנהל.

Zero dependencies — plain Node.js (>=18) + native ES modules in the browser.
No build step required to run.

## Quick start

```bash
npm start            # http://localhost:3040
npm test             # 28 node:test cases
npm run build:demo   # dist/demo-*.html — self-contained single-file demos
```

### Demo accounts (seeded on first load)

| תפקיד | שם משתמש | סיסמה |
|---|---|---|
| מנהל האפליקציה | `admin` | `1234` |
| מנהל חברה (אוהד לוי) | `ohad` | `1234` |
| עובד — אינסטלטור (יוסי כהן) | `yossi` | `1234` |
| עובד — חשמלאי (דוד מזרחי) | `david` | `1234` |

## The three panels

**מנהל האפליקציה (app admin)** — opens client companies and their managers
(credentials auto-generated, shown once), re-rolls each company's unique
generated logo (🎲), and maintains the app-level registries: 23 construction
roles, and 9 task categories divided into sub-categories with default check
items.

**מנהל חברה (company manager)** — registers workers by entering only a name
and a role from the registry (username + password are generated
automatically); dispatches tasks by category → sub-category with a target of
district / area / role (filters combine, matched workers preview live), an
execution date + time and a completion deadline; reviews submitted field
reports photo-by-photo and approves them. Also gets a **dashboard** (report
trend + defect-rate analytics with exportable defect report) and the **plan
studio** (below).

**עובד (worker)** — sees assignments filtered by date (today / all / pick a
date) with due-date and overdue flags; executes check-by-check: OK/defect
toggle, optional measurement with a cm/meter unit choice, note (mandatory for
defects), and **at least one photo per check — enforced**; submits a detailed
report that lands on the manager's approval queue. Drafts persist locally, so
a page refresh mid-inspection loses nothing.

## User & branding management

- **Custom or auto usernames** — register a worker with a username you choose,
  or leave it blank for an auto-generated one (live availability hint).
- **Rename, reset password, change username, delete** — full control from the
  workers panel. Password reset is also permitted to supervisory roles
  (מנהל פרויקט / מהנדס ביצוע / מנהל עבודה) for a teammate who forgot theirs.
- **Logo upload** — the app admin *or* a company's own manager can upload an
  image logo (center-cropped, stored per company) that brands the panel and
  every printed report/certificate, or re-roll a generated geometric mark.

## Defect resolution, fines & documents

- When a submitted report contains defects, the manager resolves it three
  ways: **reassign** the task to another worker, **extend** the deadline and
  reopen it, or **reject and fine** the responsible company.
- A **fines ledger** (with Excel export and paid/open tracking) and a composite
  **project-risk score** (defects + overdue + rejects + open fines) surface on
  the dashboard.
- **Detailed reports** export to **Excel (CSV)** and print to **PDF**; a clean
  report can be approved with a **digital signature** that issues a **signed
  handover certificate** (תעודת מסירה דיגיטלית).

## The AI layer

**העוזר החכם (smart assistant)** — a floating chat available in every panel.
It answers from two engines: a **data engine** over the company's live tasks
("how many overdue?", "defect breakdown", "top worker", "what do I have
today?"), and a **construction knowledge base** of field norms (water-point
heights, drain slopes, socket clearances, flood tests, curing…). Manager
answers can turn into a one-click task dispatch. The engine is a pluggable
provider — a server deployment can route the same `askAssistant()` call to
the Claude API for open-ended answers.

**סטודיו תוכניות (plan studio)** — the manager uploads a plan or spec as an
**image** (גרמושקה / floor plan / 3D sketch), a **PDF**, or a **Word (.docx)**
file. Two review engines run **entirely client-side, no libraries**:
- **Images** → a real pixel analysis (drawing-vs-photo via a
  horizontal/vertical line-orientation profile, density, zone and title-block
  detection) with a confidence score.
- **PDF / Word** → text is extracted in the browser (.docx unzipped via the
  native `DecompressionStream`; text-layer PDFs decompressed and read) and run
  through a **thorough construction review** that pulls out building, floors,
  apartments, rooms, dimensions, Israeli standards (ת"י), dates and
  disciplines — prefilling the project profile from what it read.

Either way the studio then **generates a complete inspection program** (staged,
role-targeted tasks across floor groups and every chosen category, dispatched
in one click, unmatched proposals surfaced rather than dropped). Because a
mis-read can expose the company to fines, every review ends in a **mandatory
human-verification gate** and states honestly that it is an assistant, not a
substitute for a person — scanned or CID-encoded PDFs with no text layer are
reported as unreadable rather than guessed.

## Architecture

```
public/app.js   ── SPA controller (login, 3 panels, assistant, studio, charts)
public/style.css── design system (light+dark, RTL, blueprint-blue accent)
src/core/
  util.js       ── ids, seeded RNG, date helpers (injectable clock for tests)
  directory.js  ── roles, districts/areas, categories→subs→default checks
  logo.js       ── deterministic SVG logo generator (seed → identity)
  auth.js       ── companies, managers, workers, auto-credentials, login
  tasks.js      ── targeting, dispatch, drafts, report validation, approval
  knowledge.js  ── smart assistant: data intents + construction knowledge base
  planstudio.js ── image pixel analysis + inspection-program generation
  docparse.js   ── client-side .docx/PDF text extraction (injected inflaters)
  docreview.js  ── thorough construction-entity review of extracted text
  reports.js    ── CSV, printable report + handover certificate builders
  analytics.js  ── dashboard aggregations (trend, defect rates, risk, export)
  store.js      ── db shape, (de)serialization, demo seed
server.js       ── zero-dep static server (core served as-is to the browser)
tools/build-demo.mjs ── bundles everything into one self-contained HTML file
test/           ── 46 node:test cases over every core module
```

The published web demo declares the `downloads` runtime capability so the
dashboard's defect-report export saves a real file (with a graceful
blob-download fallback when the capability is absent).

Data persists in `localStorage` (browser-local, per device). Photos are
downscaled client-side (~1000px JPEG) before storage. Production hardening
would move auth + data to a server API (salted password hashing, real photo
storage) — the core modules are UI-independent to make that lift small.

## Verification

- `npm test` — 46 unit tests over the core (credential generation and
  uniqueness, permission boundaries, target resolution, report validation
  incl. the mandatory-photo rule, approval flow, seed integrity, assistant
  data + knowledge intents, image analysis, program generation, analytics).
- E2E: the bundled demo is driven in headless Chromium (Playwright) across
  all panels — 59 scenario checks including real photo upload, draft
  persistence across reload, logo re-roll, the smart assistant Q&A, plan-
  studio image analysis + program dispatch, dashboard charts, defect export,
  and a dark-mode pass.
