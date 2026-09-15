import type { Metadata } from "next";
import { TOOL_CATEGORIES } from "@modsmith/core";
import { getEffectiveTools } from "@modsmith/services";
import { PageHeader } from "@/components/ui/misc";
import { ToolCard } from "@/components/app/tool-card";

export const metadata: Metadata = { title: "Tools" };
export const dynamic = "force-dynamic";

export default async function ToolsIndexPage() {
  const tools = (await getEffectiveTools()).filter((t) => t.enabled);
  return (
    <div>
      <PageHeader title="Tools" description="Every tool runs in your browser and exports a complete FiveM resource. Credits are only charged on a successful build." />
      <div className="space-y-10">
        {TOOL_CATEGORIES.map((cat) => {
          const list = tools.filter((t) => t.category === cat.key);
          if (!list.length) return null;
          return (
            <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
              <div className="mb-3"><h2 id={`cat-${cat.key}`} className="text-lg font-semibold">{cat.label}</h2><p className="text-sm text-fg-muted">{cat.blurb}</p></div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((t) => <li key={t.slug}><ToolCard tool={t} /></li>)}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
