"use client";
import * as React from "react";
import { BadgeCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

type Role = "USER" | "MODERATOR" | "ADMIN";

/** ADMIN-only account controls: suspend/unsuspend, role, email verification. */
export function UserAdminActions({ userId, status, role, verified, isSelf }: { userId: string; status: string; role: Role; verified: boolean; isSelf: boolean }) {
  const { run, isBusy } = useAdminAction();
  const [confirm, setConfirm] = React.useState<null | "suspend" | "unsuspend" | "role" | "verify" | "unverify">(null);
  const [nextRole, setNextRole] = React.useState<Role>(role);

  const patch = (json: Record<string, unknown>, success: string) =>
    run("user", () => api(`/api/v1/admin/users/${userId}`, { method: "PATCH", json }), { success });

  const suspended = status === "SUSPENDED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={suspended ? "secondary" : "destructive"} loading={isBusy("user")} disabled={isSelf && !suspended} onClick={() => setConfirm(suspended ? "unsuspend" : "suspend")}>
        {suspended ? <ShieldCheck /> : <ShieldAlert />}{suspended ? "Unsuspend" : "Suspend"}
      </Button>
      {!verified ? (
        <Button size="sm" variant="outline" loading={isBusy("user")} onClick={() => setConfirm("verify")}><BadgeCheck />Mark verified</Button>
      ) : (
        <Button size="sm" variant="ghost" loading={isBusy("user")} onClick={() => setConfirm("unverify")}>Clear verification</Button>
      )}
      <label className="flex items-center gap-2 text-xs text-fg-subtle">
        Role
        <NativeSelect className="h-8 w-auto text-xs" value={role} disabled={isSelf} aria-label="Change role"
          onChange={(e) => { setNextRole(e.target.value as Role); setConfirm("role"); }}>
          <option value="USER">User</option>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
        </NativeSelect>
      </label>

      <ConfirmDialog open={confirm === "suspend"} onOpenChange={() => setConfirm(null)} destructive title="Suspend this account?"
        description="The user is signed out of every session immediately and cannot sign back in until unsuspended."
        confirmLabel="Suspend" loading={isBusy("user")}
        onConfirm={async () => { await patch({ status: "SUSPENDED" }, "Account suspended"); setConfirm(null); }} />
      <ConfirmDialog open={confirm === "unsuspend"} onOpenChange={() => setConfirm(null)} title="Restore this account?"
        description="The user will be able to sign in again." confirmLabel="Unsuspend" loading={isBusy("user")}
        onConfirm={async () => { await patch({ status: "ACTIVE" }, "Account restored"); setConfirm(null); }} />
      <ConfirmDialog open={confirm === "verify"} onOpenChange={() => setConfirm(null)} title="Mark email as verified?"
        description="Skips the email verification flow for this account." confirmLabel="Mark verified" loading={isBusy("user")}
        onConfirm={async () => { await patch({ emailVerified: true }, "Email marked verified"); setConfirm(null); }} />
      <ConfirmDialog open={confirm === "unverify"} onOpenChange={() => setConfirm(null)} destructive title="Clear email verification?"
        description="The account will be treated as unverified and gated features will lock again." confirmLabel="Clear" loading={isBusy("user")}
        onConfirm={async () => { await patch({ emailVerified: false }, "Verification cleared"); setConfirm(null); }} />
      <ConfirmDialog open={confirm === "role"} onOpenChange={(o) => { if (!o) setConfirm(null); }} destructive={nextRole === "ADMIN"} title={`Change role to ${nextRole.toLowerCase()}?`}
        description={nextRole === "ADMIN" ? "Admins get full access to this panel, billing and system settings." : "This changes what the account can reach in the admin area."}
        confirmLabel="Change role" loading={isBusy("user")}
        onConfirm={async () => { await patch({ role: nextRole }, `Role set to ${nextRole.toLowerCase()}`); setConfirm(null); }} />
    </div>
  );
}
