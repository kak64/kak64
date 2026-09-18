import Link from "next/link";
import { BRAND } from "@modsmith/core";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("h-7 w-7", className)}>
      <rect width="64" height="64" rx="14" fill="var(--color-bg-subtle)" />
      <path d="M14 44 L32 14 L50 44 Z" fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M22 44 L32 28 L42 44" fill="none" stroke="var(--color-fg)" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-md font-semibold tracking-tight text-fg", className)} aria-label={`${BRAND.name} home`}>
      <LogoMark />
      <span>{BRAND.name}</span>
    </Link>
  );
}
