import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

let envFileLoaded = false;

/**
 * Loads the repository's .env when the process was not started with one already exported.
 *
 * Next.js only reads .env from the app directory and the worker reads none at all, so without this
 * a service started by systemd, NSSM or a bare `pnpm start` from the repo root would come up with
 * no DATABASE_URL. Values already present in the environment always win, so tests and container
 * orchestration keep full control.
 */
function loadEnvFileOnce() {
  if (envFileLoaded) return;
  envFileLoaded = true;
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      try {
        for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
          const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
          if (!match) continue;
          const key = match[1]!;
          if (process.env[key] !== undefined) continue;
          process.env[key] = match[2]!.trim().replace(/^["']|["']$/g, "");
        }
      } catch {
        // An unreadable .env is not fatal; validation below reports what is actually missing.
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  loadEnvFileOnce();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
