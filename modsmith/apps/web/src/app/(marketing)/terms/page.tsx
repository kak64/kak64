import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, CREDITS, LIMITS } from "@modsmith/core";
import { Clause, LegalLayout } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Modsmith: accounts, content ownership, credits and refunds, payments, storage, the Server Hub, copyright complaints and liability.",
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of Service · Modsmith", url: "/terms" },
};

const UPDATED = new Date("2026-09-01T00:00:00Z");

const TOC = [
  { id: "agreement", label: "1. The agreement" },
  { id: "accounts", label: "2. Accounts" },
  { id: "your-content", label: "3. Your content and rights" },
  { id: "prohibited", label: "4. What you may not upload" },
  { id: "credits", label: "5. Credits, charges and refunds" },
  { id: "payments", label: "6. Payments and subscriptions" },
  { id: "storage", label: "7. Storage and deletion" },
  { id: "showcase", label: "8. Public showcase and profiles" },
  { id: "server-hub", label: "9. Server Hub" },
  { id: "availability", label: "10. Availability and changes" },
  { id: "acceptable-use", label: "11. Acceptable use" },
  { id: "copyright", label: "12. Copyright complaints" },
  { id: "termination", label: "13. Suspension and termination" },
  { id: "warranty", label: "14. Disclaimer of warranties" },
  { id: "liability", label: "15. Limitation of liability" },
  { id: "changes", label: "16. Changes to these terms" },
  { id: "contact", label: "17. Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      description={`These terms govern your use of ${BRAND.name}, a browser-based workshop for building assets and managing servers for FiveM. Please read them — they explain what you own, what we charge for and what we do not promise.`}
      updated={UPDATED}
      toc={TOC}
    >
      <Clause id="agreement" n={1} title="The agreement">
        <p>By creating an account or using {BRAND.name} you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you use {BRAND.name} on behalf of a community, studio or company, you confirm you are allowed to accept these terms for it.</p>
        <p>{BRAND.name} is an independent product. It is <strong>not affiliated with, endorsed by or connected to Rockstar Games, Take-Two Interactive or Cfx.re</strong>. GTA V is a trademark of Take-Two Interactive. We provide tools that process files you supply; how you use the results on a server is your responsibility, including compliance with the platform rules that apply to you.</p>
      </Clause>

      <Clause id="accounts" n={2} title="Accounts">
        <ul>
          <li>You need an account to export, publish or use the Server Hub. You must provide a working email address and keep your credentials secret.</li>
          <li>One person, one account. Do not share logins, and do not create additional accounts to collect signup or referral bonuses more than once. We reverse bonus credits obtained this way.</li>
          <li>You are responsible for everything that happens under your account. Tell us immediately at <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> if you believe it has been accessed by someone else.</li>
          <li>You must be old enough to enter a contract where you live, and at least 13 years old in any case.</li>
        </ul>
      </Clause>

      <Clause id="your-content" n={3} title="Your content and rights">
        <p><strong>You keep ownership of everything you upload and everything the tools generate from it.</strong> We claim no ownership over your models, textures, liveries, designs or exported resources.</p>
        <p><strong>You are responsible for having the rights.</strong> By uploading a file you confirm that you created it, that you hold a licence that permits this use, or that it is otherwise lawful for you to process and distribute it. That includes commercial-use rights when you sell or monetise the result.</p>
        <p>To run the service we need a limited, technical licence: you grant us permission to store, transmit, transcode, render and process your files for the sole purpose of providing the service to you (for example, converting a model, generating collision, building a ZIP and serving it back to you). This licence exists only to operate the features you asked for and ends when you delete the content, except for backups that expire on their normal schedule. If you publish an item to the public showcase, you additionally allow us to display it and its thumbnail on {BRAND.name} until you unpublish it.</p>
        <p>We do not use your uploaded files or exported resources to train machine-learning models, and we do not sell them.</p>
      </Clause>

      <Clause id="prohibited" n={4} title="What you may not upload">
        <p>Do not upload, convert or distribute through {BRAND.name}:</p>
        <ul>
          <li>Assets extracted, ripped or otherwise taken from another game, film, or any commercial product you do not have a licence for — including assets ripped from GTA V itself, from other games, or from paid asset stores.</li>
          <li>Paid or leaked resources you did not buy, or resources whose licence forbids redistribution, re-export or modification.</li>
          <li>Anyone else&apos;s work passed off as your own, including creator assets taken from Discord servers, marketplaces or private packs.</li>
          <li>Real people&apos;s likeness, logos or trademarks without permission, and content that is illegal, hateful, sexual involving minors, or designed to harass.</li>
          <li>Malware, obfuscated backdoors, cheat loaders or anything designed to compromise a server or its players.</li>
        </ul>
        <p>We remove content that breaches this section, and we may suspend accounts that repeat it. Unused credits on an account suspended for repeated infringement are not refunded.</p>
      </Clause>

      <Clause id="credits" n={5} title="Credits, charges and refunds">
        <ul>
          <li><strong>Credits are the unit of use.</strong> Each tool has a published credit cost per export, shown before you start and on the <Link href="/pricing">pricing page</Link>.</li>
          <li><strong>Credits never expire</strong> while your account is open. They are a prepaid balance for using the service, not money, not a security and not transferable or redeemable for cash.</li>
          <li><strong>You are charged on success.</strong> Credits are deducted when a build completes and a resource is produced — not when you start a job.</li>
          <li><strong>Automatic refunds for our failures.</strong> If a job fails because of our infrastructure (worker crash, storage or queue error, timeout on our side), the credits are returned to your balance automatically and the job is marked refunded. If a job fails because the source file is invalid or unsupported, we report the reason; you are not charged for a build that produced nothing.</li>
          <li><strong>Free re-exports.</strong> Re-exporting the same source file with the same configuration within {CREDITS.REEXPORT_WINDOW_DAYS} days of the original export costs no credits.</li>
          <li><strong>Welcome and bonus credits</strong> ({CREDITS.SIGNUP_BONUS} on signup, {CREDITS.EMAIL_VERIFY_BONUS} for verifying your email, {CREDITS.DISCORD_BONUS} for linking Discord, {CREDITS.REFERRAL_REWARD} per qualifying referral) are promotional. We may adjust the amounts for future accounts and may revoke bonuses obtained through duplicate accounts or fraud.</li>
          <li>Purchased credits are generally non-refundable once spent. If something went wrong, write to us — we would rather fix it than argue about it.</li>
        </ul>
      </Clause>

      <Clause id="payments" n={6} title="Payments and subscriptions">
        <ul>
          <li>Payments are processed by <strong>Stripe</strong>. Checkout happens on Stripe&apos;s hosted pages. <strong>We never see or store your card details</strong>; we keep only the Stripe customer, purchase and subscription identifiers needed to manage your billing.</li>
          <li>Prices are shown in the currency displayed at checkout and may exclude taxes that Stripe calculates for your location.</li>
          <li>Subscriptions renew automatically at the interval you chose (monthly or yearly) until cancelled. You can cancel at any time from the billing portal; your plan stays active until the end of the period you already paid for, and no further charges are made.</li>
          <li>Plan credits are granted per billing period. Cancelling does not remove credits already granted.</li>
          <li>If a payment fails, we may pause plan benefits until it succeeds. Statutory rights to a refund or withdrawal where you live are not affected by this section.</li>
        </ul>
      </Clause>

      <Clause id="storage" n={7} title="Storage and deletion">
        <ul>
          <li><strong>Source uploads are temporary.</strong> Files you upload for processing are deleted after the job that used them has finished (and in any case within {LIMITS.UPLOAD_TTL_HOURS} hours for uploads that are never used). Keep your own copy of every original.</li>
          <li><strong>Completed resources are kept until you delete them.</strong> Exported ZIPs and their creation records stay in your account so you can re-download or re-export them. Deleting a creation removes its stored files.</li>
          <li><strong>Server Hub data follows a retention window</strong> — {LIMITS.HUB_DEFAULT_RETENTION_DAYS} days on the free tier, longer on paid plans. Logs and media past their retention date are deleted automatically, and you can delete them earlier at any time.</li>
          <li><strong>Account deletion.</strong> You can delete your account from your account settings. We delete your creations, uploads, Server Hub projects and showcase items, and we anonymise records we must keep for accounting and abuse-prevention purposes. Deletion is permanent and unused credits are forfeited; back up anything you want to keep first. Residual copies may persist in encrypted backups until those backups expire on their normal rotation.</li>
        </ul>
      </Clause>

      <Clause id="showcase" n={8} title="Public showcase and profiles">
        <p><strong>Creations are private by default.</strong> A creation is only visible to you unless you explicitly publish it to the showcase. Publishing is per item and reversible: unpublishing removes it from public pages.</p>
        <p>When you publish, you choose whether other users may download the resource. Leaving downloads off means only you can download it. Public items display your username, the tool used, the publication date and your title, description and tags; keep anything private out of those fields.</p>
        <p>Your profile page is public only while the &quot;public profile&quot; setting is on. Turning it off makes the page return &quot;not found&quot; to visitors.</p>
        <p>We may remove a public item — or make it private again — if it is reported and found to breach section 4, without affecting your own copy unless the content is itself infringing.</p>
      </Clause>

      <Clause id="server-hub" n={9} title="Server Hub">
        <ul>
          <li>The Server Hub stores events and media that <strong>your server chooses to send</strong>. You decide what your resources log.</li>
          <li><strong>You are responsible for telling your players</strong> what you log about them and for how long, and for having a lawful basis to do so where that applies to you. We provide retention controls and deletion so you can honour player requests.</li>
          <li><strong>We do not store player IP addresses by default.</strong> The bridge never sends them and our ingestion layer strips IP-like fields from metadata even when a resource includes them. Do not deliberately route IP addresses or other sensitive personal data into log messages.</li>
          <li>Server tokens are write-only, scoped to one project and revocable. Keep them out of client-side code and public repositories; you are responsible for activity performed with your tokens.</li>
          <li>Rate limits, batch limits and storage quotas apply and are documented in the <Link href="/docs/server-hub">Server Hub documentation</Link>. We may throttle or pause ingestion for a project that exceeds them.</li>
        </ul>
      </Clause>

      <Clause id="availability" n={10} title="Availability and changes to the service">
        <p>{BRAND.name} is provided on an ongoing but not guaranteed basis. We do not promise uninterrupted availability: maintenance, upstream provider incidents, queue backlogs and bugs happen. Published tool costs, limits and features may change; when a change materially reduces something you have already paid for, we will say so in advance where we reasonably can.</p>
        <p>We may add, alter, gate behind a plan, or retire tools. If we retire a tool, exported resources you already downloaded remain yours.</p>
      </Clause>

      <Clause id="acceptable-use" n={11} title="Acceptable use">
        <p>Do not attempt to break, overload or circumvent the service: no automated scraping of pages or APIs beyond documented endpoints and rate limits, no reverse engineering of our processing pipeline, no probing other users&apos; data, no reselling access to your account, and no using the service to build tooling whose purpose is to bypass our credit system.</p>
      </Clause>

      <Clause id="copyright" n={12} title="Copyright complaints">
        <p>If you believe content on {BRAND.name} infringes your copyright, email <a href={`mailto:${BRAND.supportEmail}?subject=Copyright%20complaint`}>{BRAND.supportEmail}</a> with the subject &quot;Copyright complaint&quot; and include:</p>
        <ul>
          <li>Your name and contact details, and the rights holder you represent.</li>
          <li>A link to the {BRAND.name} page or item you are reporting.</li>
          <li>A description of the original work and evidence that you own it or are authorised to act (a store listing, a repository, the original project files).</li>
          <li>A statement that you believe in good faith the use is not authorised, and that the information you provide is accurate.</li>
        </ul>
        <p>We review complaints promptly, remove or restrict content where the claim is substantiated, notify the uploader, and accept counter-notices at the same address. Repeat infringers lose their accounts. You can also flag a public item directly from its page with the &quot;Report&quot; button.</p>
      </Clause>

      <Clause id="termination" n={13} title="Suspension and termination">
        <p>You may stop using {BRAND.name} at any time and delete your account from settings. We may suspend or terminate an account that breaches these Terms, that is used for fraud or chargeback abuse, or where required by law. Where the breach is minor and fixable we will normally warn you first. On termination for breach, unused credits are forfeited; on voluntary deletion, unused credits are forfeited as described in section 7.</p>
      </Clause>

      <Clause id="warranty" n={14} title="Disclaimer of warranties">
        <p>The service and everything it produces are provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We do not warrant that an exported resource will work on every server, framework or FiveM version, that conversions preserve every property of a source file, or that the service will be error-free or uninterrupted. Always test on a development server before deploying to players.</p>
      </Clause>

      <Clause id="liability" n={15} title="Limitation of liability">
        <p>To the fullest extent permitted by law, {BRAND.name} and the people who build it are not liable for indirect, incidental, special, consequential or punitive damages, nor for lost profits, lost revenue, lost data, server downtime, or damage to your community&apos;s reputation, arising from or relating to your use of the service.</p>
        <p>Our total aggregate liability for all claims relating to the service is limited to the greater of (a) the amount you paid us in the twelve months before the event giving rise to the claim, or (b) fifty US dollars. Nothing in these Terms excludes liability that cannot lawfully be excluded, such as for fraud, death or personal injury caused by negligence, or your statutory consumer rights.</p>
      </Clause>

      <Clause id="changes" n={16} title="Changes to these terms">
        <p>We may update these Terms as the product changes. The &quot;last updated&quot; date at the top always reflects the current version, and material changes are announced by email to account holders or in the <Link href="/changelog">changelog</Link>. Continuing to use {BRAND.name} after a change takes effect means you accept the updated Terms; if you do not, stop using the service and delete your account.</p>
      </Clause>

      <Clause id="contact" n={17} title="Contact">
        <p>Questions about these Terms, a complaint, or a request about your account: <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>. We answer every message from a real address.</p>
      </Clause>
    </LegalLayout>
  );
}
