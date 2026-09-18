import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, deleteAccountSchema, updateProfileSchema } from "@modsmith/core";
import { audit, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { issueVerificationEmail, normalize, verifyPassword } from "@/server/auth";
import { destroySession } from "@/server/session";

export const PATCH = apiRoute({ auth: "required", body: updateProfileSchema }, async ({ user, body, ip, userAgent }) => {
  const data: Record<string, unknown> = {};
  if (body.username && body.username !== user!.username) {
    const taken = await prisma.user.findUnique({ where: { usernameNormalized: normalize(body.username) } });
    if (taken && taken.id !== user!.id) throw new ApiFailure(ErrorCodes.USERNAME_TAKEN, "This username is taken", 409, { username: "Username already taken" });
    data.username = body.username;
    data.usernameNormalized = normalize(body.username);
  }
  let emailChanged = false;
  if (body.email && normalize(body.email) !== normalize(user!.email)) {
    const taken = await prisma.user.findUnique({ where: { emailNormalized: normalize(body.email) } });
    if (taken) throw new ApiFailure(ErrorCodes.EMAIL_TAKEN, "An account with this email already exists", 409, { email: "Email already registered" });
    emailChanged = true; // the new email takes effect once verified
  }
  if (body.bio !== undefined) data.bio = body.bio;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  const updated = await prisma.user.update({ where: { id: user!.id }, data });
  if (emailChanged) await issueVerificationEmail(user!.id, body.email!, updated.username);
  await audit({ actorId: user!.id, action: "user.profile.update", targetType: "user", targetId: user!.id, after: { ...data, pendingEmail: emailChanged ? body.email : undefined }, ip, userAgent });
  return json({ username: updated.username, email: updated.email, bio: updated.bio, avatarUrl: updated.avatarUrl, pendingEmail: emailChanged ? body.email : null });
});

/**
 * Account deletion: revokes sessions, cancels subscriptions, deletes private media and server tokens,
 * anonymizes the user record. Billing/audit records are retained as required.
 */
export const DELETE = apiRoute({ auth: "required", body: deleteAccountSchema }, async ({ user, body, ip, userAgent }) => {
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user!.id } });
  if (!(await verifyPassword(full.passwordHash, body.password))) throw new ApiFailure(ErrorCodes.INVALID_CREDENTIALS, "Incorrect password", 401, { password: "Incorrect password" });

  // Cancel Stripe subscriptions (best effort; webhook will sync)
  const subs = await prisma.subscription.findMany({ where: { userId: full.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, stripeSubscriptionId: { not: null } } });
  if (subs.length) {
    const { stripe, stripeConfigured } = await import("@modsmith/services");
    if (stripeConfigured()) for (const s of subs) { try { await stripe().subscriptions.cancel(s.stripeSubscriptionId!); } catch { /* ignore */ } }
  }
  // Delete private objects
  const [uploads, media, creations] = await Promise.all([
    prisma.assetUpload.findMany({ where: { userId: full.id, deletedAt: null }, select: { storageKey: true } }),
    prisma.serverHubMedia.findMany({ where: { project: { userId: full.id }, deletedAt: null }, select: { storageKey: true } }),
    prisma.creationVersion.findMany({ where: { creation: { userId: full.id } }, select: { resourceKey: true } }),
  ]);
  for (const k of [...uploads, ...media].map((x) => x.storageKey).concat(creations.map((c) => c.resourceKey))) { try { await storage().deleteObject(k); } catch { /* ignore */ } }

  const anonEmail = `deleted-${full.id}@deleted.invalid`;
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({ where: { userId: full.id }, data: { revokedAt: new Date() } });
    await tx.serverHubToken.updateMany({ where: { project: { userId: full.id } }, data: { revokedAt: new Date() } });
    await tx.serverHubProject.updateMany({ where: { userId: full.id }, data: { deletedAt: new Date() } });
    await tx.serverHubLog.deleteMany({ where: { project: { userId: full.id } } });
    await tx.serverHubMedia.deleteMany({ where: { project: { userId: full.id } } });
    await tx.assetUpload.deleteMany({ where: { userId: full.id } });
    await tx.showcaseItem.deleteMany({ where: { userId: full.id } });
    await tx.creation.updateMany({ where: { userId: full.id }, data: { deletedAt: new Date(), status: "ARCHIVED", isPublic: false } });
    await tx.discordConnection.deleteMany({ where: { userId: full.id } });
    await tx.notification.deleteMany({ where: { userId: full.id } });
    await tx.subscription.updateMany({ where: { userId: full.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "INCOMPLETE"] } }, data: { status: "CANCELED", endedAt: new Date() } });
    await tx.user.update({ where: { id: full.id }, data: { status: "DELETED", deletedAt: new Date(), email: anonEmail, emailNormalized: anonEmail, username: `deleted_${full.id.slice(-8)}`, usernameNormalized: `deleted_${full.id.slice(-8)}`, avatarUrl: null, bio: null, passwordHash: "!", profilePublic: false } });
    await audit({ actorId: full.id, action: "user.delete", targetType: "user", targetId: full.id, ip, userAgent }, tx);
  });
  await destroySession();
  return json({ ok: true });
});
