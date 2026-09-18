import type { MetadataRoute } from "next";
import { prisma } from "@modsmith/db";
import { siteUrl } from "@/components/marketing/data";

export const revalidate = 3600;

const STATIC: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/showcase", changeFrequency: "daily", priority: 0.8 },
  { path: "/guides", changeFrequency: "weekly", priority: 0.8 },
  { path: "/docs/server-hub", changeFrequency: "weekly", priority: 0.8 },
  { path: "/reviews", changeFrequency: "weekly", priority: 0.6 },
  { path: "/partners", changeFrequency: "weekly", priority: 0.6 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/login", changeFrequency: "yearly", priority: 0.3 },
  { path: "/register", changeFrequency: "yearly", priority: 0.5 },
];

/**
 * Next prerenders the sitemap at build time, but a container image is built without a database.
 * The dynamic entries are therefore best-effort: if the database is unreachable the build still
 * succeeds with the static routes, and the first revalidation after deploy fills in the rest.
 */
async function dynamicEntries(base: string): Promise<MetadataRoute.Sitemap> {
  const [guides, categories, showcase, partners, latestChangelog] = await Promise.all([
    prisma.guide.findMany({ where: { state: "PUBLISHED" }, select: { slug: true, updatedAt: true, publishedAt: true, category: { select: { slug: true } } } }),
    prisma.guideCategory.findMany({ select: { slug: true } }),
    prisma.showcaseItem.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 5000 }),
    prisma.partner.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    prisma.changelogEntry.findFirst({ where: { state: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  const now = new Date();
  return [
    ...categories.map((c) => ({ url: `${base}/guides/${c.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...guides.map((g) => ({ url: `${base}/guides/${g.category.slug}/${g.slug}`, lastModified: g.updatedAt ?? g.publishedAt ?? now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...showcase.map((s) => ({ url: `${base}/showcase/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...partners.map((p) => ({ url: `${base}/partners/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticEntries: MetadataRoute.Sitemap = STATIC.map((e) => ({
    url: `${base}${e.path}`,
    lastModified: new Date(),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
  try {
    return [...staticEntries, ...(await dynamicEntries(base))];
  } catch (err) {
    console.warn("sitemap: database unavailable, emitting static routes only", err instanceof Error ? err.message : err);
    return staticEntries;
  }
}
