const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 32) {
    throw new Error('ENCRYPTION_KEY env var must be set to a 64-character hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return crypto.createHash('sha256').update(k).digest();
}

function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(value) {
  if (value == null) return null;
  if (!String(value).startsWith('enc:v1:')) {
    return value;
  }
  try {
    const buf = Buffer.from(String(value).slice(7), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('decrypt failed:', e.message);
    return null;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRootPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let out = '';
  const buf = crypto.randomBytes(length * 2);
  for (let i = 0; out.length < length; i++) {
    const c = chars[buf[i] % chars.length];
    if (c) out += c;
  }
  return out;
}

module.exports = { encrypt, decrypt, randomToken, hashToken, generateRootPassword };
