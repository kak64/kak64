import Link from "next/link";
import { ArrowRight, Coins, Lock, MailCheck, Gift } from "lucide-react";
import type { ToolDefinition } from "@modsmith/core";
import { cn, formatCredits } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ToolIcon } from "./tool-icon";

export type ToolCardData = Pick<ToolDefinition, "slug" | "name" | "description" | "icon" | "creditCost" | "status" | "requiresSubscription" | "requiresVerification" | "freeDailyExports" | "href" | "category">;

export function ToolCard({ tool, compact, className }: { tool: ToolCardData; compact?: boolean; className?: string }) {
  const disabled = tool.status === "coming_soon" || tool.status === "maintenance";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><ToolIcon name={tool.icon} className="h-5 w-5" /></div>
        <div className="flex flex-wrap justify-end gap-1">
          {tool.status !== "live" ? <StatusBadge status={tool.status} /> : null}
          {tool.requiresSubscription ? <Badge variant="info"><Lock className="h-3 w-3" aria-hidden /> Subscription</Badge> : null}
          {tool.requiresVerification ? <Badge variant="default"><MailCheck className="h-3 w-3" aria-hidden /> Verified email</Badge> : null}
        </div>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-fg">{tool.name}</h3>
      {!compact ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-fg-muted">{tool.description}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-fg-muted">
          {tool.creditCost > 0 ? <><Coins className="h-3.5 w-3.5 text-accent" aria-hidden /> {formatCredits(tool.creditCost)} credits / export</> : <><Gift className="h-3.5 w-3.5 text-success" aria-hidden /> Free</>}
          {tool.freeDailyExports ? <span className="ml-1 text-success">· {tool.freeDailyExports} free/day</span> : null}
        </span>
        {disabled ? <span className="text-fg-subtle">{tool.status === "maintenance" ? "Under maintenance" : "Coming soon"}</span> : <span className="inline-flex items-center gap-1 font-medium text-accent">Open <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>}
      </div>
    </>
  );
  const classes = cn("flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-4 transition-colors", disabled ? "opacity-60" : "hover:border-accent/50 focus-visible:border-accent", className);
  if (disabled) return <div className={classes} aria-disabled="true">{body}</div>;
  return <Link href={tool.href} className={classes} aria-label={`Open ${tool.name}`}>{body}</Link>;
}
