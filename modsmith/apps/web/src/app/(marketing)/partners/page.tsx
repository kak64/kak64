import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, Mail } from "lucide-react";
import { BRAND, CREDITS } from "@modsmith/core";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Container, PageIntro, SectionHeading } from "@/components/marketing/section";
import { PartnerCard } from "@/components/marketing/partner-card";
import { loadPartners } from "@/components/marketing/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partners",
  description: "Communities, studios and creators building FiveM assets with Modsmith. Join through a partner link for bonus credits, or apply to become a partner.",
  alternates: { canonical: "/partners" },
  openGraph: { title: "Partners · Modsmith", description: "Communities, studios and creators building with Modsmith.", url: "/partners" },
};

const BENEFITS = [
  { title: "Bonus credits for your members", text: "Everyone who signs up through your link starts with extra credits on top of the standard welcome bonus." },
  { title: "A page of your own", text: "Your logo, description, links and a full write-up on a Modsmith partner page that we keep indexed." },
  { title: "Direct line to the team", text: "A shared channel for bug reports, feature requests and early access to tools before they go public." },
];

export default async function PartnersPage() {
  const partners = await loadPartners();
  const subject = encodeURIComponent("Partner application");
  const body = encodeURIComponent("Community or studio name:\nWhat you build / your audience:\nDiscord invite:\nWebsite:\n");
  return (
    <>
      <PageIntro eyebrow="Partners" title="Communities and studios building with Modsmith" description="Partners run servers, ship asset packs and teach other creators. Joining through a partner link gives you bonus credits on signup — and gives them credit for the referral." />
      <Container className="py-12">
        {partners.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((p) => <li key={p.slug}><PartnerCard p={p} /></li>)}
          </ul>
        ) : (
          <EmptyState icon={Handshake} title="No partners listed yet" description="We are onboarding the first communities and studios. If that sounds like you, get in touch." action={{ label: "Become a partner", href: "#become" }} />
        )}

        <section id="become" className="mt-16 scroll-mt-24" aria-labelledby="become-heading">
          <SectionHeading eyebrow="Partner programme" title="Become a partner" description="If you run a community, a studio or a creator channel in the FiveM space, we would like to work with you." className="mb-8" />
          <h2 id="become-heading" className="sr-only">Become a partner</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-lg border border-border bg-bg-elevated p-5">
                <h3 className="text-sm font-semibold text-fg">{b.title}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{b.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-4 rounded-lg border border-accent/40 bg-accent-soft/30 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-fg">Tell us what you are building</h3>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">Send us your community or studio name, what you make and where your audience is. We answer every application, and we say no politely when it is not a fit.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild><a href={`mailto:${BRAND.supportEmail}?subject=${subject}&body=${body}`}><Mail /> Email us</a></Button>
              <Button asChild variant="outline"><a href={BRAND.discordInvite} target="_blank" rel="noopener noreferrer">Ask in Discord</a></Button>
            </div>
          </div>
          <p className="mt-4 text-xs text-fg-subtle">Referral rewards for individual creators work differently — every account has a personal referral code worth {CREDITS.REFERRAL_REWARD.toLocaleString("en-US")} credits. See <Link href="/app/referrals" className="text-accent underline underline-offset-4">Referrals</Link> in your account.</p>
        </section>
      </Container>
    </>
  );
}
