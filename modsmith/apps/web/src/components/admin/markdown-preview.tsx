"use client";
import * as React from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { cn } from "@/lib/utils";

function render(markdown: string) {
  const raw = marked.parse(markdown ?? "", { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2", "details", "summary", "del", "ins", "kbd", "sup", "sub"],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ["href", "name", "target", "rel", "title"], img: ["src", "alt", "title", "width", "height", "loading"], code: ["class"], pre: ["class"], td: ["align"], th: ["align"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

/** Live, sanitized Markdown preview. */
export function MarkdownPreview({ markdown, className }: { markdown: string; className?: string }) {
  const html = React.useMemo(() => render(markdown), [markdown]);
  if (!markdown.trim()) return <p className={cn("text-sm text-fg-subtle", className)}>Nothing to preview yet.</p>;
  return <div className={cn("prose-dark text-sm", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
