/* eslint-disable no-console */
import { PrismaClient } from "../generated/client";
import argon2 from "argon2";
import { TOOLS } from "../../core/src/tools";
import { LIMITS } from "../../core/src/constants";
import { seedGuides } from "./seed-data/guides";
import { seedChangelog } from "./seed-data/changelog";

const prisma = new PrismaClient();

function normalize(s: string) {
  return s.trim().toLowerCase();
}
function refCode(username: string) {
  return username.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || Math.random().toString(36).slice(2, 10);
}

async function main() {
  // Tools
  for (const [i, t] of TOOLS.entries()) {
    await prisma.toolConfig.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        category: t.category,
        description: t.description,
        creditCost: t.creditCost,
        status: t.status,
        requiresAuth: t.requiresAuth,
        requiresSubscription: t.requiresSubscription,
        requiresVerification: t.requiresVerification,
        freeDailyExports: t.freeDailyExports ?? 0,
        sortOrder: i,
      },
      update: { name: t.name, category: t.category, description: t.description, sortOrder: i },
    });
  }

  // Credit packs
  const packs = [
    { slug: "starter", name: "Starter", credits: 150, bonusCredits: 0, priceCents: 499, sortOrder: 0, badge: null },
    { slug: "creator", name: "Creator", credits: 2500, bonusCredits: 250, priceCents: 4999, sortOrder: 1, badge: "Popular" },
    { slug: "studio", name: "Studio", credits: 5000, bonusCredits: 750, priceCents: 8999, sortOrder: 2, badge: "Best value" },
    { slug: "agency", name: "Agency", credits: 10000, bonusCredits: 2000, priceCents: 15999, sortOrder: 3, badge: null },
    { slug: "custom", name: "Custom amount", credits: 1, bonusCredits: 0, priceCents: 3, isCustom: true, minCredits: 100, maxCredits: 100000, sortOrder: 4, badge: null },
  ];
  for (const p of packs) {
    await prisma.creditPack.upsert({ where: { slug: p.slug }, create: { ...p, currency: "usd", active: true }, update: {} });
  }

  // Subscription plans
  const plans = [
    { slug: "creator-plus", kind: "CREATOR" as const, name: "Creator+", description: "Monthly credits, discounted exports and AI tools.", monthlyPriceCents: 1499, yearlyPriceCents: 14990, monthlyCredits: 1500, exportDiscountPct: 15, premiumTools: true, aiTools: true, faceDailyExports: 10, sortOrder: 0, features: ["1,500 credits every month", "15% off every export", "AI Prop Creator", "10 free face exports / day", "Priority queue"] },
    { slug: "studio-pro", kind: "CREATOR" as const, name: "Studio Pro", description: "For teams shipping assets every week.", monthlyPriceCents: 3999, yearlyPriceCents: 39990, monthlyCredits: 5000, exportDiscountPct: 30, premiumTools: true, aiTools: true, faceDailyExports: 50, sortOrder: 1, features: ["5,000 credits every month", "30% off every export", "AI Prop Creator", "50 free face exports / day", "Highest queue priority", "Early access tools"] },
    { slug: "hub-starter", kind: "SERVER_HUB" as const, name: "Hub Starter", description: "Logs and media for one community.", monthlyPriceCents: 799, yearlyPriceCents: 7990, monthlyCredits: 0, exportDiscountPct: 0, premiumTools: false, aiTools: false, hubStorageBytes: BigInt(10 * 1024 ** 3), hubRetentionDays: 30, hubMaxServers: 3, sortOrder: 10, features: ["10 GB private media", "30-day log retention", "3 servers", "Screenshots & phone media"] },
    { slug: "hub-network", kind: "SERVER_HUB" as const, name: "Hub Network", description: "For multi-server networks.", monthlyPriceCents: 2499, yearlyPriceCents: 24990, monthlyCredits: 0, exportDiscountPct: 0, premiumTools: false, aiTools: false, hubStorageBytes: BigInt(100 * 1024 ** 3), hubRetentionDays: 90, hubMaxServers: 15, sortOrder: 11, features: ["100 GB private media", "90-day log retention", "15 servers", "Priority ingestion"] },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { slug: p.slug }, create: { ...p, currency: "usd", active: true }, update: {} });
  }

  // Guide categories + guides + changelog
  await seedGuides(prisma);
  await seedChangelog(prisma);

  // Partners
  const partners = [
    { slug: "northline-rp", name: "Northline Roleplay", description: "A serious-RP community running custom props, vehicles and clothing built entirely in the browser.", category: "Community", website: "https://example.com/northline", discordUrl: "https://discord.gg/example", youtubeUrl: null, priority: 10, referralCode: "NORTHLINE", bonusCredits: 100 },
    { slug: "pixelgarage", name: "PixelGarage Studio", description: "Vehicle and livery studio shipping weekly packs for 40+ servers.", category: "Studio", website: "https://example.com/pixelgarage", discordUrl: "https://discord.gg/example2", youtubeUrl: "https://youtube.com/@example", priority: 8, referralCode: "PIXELGARAGE", bonusCredits: 100 },
    { slug: "mapworks", name: "MapWorks Collective", description: "MLO and map creators focused on optimization and low VRAM builds.", category: "Creators", website: "https://example.com/mapworks", discordUrl: null, youtubeUrl: null, priority: 5, referralCode: "MAPWORKS", bonusCredits: 50 },
  ];
  for (const p of partners) {
    await prisma.partner.upsert({ where: { slug: p.slug }, create: { ...p, active: true, pageContent: `## About ${p.name}\n\n${p.description}\n\nUse the partner link to receive **${p.bonusCredits} bonus credits** on signup.` }, update: {} });
  }

  // Feature flags
  const flags = [
    { key: "ai_prop_creator", description: "Enable the AI Prop Creator for all users", enabled: true },
    { key: "sketchfab_import", description: "Enable Sketchfab model search/import", enabled: true },
    { key: "car_importer", description: "Enable the Add-on Car Importer", enabled: true },
    { key: "server_hub", description: "Enable Server Hub", enabled: true },
    { key: "reviews", description: "Allow review submission", enabled: true },
    { key: "maintenance_banner", description: "Show maintenance banner", enabled: false },
  ];
  for (const f of flags) await prisma.featureFlag.upsert({ where: { key: f.key }, create: f, update: { description: f.description } });

  // System settings
  const settings: Record<string, unknown> = {
    "credits.signupBonus": 150,
    "credits.emailVerifyBonus": 50,
    "credits.discordBonus": 100,
    "credits.referralReward": 200,
    "credits.reexportWindowDays": 7,
    "hub.freeStorageBytes": LIMITS.HUB_FREE_STORAGE_BYTES,
    "hub.defaultRetentionDays": LIMITS.HUB_DEFAULT_RETENTION_DAYS,
    "hub.freeMaxServers": 1,
    "uploads.ttlHours": LIMITS.UPLOAD_TTL_HOURS,
  };
  for (const [key, value] of Object.entries(settings)) await prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as any }, update: {} });

  // Admin bootstrap
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@modsmith.local";
  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const existing = await prisma.user.findUnique({ where: { emailNormalized: normalize(adminEmail) } });
  if (!existing) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        emailNormalized: normalize(adminEmail),
        username: adminUsername,
        usernameNormalized: normalize(adminUsername),
        passwordHash,
        role: "ADMIN",
        emailVerifiedAt: new Date(),
        referralCode: refCode(adminUsername),
        creditAccount: { create: { balance: 0 } },
        adminUser: { create: { permissions: ["*"] } },
        storageQuota: { create: { limitBytes: BigInt(LIMITS.HUB_FREE_STORAGE_BYTES), retentionDays: LIMITS.HUB_DEFAULT_RETENTION_DAYS } },
      },
    });
    await prisma.referral.create({ data: { ownerId: user.id, code: user.referralCode } });
    console.log(`Created admin user ${adminEmail} / ${adminUsername}`);
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
