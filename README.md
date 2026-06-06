# Homly — כל הבית במקום אחד 🏡

אפליקציית ווב (PWA) בעברית לניהול משק הבית: **רשימת קניות משותפת, משימות
ומשפחה — במקום אחד**. במקום לנהל את הבית בקבוצת וואטסאפ, לכל בית יש רשימה
אחת משותפת. כל אחד מוסיף מהטלפון שלו, רואים מי הוסיף מה, והכול מתעדכן מיד אצל
כולם.

נבנתה בהשראת הרעיון של Homly — עם מראה iOS, RTL מלא, והקלטה קולית להוספת
פריטים.

## תכונות

- **רשימת קניות משותפת** — הוספה, סימון כנקנה, מחיקה, קיבוץ אוטומטי לפי
  מחלקות (חלב, ירקות, ניקיון...) וניקוי פריטים שהושלמו.
- **רשימת משימות** — משימות לבית עם תזכורות (תאריך ושעה), כמו "לשלם ארנונה".
- **הקלטה קולית** 🎤 — אומרים "חלב, ביצים ולחם" והפריטים מתווספים אוטומטית
  (Web Speech API, עברית). יש נפילה חיננית להקלדה בדפדפנים שאינם תומכים.
- **בית משותף** — הזמנת בני משפחה בקוד הצטרפות, ניהול חברים, בעל בית.
- **פיד עדכונים** — "מי הוסיף / סימן מה ומתי", בזמן אמת.
- **התחברות והרשמה** עם הצפנת סיסמאות (bcrypt) ו‑JWT.
- **RTL מלא**, ניתנת להתקנה למסך הבית (PWA) ועובדת גם offline (app shell).

## הרצה מהירה

```bash
cp .env.example .env       # ערכו את JWT_SECRET
npm install
npm run serve              # build של ה-client + הרצת השרת
```

פתחו http://localhost:3001

בריצה הראשונה נוצר בסיס נתונים SQLite בנתיב `db/homly.sqlite`.

### פיתוח (hot reload)

```bash
npm run dev
```

מריץ במקביל את שרת ה‑API (פורט 3001) ואת Vite (פורט 5173, עם proxy ל‑`/api`).
פתחו את http://localhost:5173

> 💡 הקלטה קולית דורשת מיקרופון ועובדת בדפדפנים מבוססי Chromium. ב‑iOS Safari
> כדאי לגשת דרך HTTPS כדי לאפשר הרשאת מיקרופון.

## מבנה הפרויקט

```
server.js              # Express bootstrap + הגשת ה-client הבנוי
src/
  db.js                # סכמת SQLite + עזר לוג פעילות
  auth.js              # JWT + middleware הרשאות (authRequired, homeMember)
  routes/
    auth.js            # הרשמה / התחברות / פרופיל
    homes.js           # יצירת בית, הצטרפות בקוד, חברים, הזמנות
    shopping.js        # רשימת קניות
    tasks.js           # רשימת משימות
    activity.js        # פיד עדכונים
client/
  index.html
  public/              # manifest, אייקון, service worker
  src/
    App.jsx            # ניווט ראשי + מצב התחברות
    api.js             # עטיפת fetch + אחסון token
    screens/           # Auth, Onboarding, Home, Shopping, Tasks, Settings
    components/        # Avatar, TabBar, Sheet, Toast, VoiceModal
    lib/               # icons, util, usePoll
vite.config.js
```

## ארכיטקטורה בקצרה

- **Backend**: Node + Express, בסיס נתונים SQLite (`better-sqlite3`). אימות
  מבוסס JWT (90 יום), סיסמאות מוצפנות ב‑bcrypt.
- **Frontend**: React (Vite), ללא router חיצוני — ניווט מבוסס state עם tab bar
  בסגנון iOS. סנכרון בין בני הבית באמצעות polling (`usePoll`) עם עצירה כשהטאב
  מוסתר ורענון ב‑focus.
- **מודל נתונים**: `users`, `homes`, `members` (role: owner/member),
  `shopping_items`, `tasks`, `activity`. כל הרשימות משויכות ל‑`home_id`,
  והגישה נאכפת ע"י `homeMember`.

## משתני סביבה (`.env`)

| משתנה        | תיאור                                   | ברירת מחדל         |
| ------------ | --------------------------------------- | ------------------ |
| `PORT`       | פורט השרת                               | `3001`             |
| `JWT_SECRET` | מפתח לחתימת אסימוני התחברות — **החליפו** | —                  |
| `DB_PATH`    | נתיב קובץ ה‑SQLite                       | `db/homly.sqlite`  |

## רשימת בדיקות לפרודקשן

- [ ] `JWT_SECRET` חזק ואקראי
- [ ] HTTPS (nginx / Caddy) — חובה להקלטה קולית ולהתקנת PWA
- [ ] שדרוג סנכרון מ‑polling ל‑WebSocket / SSE לעדכון מיידי
- [ ] תזכורות אמיתיות (Web Push) למשימות עם תאריך יעד
- [ ] גיבויים ל‑`db/homly.sqlite`
