import { z } from "zod";
import { DATASET_NAME_REGEX, FIVEM_FRAMEWORKS, LIMITS, USERNAME_REGEX } from "./constants";

// ───────── Auth ─────────
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.USERNAME_MIN, `Username must be at least ${LIMITS.USERNAME_MIN} characters`)
  .max(LIMITS.USERNAME_MAX, `Username must be at most ${LIMITS.USERNAME_MAX} characters`)
  .regex(USERNAME_REGEX, "Only letters, numbers, _ . and - are allowed");
export const passwordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX);

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and Privacy Policy" }) }),
  ref: z.string().trim().max(64).optional(),
  partner: z.string().trim().max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username").max(254),
  password: z.string().min(1, "Enter your password").max(LIMITS.PASSWORD_MAX),
  remember: z.boolean().optional().default(false),
  next: z.string().max(512).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z
  .object({ token: z.string().min(16).max(256), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export const changePasswordSchema = z
  .object({ current: z.string().min(1), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z.string().url().max(512).nullable().optional(),
});
export const updateNotificationsSchema = z.object({
  notifyEmail: z.boolean().optional(),
  notifyDiscord: z.boolean().optional(),
  notifyJobComplete: z.boolean().optional(),
  notifyMarketing: z.boolean().optional(),
});
export const updatePrivacySchema = z.object({
  profilePublic: z.boolean().optional(),
  showcaseDefaultPublic: z.boolean().optional(),
});
export const deleteAccountSchema = z.object({ password: z.string().min(1), confirm: z.literal("DELETE") });

// ───────── Uploads ─────────
export const uploadInitSchema = z.object({
  toolSlug: z.string().min(1).max(64),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(LIMITS.UPLOAD_MAX_BYTES),
  mime: z.string().max(128).optional(),
});
export const uploadCompleteSchema = z.object({
  uploadId: z.string(),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string() })).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

// ───────── Jobs ─────────
export const jobCreateSchema = z.object({
  toolSlug: z.string().min(1).max(64),
  uploadIds: z.array(z.string()).max(32).default([]),
  creationId: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  config: z.record(z.unknown()).default({}),
  externalRef: z.object({ provider: z.string(), id: z.string(), url: z.string().url().optional() }).optional(),
  rightsConfirmed: z.boolean().optional(),
  /** "inspect" jobs convert uploads into editor previews (GLB/textures/UVs) and are always free; "export" builds the resource. */
  purpose: z.enum(["export", "inspect"]).default("export"),
});

// ───────── Tool configs ─────────
export const vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const propConfigSchema = z.object({
  propName: z.string().trim().regex(/^[a-z0-9_]{3,48}$/, "Use lowercase letters, numbers and underscores").default("modsmith_prop"),
  position: vec3.default([0, 0, 0]),
  rotation: vec3.default([0, 0, 0]),
  scale: vec3.default([1, 1, 1]),
  collision: z.enum(["none", "box", "mesh"]).default("box"),
  lods: z.object({
    auto: z.boolean().default(true),
    high: z.number().min(0.05).max(1).default(1),
    medium: z.number().min(0.02).max(1).default(0.5),
    low: z.number().min(0.01).max(1).default(0.25),
    veryLow: z.number().min(0.005).max(1).default(0.1),
    distances: z.tuple([z.number(), z.number(), z.number(), z.number()]).default([50, 100, 200, 500]),
  }).default({}),
  decimation: z.number().min(0.05).max(1).default(1),
  targetTriangles: z.number().int().positive().max(2_000_000).optional(),
  materials: z.array(z.object({
    name: z.string(),
    baseColor: z.string().optional(),
    normal: z.string().optional(),
    roughness: z.string().optional(),
    metalness: z.string().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    metallic: z.number().min(0).max(1).optional(),
    roughnessValue: z.number().min(0).max(1).optional(),
  })).default([]),
  spawnScript: z.boolean().default(true),
  attribution: z.object({ model: z.string(), author: z.string(), license: z.string(), sourceUrl: z.string() }).optional(),
});
export type PropConfig = z.infer<typeof propConfigSchema>;

export const aiPropConfigSchema = z.object({
  prompt: z.string().trim().max(500).optional(),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
});

export const carImporterConfigSchema = z.object({
  sourceUrl: z.string().url().max(1024).optional(),
  convertReplaceToAddon: z.boolean().default(true),
  newSpawnName: z.string().regex(/^[a-z0-9_]{2,24}$/).optional(),
  keepAudio: z.boolean().default(true),
  rightsConfirmed: z.literal(true),
});

export const optimizerConfigSchema = z.object({
  mode: z.enum(["analyze", "optimize"]).default("analyze"),
  maxTextureSize: z.number().int().min(256).max(4096).default(2048),
  generateMipmaps: z.boolean().default(true),
  compressTextures: z.boolean().default(true),
  kind: z.enum(["general", "vehicle", "map"]).default("general"),
});

export const tattooConfigSchema = z.object({
  packName: z.string().regex(/^[a-z0-9_]{3,32}$/).default("modsmith_tattoos"),
  frameworks: z.array(z.enum(FIVEM_FRAMEWORKS)).min(1).default(["standalone"]),
  tattoos: z.array(z.object({
    id: z.string(),
    name: z.string().min(1).max(48),
    imageKey: z.string(),
    zone: z.enum(["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"]),
    gender: z.enum(["male", "female", "both"]).default("both"),
    position: z.tuple([z.number(), z.number()]),
    rotation: z.number().default(0),
    scale: z.number().min(0.05).max(5).default(1),
    opacity: z.number().min(0).max(1).default(1),
    order: z.number().int().default(0),
  })).min(1),
});

export const faceConfigSchema = z.object({
  gender: z.enum(["male", "female"]).default("male"),
  alignment: z.object({ x: z.number(), y: z.number(), scale: z.number(), rotation: z.number() }).default({ x: 0, y: 0, scale: 1, rotation: 0 }),
  skin: z.object({ brightness: z.number().min(-1).max(1).default(0), contrast: z.number().min(-1).max(1).default(0), warmth: z.number().min(-1).max(1).default(0), blend: z.number().min(0).max(1).default(0.6) }).default({}),
});

export const weaponSkinConfigSchema = z.object({
  resourceName: z.string().regex(/^[a-z0-9_]{3,32}$/).default("modsmith_weaponskins"),
  skins: z.array(z.object({ weapon: z.string(), name: z.string().max(48), textureKey: z.string() })).min(1).max(50),
});

export const liveryConfigSchema = z.object({
  vehicleName: z.string().regex(/^[a-z0-9_]{2,32}$/),
  liveryName: z.string().max(48).default("livery1"),
  textureKey: z.string(),
  resolution: z.enum(["1024", "2048", "4096"]).default("2048"),
});

export const clothingConfigSchema = z.object({
  resourceName: z.string().regex(/^[a-z0-9_]{3,32}$/).default("modsmith_clothing"),
  gender: z.enum(["male", "female"]).default("male"),
  component: z.string(),
  garmentSource: z.enum(["library", "upload"]),
  garmentId: z.string().optional(),
  variants: z.array(z.object({ name: z.string().max(32), textureKey: z.string() })).min(1).max(26),
});

export const accessoryConfigSchema = z.object({
  resourceName: z.string().regex(/^[a-z0-9_]{3,32}$/).default("modsmith_chain"),
  baseModel: z.enum(["cuban-chain", "rope-chain", "tennis-chain", "pendant-round", "pendant-plate", "lettering"]),
  text: z.string().max(12).optional(),
  material: z.enum(["gold", "silver", "rose-gold", "black"]).default("gold"),
  scale: z.number().min(0.5).max(2).default(1),
  position: vec3.default([0, 0, 0]),
  gender: z.enum(["male", "female", "both"]).default("both"),
});

export const retextureConfigSchema = z.object({
  replacements: z.array(z.object({ material: z.string(), texture: z.string(), replacementKey: z.string(), transform: z.object({ scale: z.number().default(1), offsetX: z.number().default(0), offsetY: z.number().default(0), rotation: z.number().default(0), fit: z.enum(["stretch", "contain", "cover"]).default("stretch") }).default({}), adjustments: z.object({ brightness: z.number().default(0), contrast: z.number().default(0), saturation: z.number().default(0), hue: z.number().default(0) }).default({}) })).min(1),
});

export const vehicleEditorConfigSchema = z.object({
  spawnName: z.string().regex(/^[a-z0-9_]{2,32}$/),
  hiddenParts: z.array(z.string()).default([]),
  removedParts: z.array(z.string()).default([]),
  wheels: z.object({ model: z.string().optional(), width: z.number().min(0.5).max(2).default(1), offset: z.number().min(-0.2).max(0.2).default(0) }).default({}),
  stance: z.object({ frontHeight: z.number().default(0), rearHeight: z.number().default(0), camber: z.number().default(0) }).default({}),
  glowTrim: z.object({ enabled: z.boolean().default(false), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#00ffff") }).default({}),
  maxTextureSize: z.number().int().min(512).max(4096).default(2048),
  lodBias: z.number().min(0.5).max(2).default(1),
});

export const TOOL_CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  "prop-creator": propConfigSchema,
  "ai-prop-creator": aiPropConfigSchema,
  "car-importer": carImporterConfigSchema,
  "vehicle-editor": vehicleEditorConfigSchema,
  "livery-mapper": liveryConfigSchema,
  retexture: retextureConfigSchema,
  "clothing-textures": clothingConfigSchema,
  "weapon-skins": weaponSkinConfigSchema,
  "tattoo-creator": tattooConfigSchema,
  "face-skin-creator": faceConfigSchema,
  "chain-creator": accessoryConfigSchema,
  "resource-optimizer": optimizerConfigSchema,
  "vehicle-optimizer": optimizerConfigSchema,
  "map-optimizer": optimizerConfigSchema,
};

// ───────── Creations / Showcase / Reviews ─────────
export const creationUpdateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), projectState: z.record(z.unknown()).optional() });
export const publishSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["props", "cars", "liveries", "clothing", "weapons", "tattoos", "other"]),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  allowDownload: z.boolean().default(false),
  allowRemix: z.boolean().default(false),
});
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().min(10).max(1000), creationId: z.string().optional(), toolSlug: z.string().optional() });
export const reportSchema = z.object({ targetType: z.enum(["showcase", "review", "user", "creation"]), targetId: z.string(), reason: z.enum(["copyright", "inappropriate", "spam", "other"]), details: z.string().trim().max(1000).optional() });

// ───────── Server Hub ─────────
export const hubProjectSchema = z.object({ name: z.string().trim().min(2).max(48), description: z.string().trim().max(300).optional(), framework: z.enum(["standalone", "esx", "qbcore", "qbox"]).default("standalone") });
export const hubTokenSchema = z.object({ name: z.string().trim().min(1).max(48).default("default") });

export const hubLogLevelSchema = z.enum(["debug", "info", "warn", "error", "fatal"]);
export const hubLogEventSchema = z.object({
  id: z.string().max(64).optional(),
  level: hubLogLevelSchema.default("info"),
  message: z.string().min(1).max(4000),
  resource: z.string().max(64).optional(),
  dataset: z.string().regex(DATASET_NAME_REGEX, "Dataset names: letters, numbers, . _ - up to 48 chars").optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  metadata: z.record(z.unknown()).optional(),
  player: z.object({
    source: z.number().int().optional(),
    target: z.number().int().optional(),
    license: z.string().max(128).optional(),
    discord: z.string().max(64).optional(),
    name: z.string().max(64).optional(),
  }).optional(),
});
export const hubLogBatchSchema = z.array(hubLogEventSchema).min(1).max(LIMITS.HUB_LOG_BATCH_MAX);

export const hubLogSearchSchema = z.object({
  projectId: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  level: z.array(hubLogLevelSchema).optional(),
  dataset: z.string().optional(),
  resource: z.string().optional(),
  player: z.string().optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const hubReservationSchema = z.object({
  kind: z.enum(["screenshot", "phone_photo", "phone_video", "other"]).default("phone_photo"),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  maxBytes: z.number().int().positive().max(LIMITS.HUB_MEDIA_MAX_BYTES).optional(),
  metadata: z.object({
    player: z.object({ source: z.number().int().optional(), license: z.string().max(128).optional(), discord: z.string().max(64).optional(), name: z.string().max(64).optional() }).optional(),
    reason: z.string().max(200).optional(),
    reportId: z.string().max(64).optional(),
    extra: z.record(z.unknown()).optional(),
  }).optional(),
});

// ───────── Billing ─────────
export const checkoutPackSchema = z.object({ packId: z.string(), quantity: z.number().int().positive().max(1_000_000).optional() });
export const checkoutSubscriptionSchema = z.object({ planId: z.string(), interval: z.enum(["month", "year"]) });

// ───────── Admin ─────────
export const adminCreditAdjustSchema = z.object({ userId: z.string(), amount: z.number().int().refine((n) => n !== 0), reason: z.string().trim().min(3).max(300) });
export const adminUserUpdateSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional(), role: z.enum(["USER", "MODERATOR", "ADMIN"]).optional(), emailVerified: z.boolean().optional() });
export const adminToolUpdateSchema = z.object({ creditCost: z.number().int().min(0).optional(), status: z.string().optional(), enabled: z.boolean().optional(), requiresSubscription: z.boolean().optional(), requiresVerification: z.boolean().optional(), freeDailyExports: z.number().int().min(0).optional() });
export const adminPackSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,32}$/), name: z.string().min(1).max(48), credits: z.number().int().positive(), bonusCredits: z.number().int().min(0).default(0), priceCents: z.number().int().positive(), currency: z.string().length(3).default("usd"), stripePriceId: z.string().optional().nullable(), isCustom: z.boolean().default(false), minCredits: z.number().int().optional().nullable(), maxCredits: z.number().int().optional().nullable(), badge: z.string().max(24).optional().nullable(), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });
export const adminPartnerSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,48}$/), name: z.string().min(1).max(64), logoUrl: z.string().url().optional().nullable(), description: z.string().min(1).max(600), category: z.string().min(1).max(32), website: z.string().url().optional().nullable(), discordUrl: z.string().url().optional().nullable(), youtubeUrl: z.string().url().optional().nullable(), twitterUrl: z.string().url().optional().nullable(), priority: z.number().int().default(0), active: z.boolean().default(true), referralCode: z.string().regex(/^[A-Za-z0-9_-]{2,32}$/), bonusCredits: z.number().int().min(0).default(0), pageContent: z.string().max(20000).optional().nullable() });
export const adminGuideSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,96}$/), categoryId: z.string(), title: z.string().min(1).max(140), intro: z.string().min(1).max(600), content: z.string().min(1), coverKey: z.string().optional().nullable(), seoTitle: z.string().max(70).optional().nullable(), seoDescription: z.string().max(160).optional().nullable(), faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]), relatedSlugs: z.array(z.string()).default([]), toolSlug: z.string().optional().nullable(), state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT") });
export const adminChangelogSchema = z.object({ version: z.string().min(1).max(24), title: z.string().min(1).max(140), category: z.enum(["feature", "improvement", "fix", "tool"]), description: z.string().min(1), screenshotKeys: z.array(z.string()).default([]), toolSlug: z.string().optional().nullable(), state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"), publishedAt: z.string().datetime().optional().nullable() });
export const adminPlanSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,32}$/), kind: z.enum(["CREATOR", "SERVER_HUB"]).default("CREATOR"), name: z.string().min(1).max(48), description: z.string().max(300).optional().nullable(), monthlyPriceCents: z.number().int().min(0), yearlyPriceCents: z.number().int().min(0), currency: z.string().length(3).default("usd"), stripeMonthlyPriceId: z.string().optional().nullable(), stripeYearlyPriceId: z.string().optional().nullable(), monthlyCredits: z.number().int().min(0).default(0), exportDiscountPct: z.number().int().min(0).max(100).default(0), premiumTools: z.boolean().default(false), aiTools: z.boolean().default(false), faceDailyExports: z.number().int().optional().nullable(), hubStorageBytes: z.number().int().optional().nullable(), hubRetentionDays: z.number().int().optional().nullable(), hubMaxServers: z.number().int().optional().nullable(), features: z.array(z.string()).default([]), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });

export function flattenZodError(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
