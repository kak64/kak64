"use client";
/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { MessageCircle, Unlink } from "lucide-react";
import { CREDITS } from "@modsmith/core";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiAction } from "../hooks";

export interface DiscordInfo { username: string; globalName: string | null; avatarUrl: string; connectedAt: string }

export function DiscordCard({ discord, configured }: { discord: DiscordInfo | null; configured: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { run, isBusy } = useApiAction();
  const disconnect = async () => {
    const r = await run("disconnect", () => api("/api/v1/auth/discord/disconnect", { method: "POST" }), { success: "Discord disconnected", refresh: true });
    if (r !== undefined) setOpen(false);
  };

  if (!discord) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">Get <strong className="text-fg">{CREDITS.DISCORD_BONUS} bonus credits</strong> and job notifications straight to your DMs.</p>
        {!configured ? <Alert variant="info">Discord linking is not configured in this environment.</Alert> : null}
        <Button asChild disabled={!configured}><a href="/api/v1/auth/discord"><MessageCircle /> Connect Discord</a></Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <img src={discord.avatarUrl} alt="" className="h-10 w-10 rounded-full border border-border" />
        <div className="min-w-0"><div className="truncate font-medium">{discord.globalName ?? discord.username}</div><div className="truncate text-xs text-fg-muted">@{discord.username} · connected {formatDate(discord.connectedAt)}</div></div>
      </div>
      <p className="text-sm text-fg-muted">Job completion and referral notifications are delivered to your Discord DMs. You can turn them off in <a href="/app/settings" className="text-accent hover:underline">Settings → Notifications</a>.</p>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Unlink /> Disconnect</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Disconnect Discord?</DialogTitle><DialogDescription>You'll stop receiving Discord notifications. Bonus credits you already received are kept, but they are not granted again if you reconnect.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" loading={isBusy("disconnect")} onClick={disconnect}>Disconnect</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
