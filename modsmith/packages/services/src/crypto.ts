import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC-SHA256 with APP_SECRET; used to hash session tokens and server tokens at rest. */
export function hmacToken(token: string): string {
  return createHmac("sha256", env().APP_SECRET).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function key(): Buffer {
  const raw = env().ENCRYPTION_KEY;
  const buf = Buffer.from(raw, "base64");
  if (buf.length >= 32) return buf.subarray(0, 32);
  return createHash("sha256").update(raw).digest();
}

/** AES-256-GCM; output = iv.tag.ciphertext (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("bad payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8");
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env().APP_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
