/**
 * Canonical JSON serialization used for the configuration hash that powers
 * free re-exports: same source SHA-256 + same normalized config within 7 days = free.
 * Keys are sorted recursively; numbers are rounded to 6 decimals; undefined/null dropped.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => normalize(v) ?? null);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = normalize((value as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return String(value);
}

/** Keys that never influence the produced artifact and are excluded from the config hash. */
export const NON_SEMANTIC_CONFIG_KEYS = new Set(["name", "displayName", "notes", "clientRequestId"]);

export function stripNonSemantic<T extends Record<string, unknown>>(config: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) if (!NON_SEMANTIC_CONFIG_KEYS.has(k)) out[k] = v;
  return out;
}
