"use client";
import { useCallback, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";

export type UploadStatus = "queued" | "hashing" | "uploading" | "verifying" | "done" | "error" | "cancelled";
export interface UploadItem {
  localId: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0-100
  speedBps: number;
  etaSeconds: number | null;
  error: string | null;
  uploadId: string | null;
  sha256: string | null;
}

interface InitResponse { uploadId: string; multipart: boolean; putUrl: string | null; partUrls: { partNumber: number; url: string }[]; partSize: number }

async function sha256Hex(file: File): Promise<string | null> {
  if (file.size > 256 * 1024 * 1024 || !crypto.subtle) return null; // skip hashing very large files client-side
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function xhrPut(url: string, body: Blob, mime: string | undefined, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (mime) xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

/**
 * Upload manager: init → direct-to-storage PUT (single or multipart) → complete (server sniffs + hashes).
 * Reports progress, speed, ETA; supports cancel/retry/remove.
 */
export function useUpload(toolSlug: string) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef<Map<string, AbortController>>(new Map());

  const update = useCallback((localId: string, patch: Partial<UploadItem>) => setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i))), []);

  const run = useCallback(async (item: UploadItem) => {
    const ctrl = new AbortController();
    controllers.current.set(item.localId, ctrl);
    const started = Date.now();
    try {
      update(item.localId, { status: "hashing", error: null, progress: 0 });
      const digest = await sha256Hex(item.file);
      update(item.localId, { sha256: digest, status: "uploading" });
      const init = await api<InitResponse>("/api/v1/uploads", { json: { toolSlug, fileName: item.file.name, sizeBytes: item.file.size, mime: item.file.type || undefined } });
      update(item.localId, { uploadId: init.uploadId });
      const total = item.file.size;
      let uploadedBase = 0;
      const onProgress = (loaded: number) => {
        const done = uploadedBase + loaded;
        const elapsed = (Date.now() - started) / 1000;
        const speed = elapsed > 0 ? done / elapsed : 0;
        update(item.localId, { progress: Math.min(99, Math.round((done / total) * 100)), speedBps: speed, etaSeconds: speed > 0 ? Math.max(0, Math.round((total - done) / speed)) : null });
      };
      let parts: { partNumber: number; etag: string }[] | undefined;
      if (init.multipart) {
        parts = [];
        for (const p of init.partUrls) {
          const start = (p.partNumber - 1) * init.partSize;
          const chunk = item.file.slice(start, Math.min(total, start + init.partSize));
          const etag = await xhrPut(p.url, chunk, undefined, onProgress, ctrl.signal);
          parts.push({ partNumber: p.partNumber, etag: etag ?? `"part-${p.partNumber}"` });
          uploadedBase += chunk.size;
        }
      } else {
        await xhrPut(init.putUrl!, item.file, item.file.type || "application/octet-stream", onProgress, ctrl.signal);
      }
      update(item.localId, { status: "verifying", progress: 99 });
      await api(`/api/v1/uploads/${init.uploadId}/complete`, { json: { parts, sha256: digest ?? undefined } });
      update(item.localId, { status: "done", progress: 100, etaSeconds: 0 });
    } catch (err) {
      if ((err as DOMException).name === "AbortError") { update(item.localId, { status: "cancelled", error: null }); return; }
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message;
      update(item.localId, { status: "error", error: msg });
    } finally {
      controllers.current.delete(item.localId);
    }
  }, [toolSlug, update]);

  const add = useCallback((files: File[] | FileList) => {
    const list = Array.from(files).map<UploadItem>((file) => ({ localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, status: "queued", progress: 0, speedBps: 0, etaSeconds: null, error: null, uploadId: null, sha256: null }));
    setItems((prev) => [...prev, ...list]);
    list.forEach((i) => run(i));
    return list;
  }, [run]);

  const cancel = useCallback((localId: string) => { controllers.current.get(localId)?.abort(); }, []);
  const retry = useCallback((localId: string) => { const item = items.find((i) => i.localId === localId); if (item) run({ ...item, status: "queued", error: null, uploadId: null }); }, [items, run]);
  const remove = useCallback(async (localId: string) => {
    const item = items.find((i) => i.localId === localId);
    controllers.current.get(localId)?.abort();
    setItems((prev) => prev.filter((i) => i.localId !== localId));
    if (item?.uploadId) api(`/api/v1/uploads/${item.uploadId}`, { method: "DELETE" }).catch(() => {});
  }, [items]);
  const reset = useCallback(() => { controllers.current.forEach((c) => c.abort()); setItems([]); }, []);

  const completed = items.filter((i) => i.status === "done" && i.uploadId);
  return { items, add, cancel, retry, remove, reset, completed, uploadIds: completed.map((i) => i.uploadId!), busy: items.some((i) => ["hashing", "uploading", "verifying"].includes(i.status)) };
}
