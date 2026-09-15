import type { JobStage } from "./constants";

/** Reference to an object in private storage. */
export interface StorageRef {
  key: string;
  size?: number;
  mime?: string;
  originalName?: string;
  sha256?: string;
}

export interface AssetInput {
  toolSlug: string;
  userId: string;
  /** Primary uploaded objects (or empty for URL/AI-driven tools). */
  files: StorageRef[];
  /** Tool-specific configuration (already validated with the tool's zod schema). */
  config: Record<string, unknown>;
  /** Optional external reference (e.g. gta5-mods URL, sketchfab id). */
  externalRef?: { provider: string; id: string; url?: string };
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Normalized/augmented input details discovered during validation. */
  facts?: Record<string, unknown>;
}

export interface CostEstimate {
  credits: number;
  breakdown?: { label: string; credits: number }[];
  freeReexport?: boolean;
  reexportUntil?: string;
}

export interface ProgressReporter {
  stage(stage: JobStage, progress: number, message?: string): Promise<void>;
  log(message: string, data?: Record<string, unknown>): Promise<void>;
  isCancelled(): boolean;
}

export interface ProcessingJob {
  id: string;
  userId: string;
  toolSlug: string;
  input: AssetInput;
  /** Absolute scratch directory the worker may write into; deleted after the job. */
  workDir: string;
  attempt: number;
  reporter: ProgressReporter;
}

export interface ProcessingArtifact {
  /** Local path to the ZIP (or other artifact) produced by the processor. */
  localPath: string;
  fileName: string;
  mime: string;
  /** Optional thumbnail image (PNG) path. */
  thumbnailPath?: string;
  /** File listing and stats for UI display. */
  manifest: Record<string, unknown>;
  /** Editor-loadable preview (e.g. GLB) for tools that re-open results. */
  previewPath?: string;
}

export type ProcessingResult =
  | { ok: true; artifact: ProcessingArtifact; facts?: Record<string, unknown> }
  | { ok: false; code: string; message: string; retryable: boolean; /** true = our infrastructure failed → refund */ infrastructure: boolean };

/**
 * Every tool implements this interface. Workers are the only place that ever
 * runs heavy conversions; web requests only enqueue and observe.
 */
export interface AssetProcessor {
  readonly name: string;
  validate(input: AssetInput, ctx: ProcessorContext): Promise<ValidationResult>;
  process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult>;
  estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate>;
}

export interface ProcessorContext {
  storage: {
    download(key: string, toPath: string): Promise<void>;
    upload(fromPath: string, key: string, mime: string): Promise<{ size: number; sha256: string }>;
    head(key: string): Promise<{ size: number; mime?: string } | null>;
  };
  /** Base credit cost for the tool (from DB ToolConfig). */
  baseCost: number;
  /** Fetch a URL with SSRF protection and allowlisting. */
  fetchExternal?(url: string, opts?: { maxBytes?: number }): Promise<{ buffer: Buffer; contentType: string | null; finalUrl: string }>;
  logger: { info(msg: string, data?: unknown): void; warn(msg: string, data?: unknown): void; error(msg: string, data?: unknown): void };
}
