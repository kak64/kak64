export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 25;

export function str(sp: SearchParams, key: string): string {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

export function pageOf(sp: SearchParams): number {
  const n = Number(str(sp, "page") || 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Builds an href from the current search params, overriding some keys (undefined/"" removes). */
export function hrefWith(base: string, sp: SearchParams, patch: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) q.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

export function skipTake(page: number, pageSize = PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Pretty label for an enum-ish value. */
export function humanize(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function durationBetween(a: Date | string | null | undefined, b: Date | string | null | undefined) {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export const GB = 1024 ** 3;

export function targetHref(targetType: string, targetId: string, showcaseSlug?: string | null) {
  switch (targetType) {
    case "user": return `/admin/users/${targetId}`;
    case "showcase": return showcaseSlug ? `/showcase/${showcaseSlug}` : `/admin/showcase?q=${encodeURIComponent(targetId)}`;
    case "review": return `/admin/reviews?q=${encodeURIComponent(targetId)}`;
    case "creation": return `/admin/creations?q=${encodeURIComponent(targetId)}`;
    default: return "#";
  }
}
