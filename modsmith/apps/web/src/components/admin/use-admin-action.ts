"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";

export function adminErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === "VALIDATION_ERROR" && err.details && typeof err.details === "object") {
      const first = Object.entries(err.details as Record<string, string>)[0];
      if (first) return first[0] === "_" ? first[1] : `${first[0]}: ${first[1]}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

type RunOptions = { success?: string; refresh?: boolean; silent?: boolean };

/** Runs an admin API mutation with busy tracking, toasts and optional router.refresh(). */
export function useAdminAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, opts: RunOptions = {}): Promise<T | undefined> => {
    setBusy(key);
    try {
      const result = await fn();
      if (opts.success) toast({ title: opts.success, variant: "success" });
      if (opts.refresh !== false) router.refresh();
      return result;
    } catch (err) {
      if (!opts.silent) toast({ title: "Action failed", description: adminErrorMessage(err), variant: "danger" });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [router, toast]);
  return { run, busy, isBusy: (key: string) => busy === key };
}
