import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@modsmith/core";
import { Logo } from "@/components/app/sidebar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid-bg flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to home</Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-xl sm:p-8">{children}</div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-fg-subtle">
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
        <Link href="/terms" className="hover:text-fg">Terms</Link>
        <Link href="/privacy" className="hover:text-fg">Privacy</Link>
        <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-fg">Support</a>
      </footer>
    </div>
  );
}
