import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, Cpu, Images, Star, Users } from "lucide-react";
import { prisma } from "@modsmith/db";
import { BRAND, CREDITS, SUPPORTED_INPUT_FORMATS, TOOL_CATEGORIES } from "@modsmith/core";
import { getEffectiveTools } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Container, Section, SectionHeading } from "@/components/marketing/section";
import { ToolCard } from "@/components/marketing/tool-card";
import { ProductDemo } from "@/components/marketing/product-demo";
import { WorkflowCompare } from "@/components/marketing/workflow-compare";
import { ShowcaseCard } from "@/components/marketing/showcase-card";
import { ReviewCard } from "@/components/marketing/review-card";
import { PartnerLogo, PartnerLinks } from "@/components/marketing/partner-card";
import { PricingPreview } from "@/components/marketing/pricing";
import { ToolCostTable } from "@/components/marketing/tool-cost-table";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/marketing/json-ld";
import { loadPartners, loadPricing, showcaseCardSelect, siteUrl, toShowcaseCards } from "@/components/marketing/data";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — Build FiveM assets in your browser` },
  description: "Turn models, textures and ideas into complete FiveM resources from a browser tab. Props, vehicles, liveries, clothing, weapon skins, tattoos and optimization — no Blender, CodeWalker, OpenIV, ZModeler or Windows required.",
  alternates: { canonical: "/" },
  openGraph: { title: `${BRAND.name} — Build FiveM assets in your browser`, description: "Upload, configure, preview, export. Complete FiveM resources without installing anything.", url: "/" },
};

function stat(n: number) {
  return n > 0 ? n.toLocaleString("en-US") : "—";
}

export default async function HomePage() {
  const [user, tools, creations, jobs, creators, showcaseCount, showcaseRaw, reviews, partners, pricing] = await Promise.all([
    getCurrentUser(),
    getEffectiveTools(),
    prisma.creation.count({ where: { status: "READY", deletedAt: null } }),
    prisma.processingJob.count({ where: { status: "COMPLETED" } }),
    prisma.user.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.showcaseItem.count({ where: { status: "PUBLISHED" } }),
    prisma.showcaseItem.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 6, select: showcaseCardSelect }),
    prisma.review.findMany({ where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 3, include: { user: { select: { username: true, avatarUrl: true } } } }),
    loadPartners(),
    loadPricing(),
  ]);
  const showcase = await toShowcaseCards(showcaseRaw);
  const enabledTools = tools.filter((t) => t.enabled);
  const loggedIn = !!user;
  const stats = [
    { label: "Resources exported", value: stat(creations), icon: Boxes },
    { label: "Jobs completed", value: stat(jobs), icon: CheckCircle2 },
    { label: "Registered creators", value: stat(creators), icon: Users },
    { label: "Showcase items", value: stat(showcaseCount), icon: Images },
  ];

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND.name, applicationCategory: "DesignApplication", operatingSystem: "Web browser", url: siteUrl(), description: metadata.description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: `${CREDITS.SIGNUP_BONUS} free credits on signup` } }} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <Container className="relative py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="accent" className="mb-5 px-3 py-1 text-xs">Browser-based FiveM asset workshop</Badge>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl md:text-6xl">
              Build FiveM assets in your browser. <span className="text-fg-muted">Nothing to install.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-fg-muted sm:text-lg">
              Upload a model or texture, tweak it in a live 3D editor and download a complete, streaming-ready resource. No Blender, no CodeWalker, no OpenIV, no ZModeler and no Windows machine required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {loggedIn ? (
                <Button asChild size="lg"><Link href="/app">Open workshop <ArrowRight /></Link></Button>
              ) : (
                <Button asChild size="lg"><Link href="/register">Create free account <ArrowRight /></Link></Button>
              )}
              <Button asChild size="lg" variant="outline"><Link href="/#tools">Try a tool</Link></Button>
            </div>
            <p className="mt-4 text-xs text-fg-subtle">No card required · {CREDITS.SIGNUP_BONUS} free credits</p>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Supported input formats">
              {SUPPORTED_INPUT_FORMATS.map((f) => (
                <li key={f} className="rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-fg-muted">{f}</li>
              ))}
            </ul>
          </div>
          <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-bg-elevated/80 p-4 backdrop-blur">
                <dt className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{s.label}<s.icon className="h-4 w-4" aria-hidden /></dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums text-fg">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Toolbox */}
      <Section id="tools">
        <SectionHeading eyebrow="Toolbox" title="One workshop, every asset type" description="Each tool is a full pipeline: validation, conversion, collision, LODs, textures and packaging run on our workers, and you get a ZIP that streams." />
        <div className="space-y-12">
          {TOOL_CATEGORIES.map((cat) => {
            const list = enabledTools.filter((t) => t.category === cat.key);
            if (!list.length) return null;
            return (
              <div key={cat.key}>
                <div className="mb-4 flex items-baseline gap-3">
                  <h3 className="text-lg font-semibold text-fg">{cat.label}</h3>
                  <p className="text-sm text-fg-muted">{cat.blurb}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => <ToolCard key={t.slug} tool={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Demo */}
      <Section id="demo" tone="elevated">
        <SectionHeading eyebrow="How it works" title="From upload to ZIP in five steps" description="Every tool follows the same shape. Here is the Prop Creator, step by step." />
        <ProductDemo />
      </Section>

      {/* Compare */}
      <Section id="compare">
        <SectionHeading eyebrow="Why it matters" title="Nine tools became one tab" description="The manual pipeline works, if you have a Windows PC, a week of evenings and patience for plugin updates. This is what we replaced." />
        <WorkflowCompare />
      </Section>

      {/* Showcase */}
      <Section id="showcase" tone="elevated">
        <SectionHeading eyebrow="Showcase" title="Built with Modsmith" description="Public creations from the community. Creators decide what is public and whether downloads are allowed." action={<Button asChild variant="outline"><Link href="/showcase">Browse the showcase <ArrowRight /></Link></Button>} />
        {showcase.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.map((i) => <ShowcaseCard key={i.slug} item={i} />)}
          </div>
        ) : (
          <EmptyState icon={Images} title="The showcase is warming up" description="Published creations will appear here. Export something and publish it from My Creations to be first." action={{ label: loggedIn ? "Open workshop" : "Create free account", href: loggedIn ? "/app" : "/register" }} />
        )}
      </Section>

      {/* Reviews */}
      <Section id="reviews">
        <SectionHeading eyebrow="Reviews" title="What creators say" description="Reviews are written by users who have completed at least one export and are approved before they are shown." action={<Button asChild variant="outline"><Link href="/reviews">All reviews</Link></Button>} />
        {reviews.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        ) : (
          <EmptyState icon={Star} title="Reviews from creators will appear here once approved" description="We only show reviews from accounts with a completed export, after moderation." />
        )}
      </Section>

      {/* Partners */}
      <Section id="partners" tone="elevated">
        <SectionHeading eyebrow="Partners" title="Communities and studios building with us" action={<Button asChild variant="outline"><Link href="/partners#become">Become a partner</Link></Button>} />
        {partners.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((p) => (
              <li key={p.slug} className="flex items-center gap-3 rounded-lg border border-border bg-bg p-4">
                <PartnerLogo name={p.name} logoUrl={p.logoUrl} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <Link href={`/partners/${p.slug}`} className="block truncate text-sm font-semibold text-fg hover:text-accent">{p.name}</Link>
                  <div className="text-xs text-fg-subtle">{p.category}</div>
                  <PartnerLinks p={p} className="mt-1 -ml-2" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No partners listed yet" description="Communities, studios and creators can partner with Modsmith and offer bonus credits to their members." action={{ label: "Become a partner", href: "/partners#become" }} />
        )}
      </Section>

      {/* Pricing */}
      <Section id="pricing">
        <SectionHeading eyebrow="Pricing" title="Pay per export, or subscribe and save" description="Credits are charged only when a build succeeds. Failed jobs are refunded automatically." action={<Button asChild variant="outline"><Link href="/pricing">Full pricing</Link></Button>} />
        <PricingPreview packs={pricing.packs} plans={pricing.plans} loggedIn={loggedIn} reexportDays={CREDITS.REEXPORT_WINDOW_DAYS} />
        <div className="mt-10">
          <h3 className="mb-4 text-lg font-semibold text-fg">Cost per tool</h3>
          <ToolCostTable tools={enabledTools} />
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild><Link href={loggedIn ? "/app" : "/register"}>{loggedIn ? "Open workshop" : "Create free account"} <ArrowRight /></Link></Button>
          <Button asChild variant="ghost"><Link href="/pricing">Compare all plans</Link></Button>
        </div>
      </Section>

      <section className="border-t border-border bg-bg-elevated/40">
        <Container className="grid gap-6 py-12 sm:grid-cols-3">
          {[
            { icon: Cpu, title: "Workers, not your laptop", text: "Heavy conversions run in a queue on our infrastructure. Close the tab and come back to a finished ZIP." },
            { icon: CheckCircle2, title: "Validated before it costs anything", text: "Files are checked by real MIME type, size and archive safety before a credit is touched." },
            { icon: Boxes, title: "Complete resources", text: "fxmanifest, stream folder, metadata and scripts. Copy to resources/, ensure, done." },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="text-sm font-semibold text-fg">{f.title}</h3>
                <p className="mt-1 text-sm leading-6 text-fg-muted">{f.text}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      <CtaBand loggedIn={loggedIn} />
    </>
  );
}
