import type { PrismaClient } from "@prisma/client";

export async function seedChangelog(prisma: PrismaClient) {
  const entries = [
    { version: "1.4.0", title: "Chain & Accessory Creator", category: "tool", toolSlug: "chain-creator", description: "Build cuban, rope and tennis chains, pendants and 3D lettering in a live preview and export a wearable accessory resource. Pricing is admin-configurable.", daysAgo: 2 },
    { version: "1.3.2", title: "Optimizer measures expanded VRAM", category: "improvement", toolSlug: "resource-optimizer", description: "The optimizer now reports expanded texture memory per file instead of ZIP size, flags mip-less textures and estimates savings before you optimize.", daysAgo: 9 },
    { version: "1.3.1", title: "Free re-export window", category: "feature", toolSlug: null, description: "Re-exporting the same file with the same configuration within 7 days costs 0 credits. The eligibility date is shown on every creation.", daysAgo: 16 },
    { version: "1.3.0", title: "Server Hub phone media", category: "feature", toolSlug: "server-hub", description: "One-time upload reservations for phone photos with adapters for LB Phone, Quasar, YSeries, CodeM, nPhone and JPR.", daysAgo: 24 },
    { version: "1.2.0", title: "Livery Mapper on real UVs", category: "tool", toolSlug: "livery-mapper", description: "Design liveries on the actual UV layout of unlocked add-on vehicles with a 2D canvas and live 3D preview; designs are baked into the vehicle texture.", daysAgo: 40 },
    { version: "1.1.0", title: "Add-on Car Importer", category: "tool", toolSlug: "car-importer", description: "Paste a GTA5-Mods URL, convert replace mods to standalone add-ons, keep engine audio and get a complete resource ZIP.", daysAgo: 60 },
    { version: "1.0.0", title: "Modsmith launch", category: "feature", toolSlug: null, description: "Prop Creator, credits, Stripe billing, Discord linking and My Creations.", daysAgo: 90 },
  ];
  const count = await prisma.changelogEntry.count();
  if (count > 0) return;
  for (const e of entries) {
    const publishedAt = new Date(Date.now() - e.daysAgo * 86400_000);
    await prisma.changelogEntry.create({ data: { version: e.version, title: e.title, category: e.category, description: e.description, toolSlug: e.toolSlug, state: "PUBLISHED", publishedAt, screenshotKeys: [] } });
  }
}
