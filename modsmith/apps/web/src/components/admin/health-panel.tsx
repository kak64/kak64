"use client";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap } from "./table";
import { adminErrorMessage } from "./use-admin-action";

type Check = { ok: boolean; ms: number; detail?: string };
type Worker = { id: string; at?: number; stale: boolean; queues?: string[]; version?: string; pid?: number; host?: string };
type QueueCounts = { waiting: number; active: number; delayed: number; failed: number; completed: number };
export type HealthPayload = {
  database: Check;
  redis: Check;
  storage: Check & { provider?: string };
  workers: { ok: boolean; list: Worker[] };
  queues: Record<string, QueueCounts>;
  stripe: { configured: boolean; webhookFailures24h: number };
  discord: { configured: boolean; bot: boolean };
  email: { provider: string; failures24h: number };
  ai: { provider: string; configured: boolean };
  version: string;
};

function Dot({ ok, className }: { ok: boolean; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", ok ? "bg-success" : "bg-danger", className)} aria-hidden />;
}

function StatusCard({ title, ok, lines }: { title: string; ok: boolean; lines: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className={cn("rounded-lg border bg-bg-elevated p-4", ok ? "border-border" : "border-danger/40")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="flex items-center gap-1.5 text-xs font-medium" role="status">
          <Dot ok={ok} />
          <span className={ok ? "text-success" : "text-danger"}>{ok ? "Healthy" : "Problem"}</span>
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-fg-subtle">{l.label}</dt>
            <dd className="min-w-0 truncate text-right text-fg-muted">{l.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Live system health with a 30s auto-refresh. */
export function HealthPanel() {
  const [data, setData] = React.useState<HealthPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<HealthPayload>("/api/v1/admin/health");
      setData(res);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4">
        {error ? <Alert variant="danger" title="Could not load health">{error}</Alert> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const queueRows = Object.entries(data.queues ?? {});
  return (
    <div className="space-y-4">
      {error ? <Alert variant="warning" title="Refresh failed">{error} — showing the last successful snapshot.</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">version {data.version}</Badge>
        <span className="text-xs text-fg-subtle" aria-live="polite">{updatedAt ? `Updated ${timeAgo(updatedAt)} · auto-refresh every 30s` : "Auto-refresh every 30s"}</span>
        <Button variant="outline" size="sm" className="ml-auto" loading={loading} onClick={() => void load()}><RefreshCw />Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatusCard title="Database" ok={data.database.ok} lines={[{ label: "Latency", value: `${data.database.ms}ms` }, ...(data.database.detail ? [{ label: "Detail", value: data.database.detail }] : [])]} />
        <StatusCard title="Redis" ok={data.redis.ok} lines={[{ label: "Latency", value: `${data.redis.ms}ms` }, ...(data.redis.detail ? [{ label: "Detail", value: data.redis.detail }] : [])]} />
        <StatusCard title="Storage" ok={data.storage.ok} lines={[{ label: "Provider", value: data.storage.provider ?? "—" }, { label: "Latency", value: `${data.storage.ms}ms` }, ...(data.storage.detail ? [{ label: "Detail", value: data.storage.detail }] : [])]} />
        <StatusCard title="Stripe" ok={data.stripe.configured && data.stripe.webhookFailures24h === 0} lines={[{ label: "Configured", value: data.stripe.configured ? "yes" : "no" }, { label: "Webhook failures 24h", value: data.stripe.webhookFailures24h }]} />
        <StatusCard title="Discord" ok={data.discord.configured} lines={[{ label: "OAuth", value: data.discord.configured ? "configured" : "missing" }, { label: "Bot token", value: data.discord.bot ? "present" : "missing" }]} />
        <StatusCard title="Email" ok={data.email.failures24h === 0} lines={[{ label: "Provider", value: data.email.provider }, { label: "Failures 24h", value: data.email.failures24h }]} />
        <StatusCard title="AI provider" ok={data.ai.configured} lines={[{ label: "Provider", value: data.ai.provider }, { label: "Configured", value: data.ai.configured ? "yes" : "no" }]} />
        <StatusCard title="Workers" ok={data.workers.ok} lines={[{ label: "Online", value: `${data.workers.list.filter((w) => !w.stale).length} of ${data.workers.list.length}` }]} />
      </div>

      <TableWrap>
        <Table minWidth={620}>
          <THead><Tr><Th>Worker</Th><Th>Queues</Th><Th>Last heartbeat</Th><Th>State</Th></Tr></THead>
          <TBody>
            {data.workers.list.length === 0 ? <TableEmpty colSpan={4}>No workers have reported a heartbeat.</TableEmpty> : data.workers.list.map((w) => (
              <Tr key={w.id}>
                <Td className="font-mono text-xs">{w.id}</Td>
                <Td className="text-fg-muted">{w.queues?.join(", ") || "—"}</Td>
                <Td className="text-fg-muted">{w.at ? timeAgo(new Date(w.at)) : "—"}</Td>
                <Td><span className="flex items-center gap-1.5"><Dot ok={!w.stale} /><span className={w.stale ? "text-danger" : "text-success"}>{w.stale ? "stale" : "alive"}</span></span></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      <TableWrap>
        <Table minWidth={560}>
          <THead><Tr><Th>Queue</Th><Th className="text-right">Waiting</Th><Th className="text-right">Active</Th><Th className="text-right">Delayed</Th><Th className="text-right">Failed</Th><Th className="text-right">Completed</Th></Tr></THead>
          <TBody>
            {queueRows.length === 0 ? <TableEmpty colSpan={6}>No queue data.</TableEmpty> : queueRows.map(([name, c]) => (
              <Tr key={name}>
                <Td className="font-medium">{name}</Td>
                <Td className="text-right tabular-nums">{c.waiting}</Td>
                <Td className="text-right tabular-nums">{c.active}</Td>
                <Td className="text-right tabular-nums">{c.delayed}</Td>
                <Td className={cn("text-right tabular-nums", c.failed > 0 && "text-danger")}>{c.failed}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{c.completed}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <p className="text-xs text-fg-subtle">Storage check probes a missing object: a 404 from the provider still counts as reachable.</p>
    </div>
  );
}
