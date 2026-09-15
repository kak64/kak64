"use client";
import * as React from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { copyText } from "../hooks";
import { CopyButton } from "../hub/copy-button";

export function ShareReferral({ url, reward }: { url: string; reward: number }) {
  const { toast } = useToast();
  const discordText = `I build FiveM assets in the browser with Modsmith — props, vehicles, liveries, clothing and more, no Blender or OpenIV needed. Sign up with my link and we both get credits: ${url}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={url} aria-label="Your referral link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton value={url} label="Copy link" toastTitle="Referral link copied" className="shrink-0" variant="default" size="default" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={async () => { const ok = await copyText(discordText); toast(ok ? { title: "Discord message copied", description: "Paste it in any channel or DM.", variant: "success" } : { title: "Could not copy", variant: "danger" }); }}><MessageCircle /> Copy Discord message</Button>
        {typeof navigator !== "undefined" && "share" in navigator ? <Button variant="ghost" size="sm" onClick={() => navigator.share?.({ title: "Modsmith", text: discordText, url }).catch(() => {})}>Share…</Button> : null}
      </div>
      <p className="text-xs text-fg-subtle">You earn {reward} credits once a referred creator completes their first successful build.</p>
    </div>
  );
}
