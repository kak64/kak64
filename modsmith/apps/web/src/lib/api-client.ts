"use client";
import type { ApiResponse } from "@modsmith/core";

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|; )ms_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const method = (init.method ?? (init.json !== undefined ? "POST" : "GET")).toUpperCase();
  if (method !== "GET") headers.set("x-csrf-token", csrfToken());
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, method, headers, body, credentials: "same-origin" });
  let payload: ApiResponse<T> | null = null;
  try { payload = (await res.json()) as ApiResponse<T>; } catch { /* non-json */ }
  if (!payload) throw new ApiClientError("NETWORK", `Request failed (${res.status})`, res.status);
  if (!payload.success) throw new ApiClientError(payload.error.code, payload.error.message, res.status, payload.error.details);
  return payload.data;
}

export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiClientError && err.details && typeof err.details === "object") return err.details as Record<string, string>;
  return {};
}
