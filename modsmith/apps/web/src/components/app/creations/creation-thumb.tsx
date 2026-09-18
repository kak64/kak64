/* eslint-disable @next/next/no-img-element */
import { TOOL_BY_SLUG } from "@modsmith/core";
import { cn } from "@/lib/utils";
import { ToolIcon } from "../tool-icon";

/** Signed-URL thumbnail with a tool-icon placeholder. Signed URLs are short-lived, so plain <img> is used. */
export function CreationThumb({ url, toolSlug, name, className }: { url: string | null; toolSlug: string; name: string; className?: string }) {
  const tool = TOOL_BY_SLUG[toolSlug];
  return (
    <div className={cn("relative flex w-full items-center justify-center overflow-hidden bg-bg-muted", className)}>
      {url ? <img src={url} alt={`Preview of ${name}`} className="h-full w-full object-cover" loading="lazy" /> : <ToolIcon name={tool?.icon ?? "Box"} className="h-8 w-8 text-fg-subtle" />}
    </div>
  );
}
