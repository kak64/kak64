# Architecture

## Components

```
 Browser (Next.js pages, Three.js editors)
   │  HTTPS, cookie session, CSRF header
   ▼
 apps/web  ── Next.js route handlers (/api/v1, /hub-ingest/v1) ──► PostgreSQL (Prisma)
   │                │                                             ▲
   │                ├──► Redis: rate limits, cache, pub/sub (SSE) │
   │                └──► BullMQ queues ───────────────────────────┼──► apps/worker (N replicas)
   │                                                              │        │ processors (AssetProcessor)
   │  direct-to-storage uploads (signed PUT / multipart)          │        ▼
   └──────────────────────────────────────────────► S3-compatible private bucket ◄── results / previews
                                                                  ▲
 FiveM server (msmhub resource) ── bearer token ──► /hub-ingest ──┘  (logs → Postgres, media → bucket)
 Stripe ── signed webhooks ──► /api/v1/billing/webhook
 Discord ── OAuth + bot DMs
```

Web, worker, database, Redis and storage scale independently. Nothing CPU-heavy runs inside a web request: uploads go straight to the bucket, conversions run on workers, and progress streams back over Server-Sent Events fed by Redis pub/sub.

## Request pipeline

`apiRoute()` (apps/web/src/server/api.ts) wraps every JSON handler: CSRF/origin check → session resolution → role/verification gates → generic + per-route Redis rate limits → Zod body/query validation → handler → uniform error envelope. Ownership is enforced inside handlers (every query is scoped by `userId`); the middleware only performs cheap cookie-presence redirects.

## Data model highlights

- **Users/auth**: `User` (normalized unique email/username, Argon2id hash, role/status, notification + privacy prefs, referral code), `Session` (HMAC-hashed token, expiry, revocation), verification/reset tokens (hashed, single-use, expiring), `DiscordConnection` (tokens encrypted with AES-GCM).
- **Credits**: `CreditAccount` (cached balance + version) and append-only `CreditTransaction` rows with `balanceBefore/After`, reason, reference and an idempotency key. `CreditGrant` guarantees one-time promotions, `CreditPurchase` links Stripe checkouts, `ExportCharge` ties a job to its charge and hashes (for free re-exports), `CreditRefund` records returns.
- **Work**: `AssetUpload` (temporary, expiring, validated by magic bytes + SHA-256), `ProcessingJob` (+ `ProcessingEvent` timeline), `Creation` (persistent library entry) and immutable `CreationVersion` rows pointing at kept result objects.
- **Community**: `ShowcaseItem` (+ likes/views/reports), `Review` (moderated), `Referral`/`ReferralConversion`, `Partner`/`PartnerReferral`, CMS (`Guide`, `GuideCategory`, `ChangelogEntry`).
- **Server Hub**: `ServerHubProject`, `ServerHubToken` (hashed, revocable), `ServerHubDataset`, `ServerHubLog` (indexed by project/time/level/dataset/resource/player, serialized metadata for text search, retention expiry), `ServerHubMedia`, `MediaReservation` (one-time upload slots), `StorageQuota`.
- **Platform**: `Notification`, `AuditLog`, `FeatureFlag`, `SystemSetting`, `ToolConfig`, `AdminUser`, `StripeWebhookEvent`, `EmailOutbox`.

## Job lifecycle

1. Client uploads files: `POST /api/v1/uploads` returns a signed PUT URL (or multipart part URLs for > 64 MiB). Bytes go straight to the bucket. `POST /uploads/:id/complete` verifies size, sniffs the real content type, rejects spoofed/executable content and computes SHA-256.
2. `POST /api/v1/jobs` → `createJob()` validates the tool (enabled, verification, subscription), parses config with the tool's Zod schema, computes `sourceHash` (from upload hashes) and `configHash` (canonical JSON, non-semantic keys stripped), checks the free re-export window, holds credits via the ledger (row lock), creates the `Creation`/`ProcessingJob`, enqueues to BullMQ and publishes a Redis event.
3. Worker picks the job, streams progress (`recordJobProgress` → DB event + Redis pub/sub → SSE `GET /jobs/:id/events`), runs the processor, uploads the ZIP/artifacts.
4. `completeJob()` creates the `CreationVersion`, marks the creation READY, deletes the temporary source objects (finished resources are kept), notifies (in-app, email, Discord DM) and qualifies a referral on the user's first completed export. `failJob()` refunds the held credits automatically and notifies.
5. `purpose: "inspect"` jobs are free preview conversions for editors (see `PROCESSING_CONTRACT.md`).

## Credits

`applyLedgerEntry()` runs `SELECT … FOR UPDATE` on the account row, rejects any debit that would go below zero, writes the transaction with before/after balances and updates lifetime counters. Concurrency is covered by `credits.int.test.ts` (10 parallel debits against 100 credits → exactly 3 succeed).

## Billing

Only `packages/services/src/billing.ts` talks to Stripe. Checkout Sessions carry our purchase/subscription ids in metadata; webhooks are verified with the raw body and processed idempotently (`StripeWebhookEvent` + ledger idempotency keys). Subscription state (status, period, cancel-at-period-end, grace period on failed payments, monthly credit allocation once per period) is synced from `customer.subscription.*` and `invoice.*` events. Refunds claw back remaining credits without going negative.

## Security model

Argon2id hashing; HttpOnly/SameSite cookies; CSRF via Origin/Sec-Fetch-Site checks plus a double-submit token; strict CSP and security headers (`next.config.ts`); Prisma parameterized queries; Redis sliding-window rate limits on auth, uploads, jobs, AI, imports, ingestion, media, reviews and generic API traffic; upload validation by extension allowlist, magic bytes, size and archive inspection (worker rejects traversal/bombs/executables); SSRF-safe allow-listed fetching for external imports; Stripe/Discord signature/state validation; server tokens HMAC-hashed and cached briefly; Discord tokens encrypted at rest; every admin mutation audited; secrets only via environment variables.

## Observability

Structured pino logs (web + worker), per-job events and durations in `ProcessingEvent`, queue depth via BullMQ counts, worker heartbeats in Redis, Stripe webhook failures and email failures persisted, `/admin/health` aggregating database/Redis/storage/workers/queues/Stripe/Discord/email/AI status. `SENTRY_DSN` can be wired into `logger.ts` for error tracking.
