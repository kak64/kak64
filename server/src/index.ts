import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './db.js';

const PORT = Number(process.env.PORT) || 4000;

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`🚀 +family API פועל על http://localhost:${PORT}`);
    console.log(`   עוזר AI: ${process.env.AI_PROVIDER || 'rules'}`);
  });
}

main().catch((err) => {
  console.error('שגיאה בהפעלת השרת:', err);
  process.exit(1);
});
