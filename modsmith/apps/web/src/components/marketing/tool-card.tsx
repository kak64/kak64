import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ToolDefinition } from "@modsmith/core";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolIcon } from "./tool-icon";

export type ToolCardTool = Pick<ToolDefinition, "slug" | "name" | "description" | "icon" | "creditCost" | "status" | "requiresAuth" | "requiresSubscription" | "requiresVerification" | "freeDailyExports" | "href" | "accepts">;

export function toolCostLabel(t: Pick<ToolDefinition, "creditCost" | "slug">) {
  if (t.creditCost === 0 || t.slug === "server-hub") return "Free";
  return `${t.creditCost.toLocaleString("en-US")} credits / export`;
}

export function ToolCard({ tool, className }: { tool: ToolCardTool; className?: string }) {
  const comingSoon = tool.status === "coming_soon";
  const maintenance = tool.status === "maintenance";
  const chips: string[] = [];
  if (tool.requiresAuth) chips.push("Sign in required");
  if (tool.requiresSubscription) chips.push("Subscription");
  if (tool.requiresVerification) chips.push("Email verification");
  if (tool.freeDailyExports) chips.push(`${tool.freeDailyExports} free / day`);
  return (
    <article className={cn("group flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-5 transition-colors hover:border-border-strong", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg-muted text-accent">
          <ToolIcon name={tool.icon} className="h-5 w-5" />
        </div>
        <StatusBadge status={tool.status} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-fg">{tool.name}</h3>
      <p className="mt-1.5 text-sm leading-6 text-fg-muted">{tool.description}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {chips.map((c) => <Badge key={c}>{c}</Badge>)}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className={cn("text-sm font-medium tabular-nums", tool.creditCost === 0 ? "text-success" : "text-fg")}>{toolCostLabel(tool)}</span>
        {comingSoon || maintenance ? (
          <Button size="sm" variant="outline" disabled>{comingSoon ? "Coming soon" : "In maintenance"}</Button>
        ) : (
          <Button asChild size="sm" variant="secondary">
            <Link href={tool.href} aria-label={`Open ${tool.name}`}>Open <ArrowRight className="transition-transform group-hover:translate-x-0.5" /></Link>
          </Button>
        )}
      </div>
    </article>
  );
}
