import crypto from 'node:crypto';

/**
 * הצפנת AES-256-GCM לכספת הסיסמאות.
 * מפתח נלקח מ-VAULT_KEY (64 תווי hex = 32 בייט). אם לא הוגדר — נוצר מפתח אקראי
 * לזמן ריצה (מתאים לפיתוח/הדגמה בלבד; בפרודקשן יש להגדיר VAULT_KEY קבוע).
 */
function getKey(): Buffer {
  const hex = process.env.VAULT_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  // מפתח ארעי לפיתוח
  return crypto.createHash('sha256').update(hex ?? 'family-plus-dev-key').digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
