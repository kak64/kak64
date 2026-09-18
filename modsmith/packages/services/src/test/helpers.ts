import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { randomToken } from "../crypto";

export async function resetDb() {
  // Order matters for FKs; use TRUNCATE ... CASCADE on all app tables.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  for (const [i, t] of TOOLS.entries()) {
    await prisma.toolConfig.create({ data: { slug: t.slug, name: t.name, category: t.category, description: t.description, creditCost: t.creditCost, status: t.status, requiresAuth: t.requiresAuth, requiresSubscription: t.requiresSubscription, requiresVerification: t.requiresVerification, freeDailyExports: t.freeDailyExports ?? 0, sortOrder: i } });
  }
}

export async function createUser(opts: { credits?: number; verified?: boolean; username?: string } = {}) {
  const username = opts.username ?? `u_${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const user = await prisma.user.create({ data: { email: `${username}@test.local`, emailNormalized: `${username}@test.local`, username, usernameNormalized: username.toLowerCase(), passwordHash: "!", referralCode: username, emailVerifiedAt: opts.verified === false ? null : new Date(), creditAccount: { create: { balance: opts.credits ?? 0 } } } });
  await prisma.referral.create({ data: { ownerId: user.id, code: username } });
  return user;
}

export async function createUpload(userId: string, toolSlug = "prop-creator", name = "model.glb") {
  return prisma.assetUpload.create({ data: { userId, toolSlug, originalName: name, storageKey: `uploads/${userId}/${randomToken(6)}/${name}`, sizeBytes: BigInt(1000), status: "UPLOADED", sha256: randomToken(32), expiresAt: new Date(Date.now() + 3600_000) } });
}
