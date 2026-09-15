import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare } from "lucide-react";
import { BRAND } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { Container, PageIntro } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${BRAND.name} exists: making FiveM asset creation possible from any machine, without a stack of desktop tools, and how to reach the people who build it.`,
  alternates: { canonical: "/about" },
  openGraph: { title: `About · ${BRAND.name}`, url: "/about" },
};

const PRINCIPLES = [
  { title: "The browser is the workstation", text: "If a task needs a Windows PC, four installers and a forum thread, it is a tooling problem, not a skill problem. Everything we build runs in a tab and works the same on a laptop, a Mac or a school computer." },
  { title: "You keep what you make", text: "Your uploads and exports are yours. Nothing becomes public unless you publish it, source files are deleted after processing, and we do not train models on your work." },
  { title: "Charge for results, not attempts", text: "Credits are spent when a build succeeds. If our infrastructure drops a job, the credits come back automatically — you should never pay for our bad day." },
  { title: "Explain the format, not just the button", text: "Our guides cover what a .ydr actually is and why expanded VRAM is not ZIP size, because creators who understand the pipeline ship better resources." },
];

export default async function AboutPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageIntro eyebrow="About" title="Asset creation should not require a second computer" description={`${BRAND.name} started with a simple frustration: building a single prop for a FiveM server meant installing Blender, a plugin stack, CodeWalker and OpenIV, then hand-writing metadata and a manifest — on Windows, or not at all.`} />
      <Container className="py-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-2xl space-y-5 text-base leading-7 text-fg-muted">
            <p>Thousands of people run or contribute to FiveM communities. Most of them are not 3D artists and have no interest in becoming pipeline engineers — they just want a working prop, a proper add-on vehicle, a livery that lines up with the UVs, or a clothing pack their framework can read.</p>
            <p>So we moved the pipeline to a server. You upload what you already have, position and configure it in a live 3D viewport, and a worker does the conversion, collision, LODs, texture packing and manifest generation. What comes back is a complete resource folder, not a file you still have to assemble.</p>
            <p>The same idea drove the Server Hub. Server owners were grepping raw console dumps and passing screenshots around in Discord; structured logging, private screenshot capture and safe phone-media storage are solved problems everywhere else, so we shipped them for FiveM with one small resource and a write-only token.</p>
            <p>{BRAND.name} is an independent product, built by a small team that runs and plays on these servers. It is not affiliated with Rockstar Games, Take-Two or Cfx.re.</p>
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-bg-elevated p-5">
              <h2 className="text-sm font-semibold text-fg">Talk to us</h2>
              <p className="mt-2 text-sm leading-6 text-fg-muted">Bug reports, feature requests, partnership ideas and &quot;why does my prop float&quot; — all welcome. Real people answer.</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild variant="secondary" size="sm"><a href={`mailto:${BRAND.supportEmail}`}><Mail /> {BRAND.supportEmail}</a></Button>
                <Button asChild variant="secondary" size="sm"><a href={BRAND.discordInvite} target="_blank" rel="noopener noreferrer"><MessageSquare /> Join the Discord</a></Button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-elevated p-5">
              <h2 className="text-sm font-semibold text-fg">Keep reading</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/changelog" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">What we shipped recently <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>
                <li><Link href="/guides" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">Guides for creators <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>
                <li><Link href="/docs/server-hub" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">Server Hub documentation <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>
                <li><Link href="/terms" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">Terms and privacy <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>
              </ul>
            </div>
          </aside>
        </div>

        <section className="mt-16" aria-labelledby="principles-heading">
          <h2 id="principles-heading" className="text-2xl font-semibold tracking-tight text-fg">How we build it</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-lg border border-border bg-bg-elevated p-5">
                <h3 className="text-sm font-semibold text-fg">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      </Container>
      <CtaBand loggedIn={!!user} title="Build something this evening." description="No installers, no virtual machine, no plugin versions to match. Open a tab and export a resource." />
    </>
  );
}
