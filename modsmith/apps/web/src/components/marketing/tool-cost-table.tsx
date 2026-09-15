import type { ToolDefinition } from "@modsmith/core";
import { TOOL_CATEGORIES } from "@modsmith/core";
import { StatusBadge } from "@/components/ui/badge";
import { ToolIcon } from "./tool-icon";

type Row = Pick<ToolDefinition, "slug" | "name" | "category" | "icon" | "creditCost" | "status" | "freeDailyExports" | "requiresSubscription">;

export function ToolCostTable({ tools, caption = "Credit cost per export" }: { tools: Row[]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
            <th scope="col" className="px-4 py-3 font-medium">Tool</th>
            <th scope="col" className="px-4 py-3 font-medium">Category</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Cost / export</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => {
            const cat = TOOL_CATEGORIES.find((c) => c.key === t.category)?.label ?? t.category;
            return (
              <tr key={t.slug} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-2.5 font-medium text-fg">
                  <span className="inline-flex items-center gap-2"><ToolIcon name={t.icon} className="h-4 w-4 text-accent" /> {t.name}</span>
                </th>
                <td className="px-4 py-2.5 text-fg-muted">{cat}</td>
                <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {t.creditCost === 0 ? <span className="text-success">Free</span> : `${t.creditCost.toLocaleString("en-US")} credits`}
                  {t.freeDailyExports ? <div className="text-[11px] text-fg-subtle">{t.freeDailyExports} free / day</div> : null}
                  {t.requiresSubscription ? <div className="text-[11px] text-fg-subtle">Subscription</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
