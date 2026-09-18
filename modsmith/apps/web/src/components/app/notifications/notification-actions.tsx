"use client";
import { CheckCheck, Check } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { refreshMe } from "@/hooks/use-me";
import { useApiAction } from "../hooks";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const { run, isBusy } = useApiAction();
  return <Button variant="outline" size="sm" disabled={disabled} loading={isBusy("all")} onClick={() => run("all", async () => { await api("/api/v1/notifications/read", { json: { all: true } }); await refreshMe().catch(() => {}); }, { success: "All notifications marked read", refresh: true })}><CheckCheck /> Mark all read</Button>;
}

export function MarkReadButton({ id }: { id: string }) {
  const { run, isBusy } = useApiAction();
  return <Button variant="ghost" size="sm" loading={isBusy(id)} aria-label="Mark as read" onClick={() => run(id, async () => { await api("/api/v1/notifications/read", { json: { ids: [id] } }); await refreshMe().catch(() => {}); }, { refresh: true })}><Check /> Mark read</Button>;
}
