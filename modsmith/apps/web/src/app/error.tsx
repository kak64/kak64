"use client";
import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: keeps the shell usable and offers a real way forward. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-sm text-danger">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">We could not load this page</h1>
      <p className="mt-3 max-w-md text-sm text-fg-muted">
        The problem has been logged. Nothing you were working on was lost — creations and credits are stored server-side.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-fg-subtle">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}><RefreshCw /> Try again</Button>
        <Button asChild variant="outline"><Link href="/app">Back to the workshop</Link></Button>
      </div>
    </main>
  );
}
