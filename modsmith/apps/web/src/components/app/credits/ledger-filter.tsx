"use client";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const LEDGER_TYPES = ["SIGNUP_BONUS", "EMAIL_VERIFY_BONUS", "DISCORD_BONUS", "REFERRAL_REWARD", "PARTNER_BONUS", "PURCHASE", "EXPORT", "FAILED_JOB_REFUND", "PROMOTIONAL_GRANT", "SUBSCRIPTION_ALLOCATION", "ADMIN_ADJUSTMENT", "REFUND"] as const;

export function LedgerFilter({ type }: { type: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-2">
      <NativeSelect aria-label="Filter transactions by type" value={type} onChange={(e) => router.push(e.target.value ? `${pathname}?type=${e.target.value}` : pathname)} className="w-56">
        <option value="">All transaction types</option>
        {LEDGER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
      </NativeSelect>
      {type ? <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>Clear</Button> : null}
    </div>
  );
}
