import { prisma, type Prisma } from "@modsmith/db";
import { hashIp } from "./crypto";

export async function audit(entry: {
  actorId?: string | null;
  actorType?: "user" | "admin" | "system" | "server-token";
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorType: entry.actorType ?? "user",
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
      ipHash: hashIp(entry.ip),
      userAgent: entry.userAgent?.slice(0, 255) ?? null,
    },
  });
}
