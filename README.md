# family+ 👨‍👩‍👧‍👦

אפליקציית **ניהול משפחתי חכם** בעברית (RTL) — יומן, רשימות קניות, ריכוז פיננסי,
כספת מסמכים וסיסמאות, ועוזר קולי מבוסס AI.

A Hebrew (RTL) family-management app UI built with **React + Vite + Tailwind CSS**.

## פיצ'רים מרכזיים

- **יומן ומשימות** — מסונכרן ל-Google Calendar
- **תיק פיננסי מאוחד** — פנסיה, ביטוחים ופוליסות
- **רשימת קניות חכמה** — מוצרים מסודרים אוטומטית לפי מחלקה
- **כספת מסמכים** — התראות לפני פג תוקף (ת"ז, דרכון)
- **סיסמאות מוצפנות** — כספת משפחתית מקצה לקצה
- **עוזר קולי (AI)** — הוספת פריטים בפקודה קולית
- **RTL מלא** עם פונט Heebo וניווט תחתון

## Quick start

```bash
npm install
npm run dev      # מפעיל שרת פיתוח (Vite)
```

פקודות נוספות:

```bash
npm run build    # בנייה לפרודקשן (תיקיית dist/)
npm run preview  # תצוגה מקדימה של ה-build
```

## Project structure

```
index.html            # נקודת כניסה + טעינת פונט Heebo
src/main.jsx          # bootstrap של React
src/App.jsx           # קומפוננטת FamilyPlusApp הראשית
src/index.css         # Tailwind + פס גלילה מותאם
tailwind.config.js    # תצורת Tailwind + אנימציות
vite.config.js        # תצורת Vite
```

## Stack

- React 18
- Vite 6
- Tailwind CSS 3
- lucide-react (אייקונים)
