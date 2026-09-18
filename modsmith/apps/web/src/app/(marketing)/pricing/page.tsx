import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { BRAND, CREDITS, LIMITS } from "@modsmith/core";
import { getEffectiveTools } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { Button } from "@/components/ui/button";
import { Container, PageIntro, SectionHeading } from "@/components/marketing/section";
import { CreditGuarantees, PackGrid, PricingPlansSection } from "@/components/marketing/pricing";
import { ToolCostTable } from "@/components/marketing/tool-cost-table";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/marketing/json-ld";
import { loadPricing, siteUrl } from "@/components/marketing/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pay per export with credits that never expire, or subscribe for monthly credits and a discount on every export. Server Hub plans for logs, screenshots and phone media.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing · Modsmith", description: "Credits that never expire, free re-exports for 7 days, and subscriptions for creators and servers.", url: "/pricing" },
};

const FAQS: { q: string; text: string; a?: React.ReactNode }[] = [
  { q: "Do credits expire?", text: "No. Credits stay on your account until you spend them — there is no monthly reset and no expiry date. Credits included with a subscription are granted each billing period and also do not expire while your account is open." },
  { q: "What does a re-export cost?", text: `Nothing, within ${CREDITS.REEXPORT_WINDOW_DAYS} days. Re-exporting the same source file with the same configuration inside the ${CREDITS.REEXPORT_WINDOW_DAYS}-day window costs 0 credits; every creation shows the date its free window ends. Change the file or the settings and it counts as a new export.` },
  { q: "What happens if a job fails?", text: "You are charged when a build succeeds, not when it starts. If our infrastructure fails — a worker crash, a storage error, a timeout on our side — the credits are refunded to your balance automatically and the job is marked refunded. A build that fails because the source file is broken is reported with the reason so you can fix it and retry." },
  { q: "Who processes payments?", text: "Stripe. Checkout happens on Stripe's hosted page and card details never reach our servers; we store only the Stripe customer and subscription identifiers needed to manage your billing." },
  { q: "Can I cancel a subscription?", text: "Any time, from the billing portal. Your plan stays active until the end of the period you already paid for, and credits granted during that period remain yours." },
  { q: "Do I need a subscription to use the tools?", text: "No. Every tool works on pay-as-you-go credits. Subscriptions add monthly credits, an export discount, AI tools, higher free daily limits and queue priority." },
  { q: "What is included for free?", text: `A new account starts with ${CREDITS.SIGNUP_BONUS} credits, plus ${CREDITS.EMAIL_VERIFY_BONUS} for verifying your email and ${CREDITS.DISCORD_BONUS} for linking Discord. The Server Hub free tier includes ${Math.round(LIMITS.HUB_FREE_STORAGE_BYTES / 1024 ** 2)} MB of private media and ${LIMITS.HUB_DEFAULT_RETENTION_DAYS}-day log retention for one server.` },
  { q: "Can I buy a custom amount of credits?", text: "Yes. The custom pack lets you choose any amount within the listed range and shows the price before you check out." },
];

export default async function PricingPage() {
  const [user, { packs, plans }, tools] = await Promise.all([getCurrentUser(), loadPricing(), getEffectiveTools()]);
  const loggedIn = !!user;
  const enabled = tools.filter((t) => t.enabled);

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Product", name: `${BRAND.name} credits and plans`, url: `${siteUrl()}/pricing`,
        description: "Credits and subscriptions for building FiveM assets in the browser.",
        offers: packs.filter((p) => !p.isCustom).map((p) => ({ "@type": "Offer", name: p.name, price: (p.priceCents / 100).toFixed(2), priceCurrency: p.currency.toUpperCase(), category: "credit pack", url: `${siteUrl()}/pricing` })),
      }} />
      <PageIntro eyebrow="Pricing" title="Pay for what you export" description={`Credits are spent on successful builds only, never expire, and re-exporting the same file with the same settings within ${CREDITS.REEXPORT_WINDOW_DAYS} days is free. Subscribe if you export every week.`}>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href={loggedIn ? "/app" : "/register"}>{loggedIn ? "Open workshop" : `Start with ${CREDITS.SIGNUP_BONUS} free credits`} <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="#tool-costs">See cost per tool</Link></Button>
        </div>
      </PageIntro>

      <Container className="py-12 sm:py-16">
        <section aria-labelledby="packs-heading">
          <SectionHeading title="Credit packs" description="One-off top-ups. Larger packs include bonus credits; the custom pack lets you pick any amount." className="mb-6" />
          <h2 id="packs-heading" className="sr-only">Credit packs</h2>
          <PackGrid packs={packs} loggedIn={loggedIn} />
          <div className="mt-6"><CreditGuarantees reexportDays={CREDITS.REEXPORT_WINDOW_DAYS} /></div>
        </section>

        <section className="mt-16" aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="sr-only">Subscription plans</h2>
          <PricingPlansSection plans={plans} loggedIn={loggedIn} />
        </section>

        <section id="tool-costs" className="mt-16 scroll-mt-24" aria-labelledby="costs-heading">
          <SectionHeading title="Cost per tool" description="The credit cost of one successful export. Subscriptions apply their discount on top of these prices." className="mb-6" />
          <h2 id="costs-heading" className="sr-only">Cost per tool</h2>
          <ToolCostTable tools={enabled} />
          <p className="mt-3 text-xs text-fg-subtle">The Server Hub is free to use on the included tier; paid Server Hub plans raise storage, retention and server count instead of charging credits.</p>
        </section>

        <section className="mt-16" aria-labelledby="faq-heading">
          <SectionHeading title="Questions about billing" className="mb-6" />
          <h2 id="faq-heading" className="sr-only">Billing FAQ</h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3 text-sm leading-6 text-fg-muted">{f.a ?? f.text}</div>
              </details>
            ))}
          </div>
          <p className="mt-4 text-sm text-fg-muted">Anything else? Email <a href={`mailto:${BRAND.supportEmail}`} className="text-accent underline underline-offset-4">{BRAND.supportEmail}</a> or read the <Link href="/terms" className="text-accent underline underline-offset-4">Terms</Link>.</p>
        </section>
      </Container>

      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } })) }} />
      <CtaBand loggedIn={loggedIn} title="Start free, pay when you ship." />
    </>
  );
}
