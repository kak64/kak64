import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { slugify } from "@/lib/utils";

export type TocItem = { id: string; text: string; level: 2 | 3 };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
function decode(s: string) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

/** Server-side Markdown → sanitized HTML. Adds ids to h2/h3 and returns a table of contents. */
export function renderMarkdown(markdown: string): { html: string; toc: TocItem[] } {
  const raw = marked.parse(markdown ?? "", { async: false, gfm: true, breaks: false }) as string;
  const toc: TocItem[] = [];
  const used = new Set<string>();
  const withIds = raw.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const text = decode(inner.replace(/<[^>]+>/g, "").trim());
    const base = slugify(text) || "section";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    toc.push({ id, text, level: Number(lvl) as 2 | 3 });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  const html = sanitizeHtml(withIds, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2", "details", "summary", "del", "ins", "kbd", "sup", "sub"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      h2: ["id"],
      h3: ["id"],
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      pre: ["class"],
      td: ["align"],
      th: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => {
        const external = /^https?:\/\//i.test(attribs.href ?? "");
        return { tagName, attribs: external ? { ...attribs, rel: "noopener noreferrer", target: "_blank" } : attribs };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
    },
  });
  return { html, toc };
}

/** Plain-text excerpt of a markdown string (for descriptions). */
export function markdownExcerpt(markdown: string, max = 160) {
  const text = (markdown ?? "").replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`[\]()]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
