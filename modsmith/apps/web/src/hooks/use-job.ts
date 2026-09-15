"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

export type JobStatus = "PENDING" | "QUEUED" | "PROCESSING" | "PACKAGING" | "COMPLETED" | "FAILED" | "CANCELLED" | "REFUNDED";
export interface JobEvent { jobId: string; status?: JobStatus; stage?: string; progress?: number; message?: string; level?: string; at?: number; replay?: boolean }
export interface JobState { status: JobStatus; stage: string | null; progress: number; message: string | null; log: JobEvent[]; done: boolean }

export const TERMINAL: JobStatus[] = ["COMPLETED", "FAILED", "CANCELLED", "REFUNDED"];

/** Subscribes to a job's SSE stream with polling fallback; survives reloads (replays current state). */
export function useJob(jobId: string | null | undefined) {
  const [state, setState] = useState<JobState | null>(null);
  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (!jobId) { setState(null); return; }
    let closed = false;
    const apply = (ev: JobEvent) => setState((prev) => {
      const status = ev.status ?? prev?.status ?? "QUEUED";
      const done = TERMINAL.includes(status);
      return { status, stage: ev.stage ?? prev?.stage ?? null, progress: ev.progress ?? prev?.progress ?? 0, message: ev.message ?? (ev.stage && ev.stage !== prev?.stage ? null : prev?.message ?? null), log: [...(prev?.log ?? []), ev].slice(-200), done };
    });
    const es = new EventSource(`/api/v1/jobs/${jobId}/events`);
    esRef.current = es;
    es.onmessage = (m) => { try { const ev = JSON.parse(m.data) as JobEvent; apply(ev); if (ev.status && TERMINAL.includes(ev.status)) es.close(); } catch { /* ignore */ } };
    es.onerror = () => {
      // Fallback to polling while the stream is unavailable
      es.close();
      const poll = async () => {
        if (closed) return;
        try {
          const j = await api<{ status: JobStatus; stage: string | null; progress: number; errorMessage: string | null }>(`/api/v1/jobs/${jobId}`);
          apply({ jobId, status: j.status, stage: j.stage ?? undefined, progress: j.progress, message: j.errorMessage ?? undefined });
          if (!TERMINAL.includes(j.status)) setTimeout(poll, 2500);
        } catch { setTimeout(poll, 5000); }
      };
      poll();
    };
    return () => { closed = true; es.close(); };
  }, [jobId]);
  return state;
}
