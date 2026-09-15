"use client";
/** Shared client helpers for the browser tool editors: artifacts, blob uploads, drafts, inspect jobs. */
import * as React from "react";
import { api } from "@/lib/api-client";

// ───────── Result manifest shapes (see docs/PROCESSING_CONTRACT.md) ─────────

export interface JobArtifact { name: string; key: string; mime?: string; size?: number }
export interface ResultManifest {
  artifacts?: JobArtifact[];
  files?: { path: string; size: number }[];
  stats?: { triangles?: number; textures?: number; vramBytes?: number; lods?: number };
  warnings?: string[];
  encoder?: string;
}
export interface MaterialInfo { name: string; shader?: string; textures?: Record<string, string>; primitiveIndices?: number[] }
export interface TextureInfo { name: string; width: number; height: number; format: string; mips: number; artifact: string }
export interface ComponentInfo { name: string; primitiveIndices?: number[]; children?: ComponentInfo[] }
export interface InspectFacts {
  escrow?: boolean;
  vehicleName?: string;
  hasHiLod?: boolean;
  textureCount?: number;
  triangles?: number;
  uploadId?: string;
  variants?: string[];
  faceBox?: { x: number; y: number; w: number; h: number };
  replaceDetected?: boolean;
  originalModel?: string;
  spawnName?: string;
  [key: string]: unknown;
}

export interface OptimizerReport {
  totalBytes: number;
  estimatedVramBytes: number;
  files: {
    path: string; type: string; bytes: number; vramBytes: number;
    textures?: { name: string; width: number; height: number; format: string; mips: number; vramBytes: number }[];
    lods?: { high: boolean; med: boolean; low: boolean; vlow: boolean };
  }[];
  issues: {
    severity: "critical" | "high" | "medium" | "low";
    code: string; path: string; texture?: string; message: string; recommendation: string; savingsBytes: number; fixable: boolean;
  }[];
  beforeAfter?: { vramBytes: [number, number]; diskBytes: [number, number] };
}

export interface JobDetail {
  id: string;
  toolSlug: string;
  status: string;
  stage: string | null;
  progress: number;
  creationId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultManifest: ResultManifest | null;
  resultName: string | null;
  config: Record<string, unknown> | null;
}

export interface CreationDetail {
  id: string;
  toolSlug: string;
  name: string;
  status: string;
  config: Record<string, unknown> | null;
  projectState: (Record<string, unknown> & { preview?: { jobId: string; manifest: ResultManifest; facts: InspectFacts } }) | null;
  thumbnailUrl: string | null;
}

// ───────── Artifacts ─────────

export async function artifactUrl(jobId: string, name: string) {
  const r = await api<{ url: string }>(`/api/v1/jobs/${jobId}/artifacts/${encodeURIComponent(name)}`);
  return r.url;
}

export async function artifactJson<T>(jobId: string, name: string): Promise<T> {
  const url = await artifactUrl(jobId, name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return (await res.json()) as T;
}

export async function artifactBlobUrl(jobId: string, name: string) {
  const url = await artifactUrl(jobId, name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

export function hasArtifact(manifest: ResultManifest | null | undefined, name: string) {
  return !!manifest?.artifacts?.some((a) => a.name === name);
}

// ───────── Uploading generated blobs (composites, normalized GLB, thumbnails) ─────────

interface UploadInit { uploadId: string; multipart: boolean; putUrl: string | null; partUrls: { partNumber: number; url: string }[]; partSize: number }

/** Upload a File/Blob we generated in the browser and return its upload id. */
export async function uploadGenerated(toolSlug: string, file: File): Promise<string> {
  const init = await api<UploadInit>("/api/v1/uploads", { json: { toolSlug, fileName: file.name, sizeBytes: file.size, mime: file.type || undefined } });
  if (init.multipart) {
    const parts: { partNumber: number; etag: string }[] = [];
    for (const p of init.partUrls) {
      const start = (p.partNumber - 1) * init.partSize;
      const chunk = file.slice(start, Math.min(file.size, start + init.partSize));
      const res = await fetch(p.url, { method: "PUT", body: chunk });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      parts.push({ partNumber: p.partNumber, etag: res.headers.get("ETag") ?? `"part-${p.partNumber}"` });
    }
    await api(`/api/v1/uploads/${init.uploadId}/complete`, { json: { parts } });
  } else {
    const res = await fetch(init.putUrl!, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    await api(`/api/v1/uploads/${init.uploadId}/complete`, { json: {} });
  }
  return init.uploadId;
}

export function blobToFile(blob: Blob, name: string, type?: string) {
  return new File([blob], name, { type: type ?? blob.type ?? "application/octet-stream" });
}

// ───────── Local drafts ─────────

const DRAFT_PREFIX = "modsmith:draft:";

export function draftKey(slug: string, creationId?: string | null) {
  return `${DRAFT_PREFIX}${slug}${creationId ? `:${creationId}` : ""}`;
}

export function readDraft<T>(slug: string, creationId?: string | null): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(slug, creationId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function writeDraft(slug: string, value: unknown, creationId?: string | null) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(draftKey(slug, creationId), JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function clearDraft(slug: string, creationId?: string | null) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(draftKey(slug, creationId)); } catch { /* ignore */ }
}

/**
 * State that survives a reload. Values are written to localStorage (debounced) under the tool slug,
 * and to `projectState` by ToolFrame's "Save project" once a creation exists.
 */
export function useDraftState<T extends Record<string, unknown>>(slug: string, initial: T): [T, (patch: Partial<T> | ((prev: T) => T)) => void, boolean] {
  const [state, setState] = React.useState<T>(initial);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const saved = readDraft<T>(slug);
    if (saved) setState((prev) => ({ ...prev, ...saved }));
    setReady(true);
  }, [slug]);
  const update = React.useCallback((patch: Partial<T> | ((prev: T) => T)) => {
    setState((prev) => (typeof patch === "function" ? (patch as (p: T) => T)(prev) : { ...prev, ...patch }));
  }, []);
  React.useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => writeDraft(slug, state), 400);
    return () => clearTimeout(t);
  }, [slug, state, ready]);
  return [state, update, ready];
}

// ───────── Inspect jobs (free previews / analysis) ─────────

export interface InspectState {
  jobId: string | null;
  status: "idle" | "running" | "done" | "error";
  manifest: ResultManifest | null;
  facts: InspectFacts | null;
  creationId: string | null;
  error: string | null;
  errorCode: string | null;
}

const INITIAL_INSPECT: InspectState = { jobId: null, status: "idle", manifest: null, facts: null, creationId: null, error: null, errorCode: null };

/**
 * Starts a free `purpose: "inspect"` job and polls until the manifest is available.
 * Inspect jobs are short; a poll keeps this simple and works when SSE is proxied away.
 */
export function useInspect(toolSlug: string) {
  const [state, setState] = React.useState<InspectState>(INITIAL_INSPECT);
  const cancelled = React.useRef(false);
  React.useEffect(() => () => { cancelled.current = true; }, []);

  const start = React.useCallback(async (uploadIds: string[], config: Record<string, unknown> = {}, creationId?: string | null) => {
    setState({ ...INITIAL_INSPECT, status: "running" });
    try {
      const job = await api<{ id: string; creationId: string | null }>("/api/v1/jobs", {
        json: { toolSlug, uploadIds, config, purpose: "inspect", ...(creationId ? { creationId } : {}) },
      });
      setState((s) => ({ ...s, jobId: job.id, creationId: job.creationId }));
      const deadline = Date.now() + 10 * 60_000;
      for (;;) {
        if (cancelled.current) return null;
        await new Promise((r) => setTimeout(r, 1800));
        const detail = await api<JobDetail>(`/api/v1/jobs/${job.id}`);
        if (detail.status === "COMPLETED") {
          const manifest = (detail.resultManifest ?? {}) as ResultManifest & { facts?: InspectFacts };
          const creation = detail.creationId ? await api<CreationDetail>(`/api/v1/creations/${detail.creationId}`).catch(() => null) : null;
          const facts = (creation?.projectState?.preview?.facts ?? manifest.facts ?? {}) as InspectFacts;
          const next = { jobId: job.id, status: "done" as const, manifest, facts, creationId: detail.creationId, error: null, errorCode: null };
          if (!cancelled.current) setState(next);
          return next;
        }
        if (["FAILED", "CANCELLED", "REFUNDED"].includes(detail.status)) {
          const next = { ...INITIAL_INSPECT, jobId: job.id, status: "error" as const, error: detail.errorMessage ?? "Inspection failed", errorCode: detail.errorCode, creationId: detail.creationId };
          if (!cancelled.current) setState(next);
          return next;
        }
        if (Date.now() > deadline) {
          const next = { ...INITIAL_INSPECT, jobId: job.id, status: "error" as const, error: "Inspection is taking unusually long. Check the job log.", errorCode: null };
          if (!cancelled.current) setState(next);
          return next;
        }
      }
    } catch (err) {
      const next = { ...INITIAL_INSPECT, status: "error" as const, error: (err as Error).message, errorCode: (err as { code?: string }).code ?? null };
      if (!cancelled.current) setState(next);
      return next;
    }
  }, [toolSlug]);

  const reset = React.useCallback(() => setState(INITIAL_INSPECT), []);
  /** Adopt an inspect result that already exists (e.g. reloading a saved project). */
  const adopt = React.useCallback((jobId: string, manifest: ResultManifest, facts: InspectFacts, creationId: string | null) => {
    setState({ jobId, status: "done", manifest, facts, creationId, error: null, errorCode: null });
  }, []);

  return { ...state, start, reset, adopt };
}

// ───────── misc ─────────

export function snakeCase(value: string, fallback: string) {
  const s = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s || fallback;
}

export function formatVram(bytes: number) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}
