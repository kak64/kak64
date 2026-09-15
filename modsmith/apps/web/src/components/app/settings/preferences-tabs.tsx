"use client";
import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "../hooks";

export interface NotificationPrefs { notifyEmail: boolean; notifyDiscord: boolean; notifyJobComplete: boolean; notifyMarketing: boolean }
export interface PrivacyPrefs { profilePublic: boolean; showcaseDefaultPublic: boolean }

function ToggleRow({ id, label, description, value, onToggle, saving }: { id: string; label: string; description: string; value: boolean; onToggle: (v: boolean) => void; saving: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0"><Label htmlFor={id} className="cursor-pointer">{label}</Label><p className="mt-0.5 text-sm text-fg-muted">{description}</p></div>
      <div className="flex shrink-0 items-center gap-2">{saving ? <Spinner className="h-3.5 w-3.5" /> : null}<Switch id={id} checked={value} onCheckedChange={onToggle} /></div>
    </div>
  );
}

/** Optimistic switch group that PATCHes a single field per toggle and rolls back on failure. */
function useOptimistic<T extends object>(initial: T, path: string) {
  const { toast } = useToast();
  const [state, setState] = React.useState<T>(initial);
  const [saving, setSaving] = React.useState<string | null>(null);
  const set = async (key: keyof T & string, value: boolean) => {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: value }));
    setSaving(String(key));
    try { await api(path, { method: "PATCH", json: { [key]: value } }); }
    catch (err) { setState((s) => ({ ...s, [key]: prev })); toast({ title: "Could not save", description: errorMessage(err), variant: "danger" }); }
    finally { setSaving(null); }
  };
  return { state, saving, set };
}

export function NotificationsTab({ initial, discordConnected }: { initial: NotificationPrefs; discordConnected: boolean }) {
  const { state, saving, set } = useOptimistic(initial, "/api/v1/users/me/notifications");
  return (
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>Changes are saved as you toggle them.</CardDescription></CardHeader>
      <CardContent>
        <ToggleRow id="n-email" label="Email notifications" description="Account, billing and important product emails." value={state.notifyEmail} saving={saving === "notifyEmail"} onToggle={(v) => set("notifyEmail", v)} />
        <ToggleRow id="n-discord" label="Discord notifications" description={discordConnected ? "Direct messages from the Modsmith bot." : "Connect Discord on your profile to enable this."} value={state.notifyDiscord} saving={saving === "notifyDiscord"} onToggle={(v) => set("notifyDiscord", v)} />
        <ToggleRow id="n-job" label="Job completion alerts" description="Tell me when a build finishes or fails." value={state.notifyJobComplete} saving={saving === "notifyJobComplete"} onToggle={(v) => set("notifyJobComplete", v)} />
        <ToggleRow id="n-marketing" label="Product updates" description="New tools, features and occasional offers. No spam." value={state.notifyMarketing} saving={saving === "notifyMarketing"} onToggle={(v) => set("notifyMarketing", v)} />
        {!discordConnected ? <p className="mt-3 text-sm text-fg-muted"><Link href="/app/profile" className="text-accent hover:underline">Connect Discord</Link> to receive build notifications in your DMs.</p> : null}
      </CardContent>
    </Card>
  );
}

export function PrivacyTab({ initial }: { initial: PrivacyPrefs }) {
  const { state, saving, set } = useOptimistic(initial, "/api/v1/users/me/privacy");
  return (
    <Card>
      <CardHeader><CardTitle>Privacy</CardTitle><CardDescription>Control what other people can see.</CardDescription></CardHeader>
      <CardContent>
        <ToggleRow id="p-public" label="Public profile" description="Let anyone view your profile page and published creations." value={state.profilePublic} saving={saving === "profilePublic"} onToggle={(v) => set("profilePublic", v)} />
        <ToggleRow id="p-showcase" label="Publish new creations by default" description="Pre-select the showcase option when you publish a creation." value={state.showcaseDefaultPublic} saving={saving === "showcaseDefaultPublic"} onToggle={(v) => set("showcaseDefaultPublic", v)} />
        <p className="mt-3 text-sm text-fg-muted">Your uploads, exports and Server Hub data are always private. Only creations you explicitly publish appear in the showcase.</p>
      </CardContent>
    </Card>
  );
}
