import argon2 from "argon2";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, LIMITS, type RegisterInput } from "@modsmith/core";
import { hmacToken, randomToken } from "@modsmith/services";
import { grantOnce } from "@modsmith/services";
import { sendEmail } from "@modsmith/services";
import { env } from "@modsmith/services";
import { getSetting } from "@modsmith/services";
import { audit } from "@modsmith/services";
import { notify } from "@modsmith/services";

export const normalize = (s: string) => s.trim().toLowerCase();

export async function hashPassword(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(hash: string, pw: string) {
  try { return await argon2.verify(hash, pw); } catch { return false; }
}

function makeReferralCode(username: string) {
  const base = username.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  return base || randomToken(6);
}

export async function registerUser(input: RegisterInput, meta: { ip: string | null; userAgent: string | null }) {
  const emailNormalized = normalize(input.email);
  const usernameNormalized = normalize(input.username);
  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { emailNormalized }, select: { id: true } }),
    prisma.user.findUnique({ where: { usernameNormalized }, select: { id: true } }),
  ]);
  if (emailTaken) throw new ApiFailure(ErrorCodes.EMAIL_TAKEN, "An account with this email already exists", 409, { email: "Email already registered" });
  if (usernameTaken) throw new ApiFailure(ErrorCodes.USERNAME_TAKEN, "This username is taken", 409, { username: "Username already taken" });

  const passwordHash = await hashPassword(input.password);
  const signupBonus = await getSetting<number>("credits.signupBonus");
  const hubStorage = await getSetting<number>("hub.freeStorageBytes");
  const hubRetention = await getSetting<number>("hub.defaultRetentionDays");

  // Resolve referrer / partner
  let referredById: string | null = null;
  let referralId: string | null = null;
  if (input.ref) {
    const ref = await prisma.referral.findFirst({ where: { code: { equals: input.ref, mode: "insensitive" } } });
    if (ref) { referredById = ref.ownerId; referralId = ref.id; }
  }
  const partner = input.partner ? await prisma.partner.findFirst({ where: { referralCode: { equals: input.partner, mode: "insensitive" }, active: true } }) : null;

  let referralCode = makeReferralCode(input.username);
  if (await prisma.user.findUnique({ where: { referralCode } })) referralCode = `${referralCode}-${randomToken(3)}`;

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email,
        emailNormalized,
        username: input.username,
        usernameNormalized,
        passwordHash,
        referralCode,
        referredById,
        partnerRefCode: partner?.referralCode ?? null,
        creditAccount: { create: { balance: 0 } },
        storageQuota: { create: { limitBytes: BigInt(hubStorage), retentionDays: hubRetention } },
      },
    });
    await tx.referral.create({ data: { ownerId: u.id, code: referralCode } });
    await grantOnce({ userId: u.id, grantKey: `signup:${u.id}`, source: "signup", type: "SIGNUP_BONUS", amount: signupBonus, reason: "Welcome bonus" }, tx);
    if (referralId) {
      await tx.referralConversion.create({ data: { referralId, referredUserId: u.id, status: "SIGNED_UP" } });
      await tx.referral.update({ where: { id: referralId }, data: { signups: { increment: 1 } } });
    }
    if (partner) {
      await tx.partnerReferral.create({ data: { partnerId: partner.id, userId: u.id, event: "signup" } });
      if (partner.bonusCredits > 0) {
        await grantOnce({ userId: u.id, grantKey: `partner:${partner.id}:${u.id}`, source: `partner:${partner.slug}`, type: "PARTNER_BONUS", amount: partner.bonusCredits, reason: `Partner bonus (${partner.name})`, metadata: { partnerId: partner.id } }, tx);
      }
    }
    await audit({ actorId: u.id, action: "auth.register", targetType: "user", targetId: u.id, ip: meta.ip, userAgent: meta.userAgent, after: { username: u.username, ref: input.ref ?? null, partner: partner?.slug ?? null } }, tx);
    return u;
  });

  await issueVerificationEmail(user.id, user.email, user.username);
  await sendEmail(user.email, "welcome", { username: user.username, credits: signupBonus + (partner?.bonusCredits ?? 0), url: `${env().APP_URL}/app` });
  return user;
}

export async function issueVerificationEmail(userId: string, email: string, username: string) {
  const token = randomToken(32);
  await prisma.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailVerificationToken.create({ data: { userId, email, tokenHash: hmacToken(token), expiresAt: new Date(Date.now() + LIMITS.VERIFY_TOKEN_TTL_HOURS * 3600_000) } });
  await sendEmail(email, "verifyEmail", { username, url: `${env().APP_URL}/verify?token=${token}` });
  return token;
}

export async function verifyEmailToken(token: string) {
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hmacToken(token) }, include: { user: true } });
  if (!row) throw new ApiFailure(ErrorCodes.TOKEN_INVALID, "This verification link is invalid", 400);
  if (row.usedAt) {
    if (row.user.emailVerifiedAt) return { alreadyVerified: true, user: row.user };
    throw new ApiFailure(ErrorCodes.TOKEN_INVALID, "This verification link was already used", 400);
  }
  if (row.expiresAt < new Date()) throw new ApiFailure(ErrorCodes.TOKEN_EXPIRED, "This verification link has expired", 400);
  const bonus = await getSetting<number>("credits.emailVerifyBonus");
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date(), email: row.email, emailNormalized: normalize(row.email) } });
    await grantOnce({ userId: row.userId, grantKey: `email-verify:${row.userId}`, source: "email-verify", type: "EMAIL_VERIFY_BONUS", amount: bonus, reason: "Email verified bonus" }, tx);
    const conv = await tx.referralConversion.findUnique({ where: { referredUserId: row.userId } });
    if (conv && conv.status === "SIGNED_UP") await tx.referralConversion.update({ where: { id: conv.id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
    await audit({ actorId: row.userId, action: "auth.verify_email", targetType: "user", targetId: row.userId }, tx);
  });
  return { alreadyVerified: false, user: row.user };
}

export async function authenticate(identifier: string, password: string) {
  const id = normalize(identifier);
  const user = await prisma.user.findFirst({ where: id.includes("@") ? { emailNormalized: id } : { usernameNormalized: id } });
  // Always run argon2 to keep timing uniform.
  const okPw = await verifyPassword(user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);
  if (!user || !okPw) throw new ApiFailure(ErrorCodes.INVALID_CREDENTIALS, "Invalid email/username or password", 401);
  if (user.status === "SUSPENDED") throw new ApiFailure(ErrorCodes.ACCOUNT_DISABLED, "This account has been suspended. Contact support.", 403);
  if (user.status === "DELETED" || user.deletedAt) throw new ApiFailure(ErrorCodes.INVALID_CREDENTIALS, "Invalid email/username or password", 401);
  return user;
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { emailNormalized: normalize(email) } });
  if (!user || user.status !== "ACTIVE") return; // never reveal
  const token = randomToken(32);
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hmacToken(token), expiresAt: new Date(Date.now() + LIMITS.RESET_TOKEN_TTL_MINUTES * 60_000) } });
  await sendEmail(user.email, "passwordReset", { username: user.username, url: `${env().APP_URL}/reset?token=${token}` });
}

export async function resetPassword(token: string, password: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hmacToken(token) } });
  if (!row || row.usedAt) throw new ApiFailure(ErrorCodes.TOKEN_INVALID, "This reset link is invalid or was already used", 400);
  if (row.expiresAt < new Date()) throw new ApiFailure(ErrorCodes.TOKEN_EXPIRED, "This reset link has expired", 400);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: row.userId, action: "auth.password_reset", targetType: "user", targetId: row.userId }, tx);
  });
  await notify({ userId: row.userId, type: "ACCOUNT", title: "Password changed", body: "Your password was reset and all other sessions were signed out." });
  return row.userId;
}
