import { File, Folder } from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface Node { name: string; size?: number; children: Map<string, Node> }

function extractFiles(manifest: unknown): { path: string; size?: number }[] {
  if (!manifest || typeof manifest !== "object") return [];
  const raw = Array.isArray(manifest) ? manifest : (manifest as Record<string, unknown>).files;
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => {
    if (typeof f === "string") return { path: f };
    if (f && typeof f === "object") { const o = f as Record<string, unknown>; const path = String(o.path ?? o.name ?? o.file ?? ""); const size = typeof o.size === "number" ? o.size : typeof o.sizeBytes === "number" ? o.sizeBytes : typeof o.bytes === "number" ? o.bytes : undefined; return { path, size }; }
    return { path: "" };
  }).filter((f) => f.path);
}

function build(files: { path: string; size?: number }[]): Node {
  const root: Node = { name: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let cur = root;
    parts.forEach((p, i) => {
      let n = cur.children.get(p);
      if (!n) { n = { name: p, children: new Map() }; cur.children.set(p, n); }
      if (i === parts.length - 1) n.size = f.size;
      cur = n;
    });
  }
  return root;
}

function TreeNodes({ node, depth }: { node: Node; depth: number }) {
  const entries = [...node.children.values()].sort((a, b) => (b.children.size > 0 ? 1 : 0) - (a.children.size > 0 ? 1 : 0) || a.name.localeCompare(b.name));
  return (
    <ul className={depth ? "ml-4 border-l border-border pl-2" : ""}>
      {entries.map((n) => n.children.size ? (
        <li key={n.name}>
          <details open={depth < 1}>
            <summary className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-bg-subtle"><Folder className="h-3.5 w-3.5 text-accent" aria-hidden />{n.name}<span className="text-xs text-fg-subtle">({n.children.size})</span></summary>
            <TreeNodes node={n} depth={depth + 1} />
          </details>
        </li>
      ) : (
        <li key={n.name} className="flex items-center justify-between gap-2 px-1 py-0.5 text-sm"><span className="flex min-w-0 items-center gap-1.5"><File className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden /><span className="truncate font-mono text-[13px]">{n.name}</span></span>{n.size != null ? <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{formatBytes(n.size)}</span> : null}</li>
      ))}
    </ul>
  );
}

/** Renders a version manifest's file list as a collapsible tree; falls back to raw JSON for unknown shapes. */
export function ManifestTree({ manifest }: { manifest: unknown }) {
  const files = extractFiles(manifest);
  if (!files.length) {
    if (!manifest) return <p className="text-sm text-fg-muted">No manifest recorded for this version.</p>;
    return <pre className="max-h-72 overflow-auto rounded-md border border-border bg-bg-muted p-3 text-xs">{JSON.stringify(manifest, null, 2)}</pre>;
  }
  return <div className="max-h-96 overflow-auto rounded-md border border-border bg-bg-muted p-2 scrollbar-thin"><TreeNodes node={build(files)} depth={0} /><p className="mt-2 px-1 text-xs text-fg-subtle">{files.length} file{files.length === 1 ? "" : "s"}</p></div>;
}
