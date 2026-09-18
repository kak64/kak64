import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, LIMITS } from "@modsmith/core";
import { Clause, LegalLayout } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Modsmith collects, why, how long it is kept and who it is shared with — including uploads, exported resources, payments through Stripe and Server Hub data.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy · Modsmith", url: "/privacy" },
};

const UPDATED = new Date("2026-09-01T00:00:00Z");

const TOC = [
  { id: "summary", label: "1. The short version" },
  { id: "what-we-collect", label: "2. What we collect" },
  { id: "why", label: "3. Why we use it" },
  { id: "content", label: "4. Your files and creations" },
  { id: "payments", label: "5. Payments" },
  { id: "server-hub", label: "6. Server Hub data" },
  { id: "showcase", label: "7. Private vs public" },
  { id: "email", label: "8. Email and Discord" },
  { id: "cookies", label: "9. Cookies" },
  { id: "sharing", label: "10. Who we share with" },
  { id: "retention", label: "11. Retention and deletion" },
  { id: "security", label: "12. Security" },
  { id: "rights", label: "13. Your rights" },
  { id: "children", label: "14. Children" },
  { id: "changes", label: "15. Changes" },
  { id: "contact", label: "16. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description={`How ${BRAND.name} handles your account, your files and the data your server sends to the Server Hub. Written to be read, not to be skipped.`}
      updated={UPDATED}
      toc={TOC}
    >
      <Clause id="summary" n={1} title="The short version">
        <ul>
          <li><strong>We do not sell your personal data.</strong> Not to advertisers, not to data brokers, not to anyone.</li>
          <li><strong>You own your files.</strong> Source uploads are deleted after processing; exported resources stay until you delete them.</li>
          <li><strong>We never see your card.</strong> Stripe handles payments.</li>
          <li><strong>We do not store player IP addresses</strong> in the Server Hub, and we strip IP-like fields from log metadata.</li>
          <li><strong>Creations are private by default.</strong> Nothing becomes public unless you publish it.</li>
          <li><strong>You can delete your account</strong> and the data attached to it from your settings.</li>
        </ul>
      </Clause>

      <Clause id="what-we-collect" n={2} title="What we collect">
        <ul>
          <li><strong>Account data</strong> — email address, username, a hashed password (never the password itself), your role and status, and the date you joined.</li>
          <li><strong>Profile data you choose to add</strong> — avatar, bio, and your privacy preferences.</li>
          <li><strong>Session data</strong> — a session token in a cookie, the browser user-agent, and a <em>hashed</em> IP address used to detect suspicious logins. We do not keep raw login IP addresses.</li>
          <li><strong>Usage data</strong> — the jobs you run, their tool, status and credit cost; your credit balance and ledger; your creations and their metadata.</li>
          <li><strong>Files</strong> — what you upload, and what our workers produce from it (see section 4).</li>
          <li><strong>Billing data</strong> — Stripe customer, purchase and subscription identifiers, plan, status and period dates. Never card numbers.</li>
          <li><strong>Discord data</strong> — if you link Discord: your Discord id, username, display name and avatar URL. You can disconnect it at any time.</li>
          <li><strong>Server Hub data</strong> — whatever your FiveM server sends (see section 6).</li>
          <li><strong>Support correspondence</strong> — the emails you send us and our replies.</li>
        </ul>
      </Clause>

      <Clause id="why" n={3} title="Why we use it">
        <p>We use the data above to run your account and sessions, process the jobs you start, keep an accurate credit ledger, take payment and apply plan benefits, send the transactional emails you need (verification, password reset, job completion, receipts), display the parts of the showcase you chose to publish, prevent fraud and abuse — for example duplicate accounts farming signup bonuses — and to keep the service working, debug failures and understand aggregate load. We do not run advertising profiling and we do not build a behavioural profile of you for third parties.</p>
      </Clause>

      <Clause id="content" n={4} title="Your files and creations">
        <p><strong>You retain ownership</strong> of everything you upload and everything the tools generate from it. We process files only to deliver the feature you asked for.</p>
        <ul>
          <li><strong>Source uploads are deleted after processing</strong> — once the job that uses them has finished. Uploads that are never used are removed within {LIMITS.UPLOAD_TTL_HOURS} hours.</li>
          <li><strong>Completed resources are kept until you delete them</strong>, so you can re-download or re-export. Deleting a creation deletes its stored files.</li>
          <li>Files live in private object storage. Access is only ever granted through short-lived signed URLs issued to you; storage keys are never exposed.</li>
          <li>We do not use your files to train machine-learning models. Where a tool uses AI to generate a mesh from an image you supply, that image is sent to the model provider solely to produce your result.</li>
          <li>Staff do not browse private creations. Access to stored content happens only when you ask for support with a specific item, or where required to investigate a substantiated abuse or copyright report, and such access is audit-logged.</li>
        </ul>
      </Clause>

      <Clause id="payments" n={5} title="Payments">
        <p>Payments are processed by <strong>Stripe</strong>, which acts as an independent payment processor. Checkout and the billing portal are hosted by Stripe. <strong>We never receive or store your card number, CVC or expiry.</strong> What we store is the Stripe customer id, the purchase or subscription id, the plan, amount, currency, status and period dates — enough to show your billing history, grant plan credits and handle refunds. Stripe processes your payment details under its own privacy policy.</p>
      </Clause>

      <Clause id="server-hub" n={6} title="Server Hub data">
        <p>The Server Hub stores what <strong>your server</strong> sends: log messages, levels, dataset and resource names, timestamps, metadata your resources attach, screenshots and phone media, and player identifiers — server id, license identifier, Discord id and display name.</p>
        <ul>
          <li><strong>No IP addresses.</strong> The <code>msmhub</code> resource never sends them, and our ingestion layer strips IP-like metadata keys and values even if another integration includes them.</li>
          <li><strong>Server owners are responsible for notifying their players</strong> about what is logged and for how long, and for having a lawful basis where one is required. You are the controller of that data; we process it on your behalf.</li>
          <li><strong>Retention</strong> is {LIMITS.HUB_DEFAULT_RETENTION_DAYS} days by default and longer on paid plans. Events past retention are deleted automatically; you can delete logs, media or a whole project earlier at any time.</li>
          <li><strong>Media is private.</strong> Screenshots and phone photos go to a private bucket and are served only to the project owner through short-lived signed URLs.</li>
          <li><strong>Tokens are write-only</strong> and cannot read anything back.</li>
          <li>If one of your players asks you to delete their data, you can remove the matching logs and media from the dashboard; contact us if you need help with a bulk removal.</li>
        </ul>
      </Clause>

      <Clause id="showcase" n={7} title="Private creations vs the public showcase">
        <p>There are two distinct states, and the difference matters:</p>
        <ul>
          <li><strong>Private (the default).</strong> A creation is visible only to you. Nobody else — no other user, no search engine — can see it, its files or its thumbnail.</li>
          <li><strong>Published to the showcase.</strong> Only when you explicitly publish an item does it appear publicly, with your username, title, description, tags, tool, publication date, like and view counts, and a thumbnail. You separately choose whether other users may download the resource. Unpublishing removes it from public pages.</li>
        </ul>
        <p>Your public profile page at <code>/u/your-username</code> exists only while the &quot;public profile&quot; setting is on; with it off, the page returns not found. Like and view counters are aggregate: we store a hashed viewer identifier per item per day to avoid double counting, not a browsing history.</p>
      </Clause>

      <Clause id="email" n={8} title="Email and Discord communications">
        <p>We send <strong>transactional email</strong> you cannot opt out of while your account exists: email verification, password resets, security notices, receipts and — if you have it enabled — job completion notices. <strong>Marketing email is opt-in</strong> and off by default; you can change both this and job notifications in your notification settings, and every marketing email has an unsubscribe link. If you link Discord and enable Discord notifications, we send job and account notices to you through Discord as well.</p>
      </Clause>

      <Clause id="cookies" n={9} title="Cookies">
        <p>We use two cookies and no third-party tracking cookies: a <strong>session cookie</strong> (HTTP-only, so scripts cannot read it) that keeps you logged in, and a <strong>CSRF token cookie</strong> that protects form and API submissions. Both are removed when you log out. There are no advertising or analytics cookies, and nothing follows you to other sites.</p>
      </Clause>

      <Clause id="sharing" n={10} title="Who we share data with">
        <p><strong>We do not sell personal data and we do not share it for advertising.</strong> We share only what is needed with service providers acting on our instructions: our hosting and object-storage provider, Stripe for payments, our transactional email provider, and Discord where you have linked an account. Each processes data under its own agreement and for no other purpose.</p>
        <p>We may also disclose data where we are legally required to, or to investigate abuse, fraud or a credible threat to someone&apos;s safety. If {BRAND.name} is ever acquired, accounts would transfer with the service and you would be told before anything changed.</p>
      </Clause>

      <Clause id="retention" n={11} title="Retention and deletion">
        <ul>
          <li>Source uploads: deleted after processing, or within {LIMITS.UPLOAD_TTL_HOURS} hours if unused.</li>
          <li>Creations and exported resources: kept until you delete them or delete your account.</li>
          <li>Server Hub logs and media: the retention window of your plan, or until you delete them.</li>
          <li>Credit ledger and purchase records: retained while your account exists and, in anonymised form afterwards, for the period accounting rules require.</li>
          <li>Sessions: until they expire ({LIMITS.SESSION_TTL_DAYS} days, or {LIMITS.SESSION_REMEMBER_TTL_DAYS} with &quot;remember me&quot;) or you revoke them.</li>
          <li><strong>Account deletion</strong> from your settings removes your creations, uploads, Server Hub projects and showcase items, and anonymises records we must keep for accounting and abuse prevention. It is permanent. Encrypted backups may retain residual copies until they expire on their normal rotation.</li>
        </ul>
      </Clause>

      <Clause id="security" n={12} title="Security">
        <p>Passwords are hashed with Argon2id. Session and Server Hub tokens are stored as HMAC hashes, never in plain text, and Server Hub tokens are shown once. Traffic is served over HTTPS with a strict content security policy. Uploads are validated by real file signature, size and archive safety before any worker touches them. Object storage is private, with time-limited signed URLs. Administrative actions are audit-logged. No system is perfectly secure, but we would rather over-engineer this part.</p>
      </Clause>

      <Clause id="rights" n={13} title="Your rights">
        <p>Depending on where you live you may have the right to access, correct, export, restrict or delete your personal data, to object to certain processing, and to complain to a data protection authority. In practice most of this is self-service: edit your profile and privacy settings, download your creations, revoke sessions and delete your account from settings. For anything the interface does not cover — including a copy of your data — email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> and we will respond within 30 days. We never charge for a rights request and we will not penalise you for making one.</p>
      </Clause>

      <Clause id="children" n={14} title="Children">
        <p>{BRAND.name} is not directed at children under 13, and we do not knowingly collect their data. If you believe a child has created an account, tell us and we will remove it.</p>
      </Clause>

      <Clause id="changes" n={15} title="Changes to this policy">
        <p>We update this policy when the product changes. The &quot;last updated&quot; date above always reflects the current version, and material changes are announced by email or in the <Link href="/changelog">changelog</Link> before they take effect.</p>
      </Clause>

      <Clause id="contact" n={16} title="Contact">
        <p>Privacy questions, data requests or complaints: <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>. See also our <Link href="/terms">Terms of Service</Link>.</p>
      </Clause>
    </LegalLayout>
  );
}
