import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { hmacToken } from "@modsmith/services";
import { authenticate, registerUser, requestPasswordReset, resetPassword, verifyEmailToken, issueVerificationEmail } from "./auth";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }));

async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const meta = { ip: "127.0.0.1", userAgent: "vitest" };

describe("authentication (integration)", () => {
  beforeEach(resetDb);

  it("registers, grants the signup bonus once, creates referral + ledger", async () => {
    const u = await registerUser({ email: "Alice@Example.com", username: "alice", password: "password123", acceptTerms: true }, meta);
    expect(u.emailNormalized).toBe("alice@example.com");
    const acc = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: u.id } });
    expect(acc.balance).toBe(150);
    expect(await prisma.referral.findUnique({ where: { ownerId: u.id } })).not.toBeNull();
    expect(await prisma.emailVerificationToken.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { to: "Alice@Example.com" } })).toBe(2); // verify + welcome
  });

  it("rejects duplicate email and username (case-insensitive)", async () => {
    await registerUser({ email: "bob@example.com", username: "Bob", password: "password123", acceptTerms: true }, meta);
    await expect(registerUser({ email: "BOB@example.com", username: "other", password: "password123", acceptTerms: true }, meta)).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    await expect(registerUser({ email: "x@example.com", username: "bob", password: "password123", acceptTerms: true }, meta)).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("logs in with email or username, rejects wrong passwords and suspended accounts", async () => {
    const u = await registerUser({ email: "carol@example.com", username: "carol", password: "password123", acceptTerms: true }, meta);
    expect((await authenticate("carol", "password123")).id).toBe(u.id);
    expect((await authenticate("CAROL@example.com", "password123")).id).toBe(u.id);
    await expect(authenticate("carol", "wrong")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(authenticate("nobody", "password123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await prisma.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    await expect(authenticate("carol", "password123")).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });

  it("verifies email once, grants the verification bonus once, rejects reuse/expired", async () => {
    const u = await registerUser({ email: "dan@example.com", username: "dan", password: "password123", acceptTerms: true }, meta);
    const token = await issueVerificationEmail(u.id, u.email, u.username);
    await expect(verifyEmailToken("nope")).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    const res = await verifyEmailToken(token);
    expect(res.alreadyVerified).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerifiedAt).not.toBeNull();
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(200);
    const again = await verifyEmailToken(token);
    expect(again.alreadyVerified).toBe(true);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(200);
    const t2 = await issueVerificationEmail(u.id, u.email, u.username);
    await prisma.emailVerificationToken.update({ where: { tokenHash: hmacToken(t2) }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(verifyEmailToken(t2)).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("password reset: silent for unknown emails, single-use token, revokes sessions", async () => {
    const u = await registerUser({ email: "eve@example.com", username: "eve", password: "password123", acceptTerms: true }, meta);
    await prisma.session.create({ data: { userId: u.id, tokenHash: "s1", expiresAt: new Date(Date.now() + 3600_000) } });
    await requestPasswordReset("unknown@example.com");
    expect(await prisma.passwordResetToken.count()).toBe(0);
    await requestPasswordReset("eve@example.com");
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    const email = await prisma.emailOutbox.findFirstOrThrow({ where: { template: "passwordReset" } });
    expect(email.to).toBe("eve@example.com");
    // Recover the raw token from the console-provider outbox is not possible (hashed); simulate by creating one
    const raw = "raw-token-for-test-1234567890";
    await prisma.passwordResetToken.update({ where: { id: row.id }, data: { tokenHash: hmacToken(raw) } });
    await resetPassword(raw, "newpassword456");
    expect((await authenticate("eve", "newpassword456")).id).toBe(u.id);
    await expect(authenticate("eve", "password123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect((await prisma.session.findFirstOrThrow({ where: { userId: u.id } })).revokedAt).not.toBeNull();
    await expect(resetPassword(raw, "another789")).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("applies partner bonus and records the referral conversion", async () => {
    const ref = await registerUser({ email: "owner@example.com", username: "owner", password: "password123", acceptTerms: true }, meta);
    await prisma.partner.create({ data: { slug: "p", name: "Partner", description: "d", category: "c", referralCode: "PARTNER", bonusCredits: 100 } });
    const u = await registerUser({ email: "new@example.com", username: "newbie", password: "password123", acceptTerms: true, ref: ref.referralCode, partner: "partner" }, meta);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(250);
    const conv = await prisma.referralConversion.findUniqueOrThrow({ where: { referredUserId: u.id } });
    expect(conv.status).toBe("SIGNED_UP");
    expect((await prisma.referral.findUniqueOrThrow({ where: { ownerId: ref.id } })).signups).toBe(1);
  });
});
