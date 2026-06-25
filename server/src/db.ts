import mongoose from 'mongoose';

let connected = false;

/**
 * מתחבר ל-MongoDB אם הוגדר MONGODB_URI. אם לא — נשארים במצב in-memory.
 * החיבור לא חוסם את עליית השרת: כישלון חיבור נרשם ביומן וממשיכים עם מאגר זיכרון.
 */
export async function connectDb(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('ℹ️  MONGODB_URI לא הוגדר — רץ במצב in-memory (נתוני דמה).');
    return false;
  }
  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('✅ מחובר ל-MongoDB');
    return true;
  } catch (err) {
    console.warn('⚠️  כשל בחיבור ל-MongoDB — נופלים למצב in-memory.', (err as Error).message);
    return false;
  }
}

export const isDbConnected = () => connected;
