import { prisma, type CreditTransactionType, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";

export type LedgerEntryInput = {
  userId: string;
  type: CreditTransactionType;
  amount: number; // positive = credit, negative = debit
  reason: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
};

/**
 * Applies a ledger entry atomically. Locks the account row (SELECT ... FOR UPDATE) so concurrent
 * debits can never push the balance below zero. Returns the created transaction, or the existing one
 * if the idempotency key was already used.
 */
export async function applyLedgerEntry(input: LedgerEntryInput, tx?: Prisma.TransactionClient) {
  const run = async (db: Prisma.TransactionClient) => {
    if (input.idempotencyKey) {
      const existing = await db.creditTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { transaction: existing, duplicate: true as const };
    }
    const rows = await db.$queryRaw<{ id: string; balance: number }[]>`SELECT id, balance FROM "CreditAccount" WHERE "userId" = ${input.userId} FOR UPDATE`;
    let account = rows[0];
    if (!account) {
      const created = await db.creditAccount.create({ data: { userId: input.userId, balance: 0 } });
      account = { id: created.id, balance: 0 };
    }
    const before = account.balance;
    const after = before + input.amount;
    if (after < 0) throw new ApiFailure(ErrorCodes.INSUFFICIENT_CREDITS, `Not enough credits: need ${-input.amount}, have ${before}`, 402, { needed: -input.amount, balance: before });
    await db.creditAccount.update({
      where: { id: account.id },
      data: {
        balance: after,
        version: { increment: 1 },
        ...(input.amount > 0 ? { lifetimeEarned: { increment: input.amount } } : { lifetimeSpent: { increment: -input.amount } }),
      },
    });
    const transaction = await db.creditTransaction.create({
      data: {
        accountId: account.id,
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        balanceBefore: before,
        balanceAfter: after,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        createdById: input.createdById ?? null,
      },
    });
    return { transaction, duplicate: false as const };
  };
  if (tx) return run(tx);
  return prisma.$transaction(run, { isolationLevel: "ReadCommitted" });
}

/** Promotional grant that can only ever be applied once per grantKey. */
export async function grantOnce(opts: { userId: string; grantKey: string; source: string; type: CreditTransactionType; amount: number; reason: string; metadata?: Prisma.InputJsonValue }, tx?: Prisma.TransactionClient) {
  const run = async (db: Prisma.TransactionClient) => {
    const exists = await db.creditGrant.findUnique({ where: { grantKey: opts.grantKey } });
    if (exists) return null;
    if (opts.amount <= 0) return null;
    const { transaction } = await applyLedgerEntry({ userId: opts.userId, type: opts.type, amount: opts.amount, reason: opts.reason, referenceType: "grant", referenceId: opts.grantKey, idempotencyKey: `grant:${opts.grantKey}`, metadata: opts.metadata }, db);
    await db.creditGrant.create({ data: { transactionId: transaction.id, grantKey: opts.grantKey, source: opts.source } });
    return transaction;
  };
  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function getBalance(userId: string): Promise<number> {
  const acc = await prisma.creditAccount.findUnique({ where: { userId }, select: { balance: true } });
  return acc?.balance ?? 0;
}
