import type { CreditTransactionType } from "@modsmith/db";

/**
 * Credit transaction types offered in the ledger filter.
 *
 * This lives in a plain module rather than the client component beside it: Next.js replaces every
 * export of a `"use client"` module with a client reference, so a server component importing the
 * array from there would receive a proxy instead of the values.
 */
export const LEDGER_TYPES = [
  "SIGNUP_BONUS",
  "EMAIL_VERIFY_BONUS",
  "DISCORD_BONUS",
  "REFERRAL_REWARD",
  "PARTNER_BONUS",
  "PURCHASE",
  "EXPORT",
  "FAILED_JOB_REFUND",
  "PROMOTIONAL_GRANT",
  "SUBSCRIPTION_ALLOCATION",
  "ADMIN_ADJUSTMENT",
  "REFUND",
] as const satisfies readonly CreditTransactionType[];

export type LedgerType = (typeof LEDGER_TYPES)[number];

export function isLedgerType(value: string | undefined): value is LedgerType {
  return !!value && (LEDGER_TYPES as readonly string[]).includes(value);
}
