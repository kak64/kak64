import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@modsmith/db";
import { applyLedgerEntry, grantOnce, getBalance } from "./credits";
import { createUser, resetDb } from "./test/helpers";

describe("credit ledger (integration)", () => {
  beforeEach(resetDb);

  it("records balance before/after and never goes negative", async () => {
    const u = await createUser({ credits: 100 });
    const { transaction } = await applyLedgerEntry({ userId: u.id, type: "EXPORT", amount: -40, reason: "test" });
    expect(transaction.balanceBefore).toBe(100);
    expect(transaction.balanceAfter).toBe(60);
    await expect(applyLedgerEntry({ userId: u.id, type: "EXPORT", amount: -61, reason: "too much" })).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await getBalance(u.id)).toBe(60);
  });

  it("is idempotent per idempotency key", async () => {
    const u = await createUser({ credits: 0 });
    const a = await applyLedgerEntry({ userId: u.id, type: "PURCHASE", amount: 500, reason: "buy", idempotencyKey: "purchase:1" });
    const b = await applyLedgerEntry({ userId: u.id, type: "PURCHASE", amount: 500, reason: "buy", idempotencyKey: "purchase:1" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(await getBalance(u.id)).toBe(500);
  });

  it("serializes concurrent debits so the balance cannot be overspent", async () => {
    const u = await createUser({ credits: 100 });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => applyLedgerEntry({ userId: u.id, type: "EXPORT", amount: -30, reason: `race ${i}` })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    expect(await getBalance(u.id)).toBe(10);
    const txs = await prisma.creditTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
    for (let i = 1; i < txs.length; i++) expect(txs[i]!.balanceBefore).toBe(txs[i - 1]!.balanceAfter);
  });

  it("grants a promotional bonus only once", async () => {
    const u = await createUser({ credits: 0 });
    const first = await grantOnce({ userId: u.id, grantKey: `signup:${u.id}`, source: "signup", type: "SIGNUP_BONUS", amount: 150, reason: "welcome" });
    const second = await grantOnce({ userId: u.id, grantKey: `signup:${u.id}`, source: "signup", type: "SIGNUP_BONUS", amount: 150, reason: "welcome" });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await getBalance(u.id)).toBe(150);
  });
});
