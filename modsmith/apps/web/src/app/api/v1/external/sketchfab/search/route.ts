import { z } from "zod";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { env, isFlagEnabled, RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

const q = z.object({ q: z.string().min(1).max(100), sort: z.enum(["relevance", "likes", "views", "recent"]).default("relevance"), cursor: z.string().optional() });

/** Proxies Sketchfab search (downloadable models only) and normalizes license metadata. */
export const GET = apiRoute({ auth: "required", query: q, rateLimit: RATE_LIMITS.externalImports }, async ({ query }) => {
  if (!(await isFlagEnabled("sketchfab_import"))) throw new ApiFailure(ErrorCodes.TOOL_DISABLED, "Model import is disabled", 403);
  const sortMap = { relevance: "-relevance", likes: "-likeCount", views: "-viewCount", recent: "-publishedAt" } as const;
  const url = new URL("https://api.sketchfab.com/v3/search");
  url.searchParams.set("type", "models"); url.searchParams.set("q", query.q); url.searchParams.set("downloadable", "true"); url.searchParams.set("sort_by", sortMap[query.sort]); url.searchParams.set("count", "24");
  if (query.cursor) url.searchParams.set("cursor", query.cursor);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env().SKETCHFAB_API_TOKEN) headers.Authorization = `Token ${env().SKETCHFAB_API_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new ApiFailure(ErrorCodes.INTERNAL, `Model search failed (${res.status})`, 502);
  const data = (await res.json()) as { results: any[]; cursors?: { next?: string | null } };
  return json({
    results: data.results.map((m) => ({ id: m.uid, name: m.name, author: m.user?.displayName ?? m.user?.username, authorUrl: m.user?.profileUrl, thumbnail: (m.thumbnails?.images ?? []).sort((a: any, b: any) => b.width - a.width).find((i: any) => i.width <= 640)?.url ?? m.thumbnails?.images?.[0]?.url, likes: m.likeCount, views: m.viewCount, publishedAt: m.publishedAt, license: m.license?.label ?? "Unknown", licenseUrl: m.license?.url, licenseSlug: m.license?.slug, downloadable: !!m.isDownloadable, faces: m.faceCount, vertices: m.vertexCount, url: m.viewerUrl })),
    nextCursor: data.cursors?.next ?? null,
  });
});
