# +family 👨‍👩‍👧‍👦

אפליקציית **ניהול משפחתי חכם** בעברית (RTL) — יומן, רשימת קניות חכמה, ריכוז פיננסי
מאוחד, כספת מסמכים וסיסמאות, ועוזר AI קולי בעברית.

A full-stack, mobile-first, Hebrew (RTL) family-management app.

| שכבה | טכנולוגיה |
| --- | --- |
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS (Dark Mode, RTL) |
| **Backend** | Express.js + TypeScript (CORS + Helmet) |
| **Database** | MongoDB (Mongoose) — עם נפילה אוטומטית ל-in-memory לפיתוח |
| **Icons** | lucide-react |
| **AI** | מנוע NLU עברי offline + תמיכה ב-Anthropic / OpenAI / Gemini |

## מבנה הפרויקט (Monorepo)

```
family-plus/
├── package.json            # npm workspaces (client + server)
├── .env.example            # משתני סביבה לשרת ולקליינט
├── client/                 # React + Vite + Tailwind (TypeScript)
│   ├── index.html
│   ├── tailwind.config.js  # ערכת צבעים #0b0b16 / #13162c + אנימציות glow
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── types.ts        # טיפוסים משותפים
│       ├── lib/            # categorize (מיון מוצרים), expiry (תוקף מסמכים)
│       ├── data/mock.ts    # נתוני דמה (fallback כשאין שרת)
│       ├── api/            # client API + Google Calendar mocks + AI מקומי
│       ├── components/     # Header, BottomNav, FeatureCard, VoiceAssistant
│       └── screens/        # Home, Shopping, Calendar, Finance, Vault
└── server/                 # Express + TypeScript
    └── src/
        ├── index.ts        # bootstrap
        ├── app.ts          # express app (helmet, cors, routes)
        ├── db.ts           # חיבור MongoDB עם fallback
        ├── store.ts        # שכבת נתונים (Mongo / in-memory)
        ├── models/         # Mongoose schemas
        ├── lib/            # categorize, crypto (AES-256-GCM)
        ├── services/       # hebrewNlu (offline), aiService (LLM)
        └── routes/         # shopping-list, finance, calendar, vault, ai
```

## הפעלה מהירה

```bash
cp .env.example .env      # אופציונלי — האפליקציה רצה גם ללא קובץ .env
npm install               # מתקין את כל ה-workspaces

# הרצה במקביל (שרת על :4000, קליינט על :5173)
npm run dev
```

הקליינט ב-http://localhost:5173 והשרת ב-http://localhost:4000.

> ללא `MONGODB_URI` השרת רץ במצב **in-memory** עם נתוני דמה — מצוין להדגמה.
> ללא `VITE_API_URL` הקליינט עובד standalone על נתוני דמה מקומיים.

פקודות נוספות:

```bash
npm run build          # בונה client + server
npm run dev:client     # קליינט בלבד
npm run dev:server     # שרת בלבד
npm start              # מריץ את השרת המקומפל (dist)
```

## פיצ'רים

### 🛒 רשימת קניות חכמה
- הוספת מוצר חופשי בעברית.
- **מיון אוטומטי** של מוצרים למחלקות סופר ("חלב 3%" → מוצרי חלב, "עגבנייה" → ירקות ופירות) — `lib/categorize.ts`.
- סימון מוצרים שנקנו והעברתם לתחתית הרשימה בעיצוב line-through.

### 📅 יומן ומשימות
- תצוגת אירועים מקובצת לפי יום, מינימליסטית.
- פונקציות **Mock** להכנה לאינטגרציה עם Google Calendar API (`api/googleCalendar.ts`).

### 💰 תיק פיננסי מאוחד
- דשבורד שווי נכסים כולל (₪482,300).
- כרטיסי פנסיה, קופות גמל וביטוחים (נתוני דמה המדמים משיכה מהמסלקה הפנסיונית).
- חיווי ירוק: "הנתונים נמשכו בהצלחה מהמסלקה הפנסיונית".

### 🔐 כספת מסמכים וסיסמאות
- רשימת מסמכים (ת"ז, דרכונים, רישיונות) עם חישוב תוקף.
- התראה בולטת **צהוב/אדום** כשפג התוקף בתוך פחות מ-90 יום (`lib/expiry.ts`).
- כספת סיסמאות עם כפתור הצג/הסתר והעתקה. בשרת מיושמת הצפנת **AES-256-GCM** (`server/src/lib/crypto.ts`).

### 🤖 עוזר AI בעברית
- כפתור מיקרופון צף; בלחיצה עובר למצב "קשוב..." (`animate-pulse`).
- נתיב `POST /api/ai/ask` מקבל טקסט בעברית ומחזיר תשובה + **פעולה מובנית** (JSON).
- דוגמאות: "תוסיף חלב לרשימה" → הוספה לקניות; "מתי פג תוקף הדרכון?" → שאילתת מסמך.
- ברירת מחדל: מנוע חוקים עברי offline (ללא מפתח). ניתן להפעיל LLM אמיתי דרך `AI_PROVIDER` + מפתח API.

## API

| Method | Route | תיאור |
| --- | --- | --- |
| GET | `/api/health` | בדיקת חיים |
| GET | `/api/shopping-list` | כל מוצרי הקניות |
| POST | `/api/shopping-list` | הוספת מוצר (`{ name, quantity }`) — ממוין אוטומטית |
| GET | `/api/finance` | ריכוז פיננסי |
| GET | `/api/calendar` | אירועי יומן |
| GET | `/api/documents` | מסמכים משפחתיים |
| GET | `/api/passwords` | כספת סיסמאות |
| POST | `/api/ai/ask` | עוזר AI (`{ text }`) → `{ reply, action }` |

## הערות לפרודקשן

- [ ] הגדרת `MONGODB_URI` למסד נתונים אמיתי.
- [ ] הגדרת `VAULT_KEY` (32 בייט / 64 hex) להצפנת הסיסמאות.
- [ ] אימות משתמשים (JWT/Session) לפני חשיפת הכספת.
- [ ] OAuth2 אמיתי ל-Google Calendar.
- [ ] חיבור מפתח LLM (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`).
