# KAK64

> 🏗️ **BuildCheck AI** — an interactive field-inspection assistant for
> plumbing completions (בקרת קומפלטים) lives in
> [`buildcheck-ai/`](buildcheck-ai/README.md).
>
> 👷 **BuildCheck Portal** — multi-tenant work-order management (פאנל מנהל
> אפליקציה / מנהל חברה / עובד, משימות לפי מחוז·אזור·תפקיד, דוחות עם חובת
> צילום) lives in [`buildcheck-portal/`](buildcheck-portal/README.md).

# KAK64 Hosting Panel

פאנל ניהול אחסון בעברית מעל VMware ESXi.

A Hebrew (RTL) hosting company website with user registration/login, server
ordering, billing, support tickets and an admin panel — built on top of a
VMware ESXi host.

## Features

- **דף הבית, חבילות, אודות, צור קשר, תנאי שימוש** (public site)
- **הרשמה והתחברות** with bcrypt password hashing
- **אזור אישי (Dashboard)**: סקירה, השרתים שלי, הזמנת שרת, חשבוניות, פניות תמיכה, פרופיל
- **לוח ניהול (Admin)**: משתמשים, חבילות, שרתים, פניות תמיכה, סטטיסטיקות
- **שילוב ESXi**: יצירה / הפעלה / כיבוי / אתחול / מחיקה של מכונות וירטואליות
- **RTL מלא** עם פונט עברי
- בסיס נתונים SQLite (קובץ אחד, ללא תלות חיצונית)

## Quick start

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, and ESXi credentials
npm install
npm start
```

Open http://localhost:3000

The first run creates the SQLite DB at `db/data.sqlite`, seeds default plans,
and creates an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## ESXi integration

`src/esxi.js` provides power-on / power-off / reboot / destroy via the
ESXi REST API. The `provisionVm` function is intentionally left as a TODO —
provisioning a VM via the ESXi API requires choosing a strategy:
clone-from-template, OVF deploy, or PowerCLI/govc. Implement it according to
your environment.

When ESXi credentials are not set in `.env`, the system falls back to a
mocked mode so you can demo the full flow locally.

## Project structure

```
server.js              # Express bootstrap
src/db.js              # SQLite schema + seed
src/esxi.js            # ESXi REST client
src/middleware.js      # auth helpers
src/routes/            # public, auth, dashboard, servers, billing, tickets, admin
views/                 # Hebrew RTL EJS templates
public/css/style.css   # styling
```

## Production checklist

- [ ] Strong `SESSION_SECRET`
- [ ] HTTPS reverse proxy (nginx / Caddy)
- [ ] Real payment provider (Tranzila / iCount / Stripe)
- [ ] Email sending for ticket replies / invoices
- [ ] Implement `esxi.provisionVm` for real VM provisioning
- [ ] Switch session store to Redis for multi-instance
- [ ] Backups for `db/data.sqlite`
