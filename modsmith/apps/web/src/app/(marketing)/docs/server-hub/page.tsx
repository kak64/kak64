import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { BRAND, LIMITS, PHONE_PROVIDERS } from "@modsmith/core";
import { getCurrentUser } from "@/server/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Container, PageIntro } from "@/components/marketing/section";
import { Callout, CodeBlock, DocSection, DocTable, DocsSidebar } from "@/components/marketing/docs";
import { JsonLd } from "@/components/marketing/json-ld";
import { siteUrl } from "@/components/marketing/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Server Hub documentation",
  description: "Install the msmhub FiveM resource, ship structured logs, capture screenshots and store phone media privately. API reference for the Modsmith Server Hub ingestion endpoints.",
  alternates: { canonical: "/docs/server-hub" },
  openGraph: { title: "Server Hub documentation · Modsmith", url: "/docs/server-hub" },
};

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "install", label: "Install msmhub", children: [{ id: "convars", label: "server.cfg convars" }, { id: "frameworks", label: "Framework support" }] },
  { id: "logging", label: "Logging from Lua" },
  { id: "api", label: "Logging API", children: [{ id: "api-auth", label: "Authentication" }, { id: "api-body", label: "Request body" }, { id: "api-levels", label: "Levels" }, { id: "api-datasets", label: "Datasets" }, { id: "api-limits", label: "Batch limits" }, { id: "api-idempotency", label: "Retries & idempotency" }, { id: "api-player", label: "Player metadata" }] },
  { id: "search", label: "Log search" },
  { id: "screenshots", label: "Screenshots" },
  { id: "phone-media", label: "Phone media", children: [{ id: "phone-flow", label: "Reservation flow" }, { id: "phone-integrations", label: "Phone integrations" }] },
  { id: "security", label: "Security notes" },
  { id: "download", label: "Download resource" },
];

const PHONE_LABELS: Record<(typeof PHONE_PROVIDERS)[number], string> = { "lb-phone": "LB Phone", quasar: "Quasar Smartphone", yseries: "YSeries", codem: "CodeM", nphone: "nPhone", jpr: "JPR", custom: "Custom phone" };

export default async function ServerHubDocsPage() {
  const user = await getCurrentUser();
  const base = siteUrl();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "TechArticle", headline: "Modsmith Server Hub documentation", url: `${base}/docs/server-hub`, publisher: { "@type": "Organization", name: BRAND.name }, about: "FiveM server logging, screenshots and phone media" }} />
      <PageIntro eyebrow="Server Hub" title="Server Hub documentation" description="Searchable logs, private screenshots and phone media for your FiveM server, delivered by one small resource and a bearer token.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">msmhub 1.0.0</Badge>
          <Badge>standalone · ESX · QBCore · Qbox</Badge>
          <Badge>Lua 5.4</Badge>
        </div>
      </PageIntro>
      <Container className="grid gap-10 py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="order-last lg:order-none"><DocsSidebar items={TOC} /></aside>
        <article className="min-w-0 max-w-3xl">
          <DocSection id="overview" title="Overview">
            <p>The Server Hub is three things: an ingestion API that accepts structured events and images from your server, a dashboard where you search and browse them, and <code>msmhub</code>, a FiveM resource that bridges the two. Every project (one per server or network) has its own bearer tokens; a token can only write to the project it belongs to and can never read dashboard data.</p>
            <ul>
              <li><strong>Logs</strong> — batched, de-duplicated events with levels, datasets, resource names and player identifiers.</li>
              <li><strong>Screenshots</strong> — capture a player&apos;s screen with <code>screencapture</code> or <code>screenshot-basic</code> and store it privately, attached to a reason or report id.</li>
              <li><strong>Phone media</strong> — one-time upload reservations so phone resources can save photos without ever seeing your server token.</li>
            </ul>
            <p>The free tier includes {Math.round(LIMITS.HUB_FREE_STORAGE_BYTES / 1024 ** 2)} MB of private media and {LIMITS.HUB_DEFAULT_RETENTION_DAYS}-day log retention for one server. Paid <Link href="/pricing#server-hub">Server Hub plans</Link> raise storage, retention and server count.</p>
          </DocSection>

          <DocSection id="install" title="Install msmhub">
            <ol>
              <li>Create a project in the Server Hub dashboard and generate a token. Tokens start with <code>msh_</code> and are shown once.</li>
              <li><a href="#download">Download the resource</a> and copy the <code>msmhub</code> folder into your <code>resources/</code> directory.</li>
              <li>Add the convars below to <code>server.cfg</code>, then <code>ensure msmhub</code>.</li>
              <li>Optional: allow admins to take screenshots with <code>add_ace group.admin msmhub.screenshot allow</code>.</li>
            </ol>
            <DocSection id="convars" title="server.cfg convars" level={3}>
              <CodeBlock lang="cfg" title="server.cfg" code={`
set msmhub_token "msh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
set msmhub_endpoint "${base}"
ensure msmhub
`} />
              <DocTable caption="Convars read by msmhub" head={["Convar", "Required", "Description"]} rows={[
                ["msmhub_token", "yes", "Project bearer token. Read once on the server; never sent to clients."],
                ["msmhub_endpoint", "yes", <>Base URL of your Modsmith host, without a trailing slash. Ingestion paths are appended automatically.</>],
              ]} />
              <p>Tuning lives in <code>config.lua</code>: <code>BatchSize</code> (default 50, max {LIMITS.HUB_LOG_BATCH_MAX}), <code>FlushInterval</code> (ms), <code>MaxQueue</code> (events kept in memory while the API is unreachable), <code>MaxRetries</code>, <code>RetryBackoffMs</code>, <code>DefaultDataset</code>, <code>IncludePlayerIds</code>, <code>ScreenshotEncoding</code> and <code>ScreenshotQuality</code>.</p>
              <Callout tone="warning" title="Keep the token in server.cfg">Never put the token in <code>config.lua</code>, a shared script or anything a client can read. If a token leaks, revoke it in the dashboard and generate a new one — the old one stops working within a minute.</Callout>
            </DocSection>
            <DocSection id="frameworks" title="Framework support" level={3}>
              <p><code>msmhub</code> has no dependencies. On start it checks which framework is running and exposes the result through <code>exports.msmhub:framework()</code>:</p>
              <DocTable caption="Framework detection" head={["Detected when", "Value"]} rows={[["es_extended is started", "esx"], ["qbx_core is started", "qbox"], ["qb-core is started", "qbcore"], ["none of the above", "standalone"]]} />
              <p>Built-in events are logged regardless of framework: resource start, <code>playerJoining</code> and <code>playerDropped</code> (with the drop reason) go to the <code>server</code> and <code>players</code> datasets.</p>
            </DocSection>
          </DocSection>

          <DocSection id="logging" title="Logging from Lua">
            <p>Any server resource can log through the exports. Events are queued, batched and flushed every <code>FlushInterval</code> milliseconds, so calling them in hot paths is cheap.</p>
            <CodeBlock lang="lua" title="server-side" code={`
-- level helpers: debug / info / warn / error / fatal
exports.msmhub:info('Item moved', {
  resource = 'inventory',
  dataset  = 'inventory',
  source   = src,                          -- attaches license/discord/name (never IP)
  metadata = { item = 'lockpick', count = 2 },
})

exports.msmhub:warn('Suspicious teleport', { dataset = 'anticheat', source = src, metadata = { distance = 850 } })
exports.msmhub:log('error', 'DB write failed', { metadata = { err = tostring(err) } })

-- force a flush (e.g. before a scheduled restart)
exports.msmhub:flush()
`} />
            <p>Client scripts should not talk to the API. Instead, trigger the server event and let the bridge attach player identity:</p>
            <CodeBlock lang="lua" title="client-side" code={`
TriggerServerEvent('msmhub:server:log', 'info', 'Opened garage menu', { dataset = 'ui', metadata = { garage = 'pillbox' } })
`} />
            <DocTable caption="Log options" head={["Option", "Type", "Notes"]} rows={[
              ["resource", "string", "Defaults to the calling resource name."],
              ["dataset", "string", <>Groups events for search. Letters, numbers, <code>.</code>, <code>_</code>, <code>-</code>; max {LIMITS.HUB_DATASET_NAME_MAX} chars.</>],
              ["source", "number", "Server id of the acting player. The bridge resolves identifiers itself."],
              ["target", "number", "Server id of an affected player (kicks, trades, damage)."],
              ["metadata", "table", "Any JSON-serialisable table. Nested keys are flattened for search."],
              ["id", "string", "Optional idempotency key (max 64 chars). Generated when omitted."],
            ]} />
          </DocSection>

          <DocSection id="api" title="Logging API">
            <p>If you are not using Lua, or you want to ship logs from a bot, a web panel or another service, call the ingestion endpoint directly.</p>
            <CodeBlock lang="http" code={`POST ${base}/hub-ingest/v1/logs`} />
            <DocSection id="api-auth" title="Authentication" level={3}>
              <p>Send the project token as a bearer token. Requests without a valid token receive <code>401</code>; a revoked token also receives <code>401</code>. Tokens are scoped to one project — there is no account-wide token.</p>
              <CodeBlock lang="http" code={`
Authorization: Bearer msh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
X-Request-Id: 7f3c2a1e-optional-but-recommended
`} />
            </DocSection>
            <DocSection id="api-body" title="Request body" level={3}>
              <p>The body is a JSON array of 1–{LIMITS.HUB_LOG_BATCH_MAX} events (a single object is also accepted). Only <code>message</code> is required.</p>
              <CodeBlock lang="json" title="request" code={`
[
  {
    "id": "inv-8842-1726400000",
    "level": "info",
    "message": "Item moved",
    "resource": "inventory",
    "dataset": "inventory",
    "timestamp": "2026-09-15T12:00:00Z",
    "metadata": { "item": "lockpick", "count": 2, "from": "player", "to": "trunk" },
    "player": { "source": 12, "license": "license:5f1c…", "discord": "1234567890", "name": "Alex" }
  },
  {
    "level": "warn",
    "message": "Suspicious teleport",
    "dataset": "anticheat",
    "metadata": { "distance": 850 },
    "player": { "source": 12 }
  }
]
`} />
              <CodeBlock lang="json" title="response · 202 Accepted" code={`
{ "success": true, "data": { "accepted": 2, "duplicates": 0 } }
`} />
              <DocTable caption="Event fields" head={["Field", "Type", "Constraints"]} rows={[
                ["message", "string", "Required. 1–4000 characters."],
                ["level", "string", "debug | info | warn | error | fatal. Defaults to info."],
                ["resource", "string", "Max 64 characters."],
                ["dataset", "string", <>Max {LIMITS.HUB_DATASET_NAME_MAX} characters, see naming rules. Defaults to <code>default</code>.</>],
                ["timestamp", "string | number", "ISO 8601 or Unix seconds/milliseconds. Clamped to the last 24 hours and at most 5 minutes in the future."],
                ["metadata", "object", "Free-form JSON. IP-like keys are stripped."],
                ["player", "object", "source, target (server ids), license (≤128), discord (≤64), name (≤64)."],
                ["id", "string", "Max 64 characters. Used for de-duplication."],
              ]} />
            </DocSection>
            <DocSection id="api-levels" title="Levels" level={3}>
              <DocTable caption="Log levels" head={["Level", "Use it for"]} rows={[["debug", "Verbose development detail. Filtered out of the default dashboard view."], ["info", "Normal operations: joins, purchases, inventory moves."], ["warn", "Something odd that did not fail: anticheat flags, retries, slow queries."], ["error", "A failed operation the player noticed."], ["fatal", "The resource or server cannot continue."]]} />
            </DocSection>
            <DocSection id="api-datasets" title="Dataset naming rules" level={3}>
              <p>Datasets are lightweight namespaces created on first use. Names may contain letters, digits, <code>.</code>, <code>_</code> and <code>-</code>, and are limited to {LIMITS.HUB_DATASET_NAME_MAX} characters (<code>{"^[A-Za-z0-9._-]{1,48}$"}</code>). Good names describe a subsystem, not a moment: <code>inventory</code>, <code>anticheat</code>, <code>economy.shops</code>, <code>phone-media</code>. Avoid per-player or per-day names; those belong in metadata.</p>
            </DocSection>
            <DocSection id="api-limits" title="Batch limits" level={3}>
              <ul>
                <li>1–{LIMITS.HUB_LOG_BATCH_MAX} events per request.</li>
                <li>Request body at most 1 MiB ({LIMITS.HUB_LOG_REQUEST_MAX_BYTES.toLocaleString("en-US")} bytes). Larger requests are rejected with <code>413</code>.</li>
                <li>Rate limit: 600 requests per minute per project. Exceeding it returns <code>429</code> with a <code>Retry-After</code> header.</li>
                <li>Retention: {LIMITS.HUB_DEFAULT_RETENTION_DAYS} days on the free tier; plans extend it. Expired events are deleted automatically.</li>
              </ul>
            </DocSection>
            <DocSection id="api-idempotency" title="Retries and idempotency" level={3}>
              <p>Ingestion is idempotent per event <code>id</code>. If you retry a batch after a timeout, events whose ids were already stored are counted in <code>duplicates</code> and not written twice. When an event has no <code>id</code>, the API derives one from the <code>X-Request-Id</code> header plus the event&apos;s index in the batch — so always send a unique <code>X-Request-Id</code> per batch and reuse it on retry.</p>
              <p><code>msmhub</code> does this for you: batches are retried up to <code>MaxRetries</code> times with exponential backoff starting at <code>RetryBackoffMs</code>, and up to <code>MaxQueue</code> events are held in memory while the endpoint is unreachable. Retry only on network errors, <code>429</code> and <code>5xx</code>; a <code>400</code> means the batch will never be accepted.</p>
            </DocSection>
            <DocSection id="api-player" title="Player metadata (no IP storage)" level={3}>
              <p>Player identity is limited to what moderation needs: server id, license identifier, Discord id and display name. IP addresses are never stored. The ingestion layer strips metadata keys named <code>ip</code>, <code>ipaddr</code>, <code>ip_address</code>, <code>endpoint</code> or <code>remote_addr</code> and any string value starting with <code>ip:</code>, even if a resource sends them. Set <code>Config.IncludePlayerIds = false</code> to attach only the server id.</p>
              <Callout tone="info" title="Your players, your notice">You are the data controller for what your server sends. Tell players that gameplay events are logged and for how long. See the <Link href="/privacy#server-hub">privacy policy</Link> for the shared responsibilities.</Callout>
            </DocSection>
          </DocSection>

          <DocSection id="search" title="Log search">
            <p>The dashboard searches by free text, level, dataset, resource, player identifier and time range, with cursor pagination. Metadata is flattened into searchable <code>key=value</code> pairs, so <code>item=lockpick</code> or <code>distance=850</code> work as queries. The same search is available to logged-in dashboard users at <code>GET /api/v1/server-hub/logs</code> with these parameters:</p>
              <DocTable caption="Search parameters" head={["Parameter", "Type", "Notes"]} rows={[
                ["projectId", "string", "Required."],
                ["q", "string", "Free text over message and flattened metadata (max 200 chars)."],
                ["level", "string[]", "Any of debug, info, warn, error, fatal."],
                ["dataset / resource", "string", "Exact match."],
                ["player", "string", "Matches license, Discord id or name."],
                ["from / to", "ISO 8601", "Time range."],
                ["cursor / limit", "string / 1–100", "Cursor pagination; default 50."],
              ]} />
            <p>Search uses your dashboard session, not the server token. Server tokens cannot read logs.</p>
          </DocSection>

          <DocSection id="screenshots" title="Screenshots">
            <p>Screenshots require <code>screencapture</code> or <code>screenshot-basic</code> on the server. The flow keeps the token on the server: it reserves an upload, the client captures and PUTs the image to a one-time URL, and the server receives the stored media id.</p>
            <CodeBlock lang="lua" title="server-side" code={`
exports.msmhub:requestScreenshot(src, { reason = 'report #123', reportId = '123' }, function(mediaId, urlOrErr)
  if mediaId then
    print(('stored screenshot %s'):format(mediaId))
  else
    print('capture failed: ' .. tostring(urlOrErr))
  end
end)

-- built-in admin command (requires the msmhub.screenshot ace):
-- /msmscreenshot <serverId> [reason]
`} />
            <p>Services that already hold an image (a bot, a web panel) can upload directly:</p>
            <CodeBlock lang="http" code={`
POST ${base}/hub-ingest/v1/screenshots
Authorization: Bearer msh_…
Content-Type: multipart/form-data

file=<image/jpeg | image/png | image/webp>
metadata={"player":{"source":12,"license":"license:…"},"reason":"report #123","reportId":"123"}
`} />
            <CodeBlock lang="json" title="response · 201 Created" code={`
{ "success": true, "data": { "mediaId": "clx…", "url": "${base}/api/v1/server-hub/media/clx…", "width": 1920, "height": 1080 } }
`} />
            <p>Images are validated by magic bytes, limited to {Math.round(LIMITS.HUB_MEDIA_MAX_BYTES / 1024 ** 2)} MB, stored in private object storage and served only to logged-in project owners through short-lived signed URLs. Rate limit: 60 screenshots per minute per project.</p>
          </DocSection>

          <DocSection id="phone-media" title="Phone media">
            <p>Phone resources upload photos from the client, which must never hold your server token. The reservation flow solves this with a one-time, short-lived upload URL.</p>
            <DocSection id="phone-flow" title="Reservation flow" level={3}>
              <ol>
                <li><strong>Reserve</strong> — the server calls <code>POST /hub-ingest/v1/media/reservations</code> with the bearer token, the media kind, expected MIME type and optional metadata.</li>
                <li><strong>One-time PUT URL</strong> — the API answers with <code>uploadUrl</code>, valid for {LIMITS.RESERVATION_TTL_SECONDS} seconds and usable exactly once. The server forwards only this URL to the client.</li>
                <li><strong>Upload</strong> — the client PUTs the bytes (raw body, multipart <code>file</code> field, or base64 with <code>Content-Transfer-Encoding: base64</code> for <code>PerformHttpRequest</code>).</li>
                <li><strong>Validation</strong> — the file signature is checked against the reservation&apos;s allowed MIME types and size cap. Anything else is rejected and the reservation is marked <code>REJECTED</code>.</li>
                <li><strong>Stable media id</strong> — on success the response carries a permanent <code>mediaId</code> and a URL that resolves to a signed download for project owners. Store the id in your phone&apos;s database, not the signed URL.</li>
              </ol>
              <CodeBlock lang="json" title="POST /hub-ingest/v1/media/reservations · request" code={`
{
  "kind": "phone_photo",
  "mime": "image/jpeg",
  "maxBytes": 5242880,
  "metadata": { "player": { "source": 12, "license": "license:…" }, "reason": "camera", "extra": { "album": "default" } }
}
`} />
              <CodeBlock lang="json" title="response · 201 Created" code={`
{
  "success": true,
  "data": {
    "reservationId": "a1b2c3d4e5f6",
    "uploadUrl": "${base}/hub-ingest/v1/media/reservations/a1b2c3d4e5f6?t=<one-time-token>",
    "method": "PUT",
    "expiresIn": ${LIMITS.RESERVATION_TTL_SECONDS},
    "maxBytes": 5242880,
    "allowedMimes": ["image/jpeg"]
  }
}
`} />
              <CodeBlock lang="json" title="PUT uploadUrl · response · 201 Created" code={`
{ "success": true, "data": { "mediaId": "clx…", "url": "${base}/api/v1/server-hub/media/clx…", "mime": "image/jpeg", "width": 1280, "height": 720, "sizeBytes": 348211 } }
`} />
              <DocTable caption="Reservation kinds and errors" head={["Value / status", "Meaning"]} rows={[
                ["screenshot | phone_photo | phone_video | other", "Media kind. Currently only image MIME types (jpeg, png, webp) are accepted."],
                ["401", "Unknown or already-used upload token."],
                ["403 QUOTA_EXCEEDED", "The project's storage quota would be exceeded. Free space or upgrade the plan."],
                ["409", "Reservation already completed."],
                ["410", "Reservation expired — reserve again."],
                ["413 / 415", "File too large / not a supported image."],
              ]} />
            </DocSection>
            <DocSection id="phone-integrations" title="Phone integrations" level={3}>
              <p>Adapters live in <code>server/phone/</code> and activate automatically when the phone resource is started. Every adapter uses the same generic reservation service.</p>
              <ul>
                {PHONE_PROVIDERS.map((p) => <li key={p}><strong>{PHONE_LABELS[p]}</strong>{p === "custom" ? " — wire your own phone with the two exports below." : ` — auto-detected; no configuration required.`}</li>)}
              </ul>
              <CodeBlock lang="lua" title="custom phone · server" code={`
exports.msmhub:reservePhoneMedia(src, 'phone_photo', 'image/jpeg', { reason = 'camera' }, function(url, reservationId, maxBytes)
  if not url then return end -- reservationId holds the error text in this case
  TriggerClientEvent('myphone:uploadUrl', src, url, maxBytes)
end)
`} />
              <CodeBlock lang="lua" title="custom phone · client" code={`
-- dataUrl: "data:image/jpeg;base64,..." from your camera NUI
exports.msmhub:uploadPhoneMedia(dataUrl, 'phone_photo', function(ok, result)
  if ok then
    SavePhotoToPhone(result.mediaId, result.url)
  else
    print('upload failed: ' .. tostring(result))
  end
end)
`} />
            </DocSection>
          </DocSection>

          <DocSection id="security" title="Security notes">
            <ul>
              <li><strong>Tokens</strong> are HMAC-hashed at rest, shown once, scoped to one project, and revocable instantly. Rotate them if a config file leaves your control.</li>
              <li><strong>Write-only</strong> — a token can ingest logs and media but cannot read, list or delete anything. Reading requires a logged-in dashboard session.</li>
              <li><strong>Clients never see the token</strong> — screenshots and phone uploads use one-time URLs that expire after {LIMITS.RESERVATION_TTL_SECONDS} seconds and a single use.</li>
              <li><strong>Every upload is sniffed</strong> — files are validated by magic bytes and size, not by extension or the declared content type.</li>
              <li><strong>No IP addresses</strong> — never sent by the resource, and stripped server-side if any resource includes them.</li>
              <li><strong>Private storage</strong> — media is stored in a private bucket and served through short-lived signed URLs to the project owner only.</li>
              <li><strong>Rate limits</strong> per project protect the platform; the bridge queues and retries so short outages lose nothing.</li>
            </ul>
          </DocSection>

          <DocSection id="download" title="Download the resource">
            <p>The resource is generated for your account and includes the manifest, client and server scripts, phone adapters and a README. You need to be logged in to download it.</p>
            <div className="flex flex-wrap items-center gap-3">
              {user ? (
                <Button asChild><a href="/api/v1/server-hub/resource"><Download /> Download msmhub.zip</a></Button>
              ) : (
                <>
                  <Button asChild><Link href={`/login?next=${encodeURIComponent("/docs/server-hub#download")}`}>Log in to download</Link></Button>
                  <Button asChild variant="outline"><Link href="/register">Create free account</Link></Button>
                </>
              )}
              <Button asChild variant="ghost"><Link href="/app/hub">Open Server Hub dashboard <ExternalLink /></Link></Button>
            </div>
            <p className="text-xs text-fg-subtle">Requires a logged-in session. The download is served from <code>/api/v1/server-hub/resource</code>.</p>
          </DocSection>
        </article>
      </Container>
    </>
  );
}
