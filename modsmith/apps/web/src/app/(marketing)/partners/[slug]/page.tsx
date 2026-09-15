import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gift } from "lucide-react";
import { prisma } from "@modsmith/db";
import { BRAND } from "@modsmith/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/section";
import { PartnerLinks, PartnerLogo } from "@/components/marketing/partner-card";
import { JsonLd } from "@/components/marketing/json-ld";
import { renderMarkdown } from "@/components/marketing/markdown";
import { signedOrNull, siteUrl } from "@/components/marketing/data";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return prisma.partner.findFirst({ where: { slug, active: true } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "Partner not found" };
  return {
    title: p.name,
    description: p.description.slice(0, 160),
    alternates: { canonical: `/partners/${p.slug}` },
    openGraph: { title: `${p.name} · ${BRAND.name} partner`, description: p.description.slice(0, 160), url: `/partners/${p.slug}` },
  };
}

export default async function PartnerPage({ params }: Params) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const logoUrl = p.logoUrl ?? (await signedOrNull(p.logoKey));
  const { html } = p.pageContent ? renderMarkdown(p.pageContent) : { html: "" };
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: p.name, description: p.description, url: p.website ?? `${siteUrl()}/partners/${p.slug}`, logo: logoUrl ?? undefined, sameAs: [p.website, p.discordUrl, p.youtubeUrl, p.twitterUrl].filter(Boolean) }} />
      <div className="border-b border-border bg-bg-elevated/40">
        <Container className="py-10 sm:py-14">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm">
            <Link href="/partners" className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All partners</Link>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <PartnerLogo name={p.name} logoUrl={logoUrl} className="h-16 w-16 text-lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold tracking-tight text-fg">{p.name}</h1>
              <Badge className="mt-2">{p.category}</Badge>
              <p className="mt-3 max-w-2xl text-base leading-7 text-fg-muted">{p.description}</p>
              <PartnerLinks p={p} className="mt-4 -ml-2" />
            </div>
          </div>
        </Container>
      </div>
      <Container className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="min-w-0">
          {html ? <div className="prose-dark max-w-none" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-fg-muted">{p.description}</p>}
        </article>
        <aside>
          <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-fg">Join via {p.name}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-muted">
              Signing up with this partner link credits {p.name} for the referral{p.bonusCredits > 0 ? <> and starts your account with <strong className="text-fg">{p.bonusCredits.toLocaleString("en-US")} bonus credits</strong> on top of the standard welcome bonus</> : null}.
            </p>
            <Button asChild className="mt-4 w-full"><Link href={`/register?partner=${encodeURIComponent(p.referralCode)}`}>Create account with partner link</Link></Button>
            {p.bonusCredits > 0 ? <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-fg-subtle"><Gift className="h-3.5 w-3.5 text-accent" aria-hidden /> +{p.bonusCredits.toLocaleString("en-US")} credits applied at signup</p> : null}
            <p className="mt-4 border-t border-border pt-4 text-xs text-fg-subtle">Want your community listed here? <Link href="/partners#become" className="text-accent underline underline-offset-4">Become a partner</Link>.</p>
          </div>
        </aside>
      </Container>
    </>
  );
}
