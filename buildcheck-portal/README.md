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
generated logo (🎲), and maintains the app-level registries: roles, and task
categories divided into sub-categories with default check items.

**מנהל חברה (company manager)** — registers workers by entering only a name
and a role from the registry (username + password are generated
automatically); dispatches tasks by category → sub-category with a target of
district / area / role (filters combine, matched workers preview live), an
execution date + time and a completion deadline; reviews submitted field
reports photo-by-photo and approves them.

**עובד (worker)** — sees assignments filtered by date (today / all / pick a
date) with due-date and overdue flags; executes check-by-check: OK/defect
toggle, optional measurement with a cm/meter unit choice, note (mandatory for
defects), and **at least one photo per check — enforced**; submits a detailed
report that lands on the manager's approval queue. Drafts persist locally, so
a page refresh mid-inspection loses nothing.

## Architecture

```
public/app.js   ── SPA controller (login, 3 panels, exec flow, lightbox)
public/style.css── design system (light+dark, RTL, blueprint-blue accent)
src/core/
  util.js       ── ids, seeded RNG, date helpers (injectable clock for tests)
  directory.js  ── roles, districts/areas, categories→subs→default checks
  logo.js       ── deterministic SVG logo generator (seed → identity)
  auth.js       ── companies, managers, workers, auto-credentials, login
  tasks.js      ── targeting, dispatch, drafts, report validation, approval
  store.js      ── db shape, (de)serialization, demo seed
server.js       ── zero-dep static server (core served as-is to the browser)
tools/build-demo.mjs ── bundles everything into one self-contained HTML file
test/           ── 28 node:test cases over auth/tasks/directory/logo/store
```

Data persists in `localStorage` (browser-local, per device). Photos are
downscaled client-side (~1000px JPEG) before storage. Production hardening
would move auth + data to a server API (salted password hashing, real photo
storage) — the core modules are UI-independent to make that lift small.

## Verification

- `npm test` — 28 unit tests over the core (credential generation and
  uniqueness, permission boundaries, target resolution, report validation
  incl. the mandatory-photo rule, approval flow, seed integrity).
- E2E: the bundled demo is driven in headless Chromium (Playwright) across
  all three panels — 36 scenario checks including real photo upload, draft
  persistence across reload, logo re-roll and registry management.
