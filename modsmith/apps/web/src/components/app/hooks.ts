"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";

/** Human-readable message for any thrown error, with rate-limit retry hints. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === "RATE_LIMITED") {
      const ms = (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
      return ms ? `Too many requests. Try again in ${Math.ceil(ms / 1000)}s.` : err.message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

export function retryAfterSeconds(err: unknown): number | null {
  if (err instanceof ApiClientError && err.code === "RATE_LIMITED") {
    const ms = (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
    return ms ? Math.ceil(ms / 1000) : null;
  }
  return null;
}

export function loginRedirect(router: { push: (href: string) => void }) {
  const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app";
  router.push(`/login?next=${encodeURIComponent(next)}`);
}

type RunOptions = {
  success?: string;
  /** Do not toast on error (caller renders the error inline). */
  silent?: boolean;
  refresh?: boolean;
  /** Return true when the error was handled inline. */
  onError?: (err: unknown) => boolean | void;
};

/**
 * Runs an async API action with a busy key, success toast, error toast and 401 → /login redirect.
 * Resolves to undefined when the action failed.
 */
export function useApiAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, opts: RunOptions = {}): Promise<T | undefined> => {
    setBusy(key);
    try {
      const result = await fn();
      if (opts.success) toast({ title: opts.success, variant: "success" });
      if (opts.refresh) router.refresh();
      return result;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { loginRedirect(router); return undefined; }
      if (opts.onError?.(err)) return undefined;
      if (!opts.silent) toast({ title: "Something went wrong", description: errorMessage(err), variant: "danger" });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [router, toast]);
  return { run, busy, isBusy: (key: string) => busy === key };
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
