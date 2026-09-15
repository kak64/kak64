export const BRAND = {
  name: "Modsmith",
  tagline: "Build FiveM assets in your browser.",
  domain: "modsmith.app",
  supportEmail: "support@modsmith.app",
  discordInvite: "https://discord.gg/modsmith",
} as const;

export const CREDITS = {
  SIGNUP_BONUS: 150,
  EMAIL_VERIFY_BONUS: 50,
  DISCORD_BONUS: 100,
  REFERRAL_REWARD: 200,
  REEXPORT_WINDOW_DAYS: 7,
} as const;

export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  UPLOAD_MAX_BYTES: 2 * 1024 * 1024 * 1024, // 2 GiB (multipart)
  UPLOAD_SINGLE_PUT_MAX_BYTES: 64 * 1024 * 1024, // above this, multipart
  MULTIPART_PART_BYTES: 16 * 1024 * 1024,
  UPLOAD_TTL_HOURS: 24,
  HUB_LOG_BATCH_MAX: 100,
  HUB_LOG_REQUEST_MAX_BYTES: 1024 * 1024,
  HUB_DATASET_NAME_MAX: 48,
  HUB_MEDIA_MAX_BYTES: 15 * 1024 * 1024,
  HUB_FREE_STORAGE_BYTES: 512 * 1024 * 1024,
  HUB_DEFAULT_RETENTION_DAYS: 14,
  RESERVATION_TTL_SECONDS: 300,
  SIGNED_URL_TTL_SECONDS: 300,
  SESSION_TTL_DAYS: 7,
  SESSION_REMEMBER_TTL_DAYS: 30,
  VERIFY_TOKEN_TTL_HOURS: 24,
  RESET_TOKEN_TTL_MINUTES: 60,
} as const;

export const USERNAME_REGEX = /^[A-Za-z0-9._-]{3,24}$/;
export const DATASET_NAME_REGEX = /^[A-Za-z0-9._-]{1,48}$/;

export const JOB_STAGES = [
  "upload",
  "validation",
  "importing",
  "converting",
  "optimizing",
  "collision",
  "lods",
  "textures",
  "packaging",
  "complete",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_STAGE_LABELS: Record<JobStage, string> = {
  upload: "Upload",
  validation: "Validation",
  importing: "Importing",
  converting: "Converting",
  optimizing: "Optimizing",
  collision: "Generating collision",
  lods: "Generating LODs",
  textures: "Generating textures",
  packaging: "Packaging",
  complete: "Complete",
};

export const FIVEM_FRAMEWORKS = ["standalone", "esx", "qbcore", "qbox", "illenium-appearance", "rcore"] as const;
export type FivemFramework = (typeof FIVEM_FRAMEWORKS)[number];

export const PHONE_PROVIDERS = ["lb-phone", "quasar", "yseries", "codem", "nphone", "jpr", "custom"] as const;
export type PhoneProvider = (typeof PHONE_PROVIDERS)[number];

export const SUPPORTED_INPUT_FORMATS = [
  "OBJ", "FBX", "glTF", "GLB", "DAE", "PNG", "JPG", "DDS", "YFT", "YDR", "YDD", "YTD", "ZIP",
] as const;
