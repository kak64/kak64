# Infinity IL — Roleplay Server Store

חנות אונליין מודרנית בעברית (RTL) לקהילת **Infinity IL** — בנויה על Express + EJS + SQLite, עם פאנל ניהול מלא, תשלומים PayPal/Bit, והתחברות עם Discord או Cfx.re.

## Features

- 🎨 **עיצוב סגול קוסמי** עם glassmorphism, hero מואר, באדג'ים צבעוניים
- 🛒 **עגלת קניות + Checkout** עם אופציה לקודי הנחה ותוספת מחיר אדמין
- 💳 **תשלום PayPal או Bit** — מצב דמו אוטומטי כשלא מוגדרים מפתחות
- 🔐 **התחברות**: אימייל+סיסמה, Discord OAuth, Cfx.re OAuth
- 📦 **קטגוריות + תגיות + חבילות** עם תכולת מוצר ("מה כלול בחבילה")
- 🛠 **פאנל אדמין מלא**: מוצרים (CRUD + העלאת תמונות), קטגוריות, הזמנות, משתמשים, הגדרות
- 👤 **אזור אישי**: היסטוריית הזמנות, פרטי הזמנה, פרופיל
- 📱 **רספונסיבי מלא** — נראה מצוין במובייל ובדסקטופ
- 🌟 SQLite — קובץ אחד, ללא תלות חיצונית

## Quick start

```bash
cp .env.example .env          # ערוך את ה-.env
npm install
npm start                     # http://localhost:3000
```

הריצה הראשונה יוצרת את ה-DB ב-`db/data.sqlite`, מזריעה קטגוריות + מוצרים לדוגמה,
ויוצרת משתמש אדמין בהתאם ל-`ADMIN_EMAIL` / `ADMIN_PASSWORD` מה-.env.

ברירת מחדל לאדמין: `admin@infinity-il.com` / `change-me-now`. **שנו אותם ב-.env**.

## ENV variables

| Variable | Description |
|---|---|
| `SESSION_SECRET` | מחרוזת ארוכה אקראית לחתימת session cookies |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME` | משתמש אדמין שנוצר בהרצה הראשונה |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | Discord OAuth — צרו אפליקציה ב-https://discord.com/developers/applications |
| `CFX_CLIENT_ID`, `CFX_CLIENT_SECRET`, `CFX_REDIRECT_URI` | Cfx.re OAuth |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` | PayPal — אם ריקים, ירוץ במצב דמו |
| `BIT_MERCHANT_ID`, `BIT_API_KEY` | Bit — אם ריקים, ירוץ במצב דמו |
| `CURRENCY`, `CURRENCY_SYMBOL` | ברירת מחדל ILS / ₪ |

## Project layout

```
server.js                    # Express bootstrap
src/
  db.js                      # SQLite schema, seed, all queries
  middleware.js              # auth helpers + currency formatter
  routes/
    public.js                # home, category, product
    auth.js                  # email/pass, Discord, CFX
    cart.js                  # add/update/remove/clear
    checkout.js              # discount, pay, success
    dashboard.js             # user orders + profile
    admin.js                 # products, categories, orders, users, settings
views/                       # EJS — Hebrew RTL
  partials/                  # header, footer, product-card
  auth/                      # login, register
  dashboard/                 # index, order, profile
  admin/                     # index, products, product-form, categories, orders, order, users, settings
public/
  css/style.css              # purple cosmic theme
  js/app.js
  img/logo.svg               # Infinity IL logo
  uploads/                   # product images uploaded via admin
db/                          # SQLite data + sessions
```

## Adding products

1. התחברו כאדמין ועברו ל-`/admin/products/new`
2. בחרו קטגוריה, הזינו שם, תיאור, מחיר ומחיר מבצע (אופציונלי)
3. הוסיפו "תכולה" — שורה לכל פריט שמופיע בחבילה
4. סמנו "זוהי חבילה" אם המוצר כולל מספר פריטים
5. העלו תמונה (אופציונלי — אם אין, יוצג placeholder עם אייקון הקטגוריה)

## Discount codes

הגדירו ב-`/admin/settings` בפורמט: `WELCOME10:10,SUMMER20:20`
(הקוד מיושם כסכום שמופחת מסך ההזמנה ב-checkout).

## Production checklist

- [ ] שנו את `SESSION_SECRET` למחרוזת ארוכה אקראית
- [ ] הגדירו `ADMIN_PASSWORD` חזקה ושנו את האדמין הראשוני
- [ ] הריצו מאחורי HTTPS reverse proxy (nginx / Caddy)
- [ ] צרו אפליקציות OAuth ב-Discord / Cfx.re והגדירו את ה-`REDIRECT_URI` המתאים לדומיין שלכם
- [ ] חברו PayPal ו-Bit אמיתיים (Pelecard/Tranzila עבור Bit) ואמתו שתשלום מסמן את ההזמנה כ-`paid` (כיום מצב דמו מסמן אוטומטית)
- [ ] הגדירו backups ל-`db/data.sqlite`
- [ ] עברו ל-Redis session store בריצה רב-מופעית

## License

MIT
