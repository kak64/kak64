"use client";
import { Check, Circle } from "lucide-react";
import { LIMITS } from "@modsmith/core";
import { cn } from "@/lib/utils";

export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "len", label: `At least ${LIMITS.PASSWORD_MIN} characters`, test: (p) => p.length >= LIMITS.PASSWORD_MIN },
  { key: "case", label: "Upper and lower case letters", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { key: "num", label: "A number or symbol", test: (p) => /[\d\W_]/.test(p) },
];

/** Live password requirement hints. Only the length rule is enforced server-side; the rest are guidance. */
export function PasswordHints({ password, className }: { password: string; className?: string }) {
  return (
    <ul className={cn("mt-2 space-y-1 text-xs", className)} aria-live="polite">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.key} className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-fg-subtle")}>
            {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
            {r.label}{r.key !== "len" ? <span className="text-fg-subtle"> (recommended)</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
