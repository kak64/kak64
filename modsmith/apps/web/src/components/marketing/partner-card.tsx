import Link from "next/link";
import { ExternalLink, Gift, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PartnerCardItem = { slug: string; name: string; description: string; category: string; logoUrl: string | null; website: string | null; discordUrl: string | null; youtubeUrl: string | null; referralCode: string; bonusCredits: number };

export function PartnerLogo({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg-muted text-sm font-semibold text-fg-muted", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- partner-supplied external logo
        <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a13 13 0 0 1 4.5 2.3 15.6 15.6 0 0 0-15.4 0 13 13 0 0 1 4.5-2.3L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 0 13.4.3 17.8a20 20 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a20 20 0 0 0 6-3c.4-5.1-.7-9.5-3.4-13.4ZM8.5 15.1c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4c1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /></svg>
  );
}

export function PartnerLinks({ p, className }: { p: Pick<PartnerCardItem, "website" | "discordUrl" | "youtubeUrl" | "name">; className?: string }) {
  const cls = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-bg-subtle hover:text-fg";
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" className={cls}><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Website<span className="sr-only"> of {p.name}</span></a> : null}
      {p.discordUrl ? <a href={p.discordUrl} target="_blank" rel="noopener noreferrer" className={cls}><DiscordIcon className="h-3.5 w-3.5" /> Discord<span className="sr-only"> of {p.name}</span></a> : null}
      {p.youtubeUrl ? <a href={p.youtubeUrl} target="_blank" rel="noopener noreferrer" className={cls}><Youtube className="h-3.5 w-3.5" aria-hidden /> YouTube<span className="sr-only"> of {p.name}</span></a> : null}
    </div>
  );
}

export function PartnerCard({ p, compact = false }: { p: PartnerCardItem; compact?: boolean }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-5 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3">
        <PartnerLogo name={p.name} logoUrl={p.logoUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-fg"><Link href={`/partners/${p.slug}`} className="hover:text-accent">{p.name}</Link></h3>
          <Badge className="mt-1">{p.category}</Badge>
        </div>
      </div>
      {!compact ? <p className="mt-3 flex-1 text-sm leading-6 text-fg-muted">{p.description}</p> : null}
      <PartnerLinks p={p} className={compact ? "mt-3" : "mt-4"} />
      {!compact ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <Button asChild size="sm" variant="secondary"><Link href={`/register?partner=${encodeURIComponent(p.referralCode)}`}>Join via partner link</Link></Button>
          {p.bonusCredits > 0 ? <p className="inline-flex items-center gap-1 text-xs text-fg-muted"><Gift className="h-3.5 w-3.5 text-accent" aria-hidden /> +{p.bonusCredits.toLocaleString("en-US")} bonus credits on signup</p> : null}
        </div>
      ) : null}
    </article>
  );
}
