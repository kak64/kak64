import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("Modsmith"),
  APP_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  STORAGE_PROVIDER: z.enum(["s3", "local"]).default("s3"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("modsmith"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "resend", "postmark", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("Modsmith <no-reply@modsmith.app>"),
  RESEND_API_KEY: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  SMTP_URL: z.string().optional(),
  AI_3D_PROVIDER: z.enum(["mock", "tripo", "meshy", "custom"]).default("mock"),
  AI_3D_API_KEY: z.string().optional(),
  AI_3D_ENDPOINT: z.string().optional(),
  SKETCHFAB_API_TOKEN: z.string().optional(),
  IMPORT_URL_ALLOWLIST: z.string().default("www.gta5-mods.com,gta5-mods.com,cdn.gta5-mods.com"),
  MALWARE_SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMAV_HOST: z.string().default("localhost"),
  CLAMAV_PORT: z.coerce.number().default(3310),
  LOG_LEVEL: z.string().default("info"),
  SENTRY_DSN: z.string().optional(),
  METRICS_TOKEN: z.string().optional(),
  E2E_MODE: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
