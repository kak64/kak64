"use client";
import * as React from "react";
import { Coins, Search } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatCredits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useAdminAction } from "./use-admin-action";

type FoundUser = { id: string; username: string; email: string; creditAccount: { balance: number } | null };

/** Manual credit grant / revoke. With `user` fixed it skips the search step. */
export function CreditAdjustDialog({ user, trigger }: { user?: { id: string; username: string; balance?: number }; trigger?: React.ReactNode }) {
  const { run, isBusy } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<FoundUser[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [picked, setPicked] = React.useState<{ id: string; username: string; balance?: number } | null>(user ?? null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setPicked(user ?? null); setAmount(""); setReason(""); setError(null); setResults(null); setQuery(""); } }, [open, user]);

  const amountNumber = Number(amount);
  const valid = Number.isInteger(amountNumber) && amountNumber !== 0 && reason.trim().length >= 3 && !!picked;

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api<{ users: FoundUser[] }>(`/api/v1/admin/users?q=${encodeURIComponent(query.trim())}&pageSize=10`);
      setResults(res.users);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!valid || !picked) return;
    setError(null);
    const res = await run("adjust", () => api("/api/v1/admin/credits/adjust", { json: { userId: picked.id, amount: amountNumber, reason: reason.trim() } }), {
      success: `${amountNumber > 0 ? "Granted" : "Revoked"} ${formatCredits(Math.abs(amountNumber))} credits`,
    });
    if (res !== undefined) setOpen(false);
  };

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ?? <Button size="sm" variant="outline"><Coins />Adjust credits</Button>}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Adjust credits</DialogTitle>
            <DialogDescription>Writes an audited ADMIN_ADJUSTMENT ledger entry. Negative amounts revoke credits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {!user ? (
              <Field label="User" hint="Search by username or email.">
                <div className="flex gap-2">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="username or email" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />
                  <Button type="button" variant="secondary" loading={searching} onClick={() => void search()}><Search />Find</Button>
                </div>
              </Field>
            ) : null}
            {!user && results ? (
              results.length === 0 ? <p className="text-xs text-fg-subtle">No users matched.</p> : (
                <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setPicked({ id: r.id, username: r.username, balance: r.creditAccount?.balance })}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-bg-subtle ${picked?.id === r.id ? "bg-accent-soft text-accent" : ""}`}>
                        <span className="min-w-0"><span className="font-medium">{r.username}</span><span className="block truncate text-xs text-fg-subtle">{r.email}</span></span>
                        <span className="shrink-0 tabular-nums text-xs text-fg-muted">{formatCredits(r.creditAccount?.balance)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            {picked ? (
              <p className="text-xs text-fg-muted">Target: <span className="font-medium text-fg">{picked.username}</span>{picked.balance !== undefined ? ` · balance ${formatCredits(picked.balance)}` : ""}</p>
            ) : null}
            <Field label="Amount" htmlFor="credit-amount" hint="Whole number. Use a negative value to revoke.">
              <Input id="credit-amount" type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250 or -100" />
            </Field>
            <Field label="Reason" htmlFor="credit-reason" hint="Shown in the ledger and the audit trail (3–300 characters).">
              <Textarea id="credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Goodwill credit for failed export" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!valid} loading={isBusy("adjust")} onClick={() => void submit()}>
              {amountNumber < 0 ? "Revoke credits" : "Grant credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
