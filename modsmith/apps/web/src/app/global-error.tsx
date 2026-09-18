"use client";
import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself. It must render its own
 * <html>/<body>, and it cannot rely on the app's providers or styles being available.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0c10", color: "#e7eaf0", fontFamily: "Inter, system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <p style={{ color: "#ef4444", fontSize: 14, margin: 0, fontFamily: "ui-monospace, monospace" }}>Application error</p>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "12px 0 0" }}>Modsmith could not start this page</h1>
          <p style={{ color: "#98a2b3", fontSize: 14, maxWidth: 420, margin: "12px auto 0", lineHeight: 1.6 }}>
            Reload to try again. If it keeps happening, the status of every dependency is on our side, not yours.
          </p>
          {error.digest ? <p style={{ color: "#667085", fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 8 }}>Reference: {error.digest}</p> : null}
          <button onClick={reset} style={{ marginTop: 28, background: "#f97316", color: "#0a0c10", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
