# Setup guide

All secrets and external services are configured through environment variables (`.env.example` lists every one).

## PostgreSQL
`DATABASE_URL=postgresql://user:pass@host:5432/modsmith?schema=public`. Run `pnpm db:migrate` (production: `prisma migrate deploy`) and `pnpm db:seed` once. Integration tests use `TEST_DATABASE_URL` (a separate database).

## Redis
`REDIS_URL=redis://host:6379`. Used for BullMQ queues, rate limiting, short caches and pub/sub for live job/notification streams. Use a persistent Redis (AOF) so queued jobs survive restarts.

## Object storage (Cloudflare R2 / MinIO / S3)
```
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # or http://localhost:9000 for MinIO
S3_REGION=auto
S3_BUCKET=modsmith
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true     # MinIO; false for R2/AWS virtual-hosted
```
The bucket must be **private**. Configure CORS on the bucket to allow `PUT` from your `APP_URL` origin (direct-to-storage uploads) with `ETag` exposed: methods `PUT,GET`, headers `*`, expose headers `ETag`. Signed URLs expire after 5 minutes (`LIMITS.SIGNED_URL_TTL_SECONDS`).

## Stripe
1. Create products/prices (optional — packs and plans without `stripePriceId` use inline `price_data`).
2. `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
3. Webhook endpoint: `https://<host>/api/v1/billing/webhook` with events `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`; put the signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Enable the Customer Portal in the Stripe dashboard (used by `/app/billing`).
5. Local testing: `stripe listen --forward-to localhost:3000/api/v1/billing/webhook`.

## Discord
Create an application → OAuth2: redirect `https://<host>/api/v1/auth/discord/callback`, scope `identify`. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. For DM notifications create a bot (`DISCORD_BOT_TOKEN`) and invite it to your community guild (`DISCORD_GUILD_ID`) — users must share a guild with the bot to receive DMs. `DISCORD_WEBHOOK_URL` receives abuse reports and important system events.

## Email
`EMAIL_PROVIDER=console|resend|postmark` with `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`, and `EMAIL_FROM`. Templates live in `packages/services/src/email.ts`; every send is recorded in `EmailOutbox`.

## AI image-to-3D
`AI_3D_PROVIDER=mock|tripo|meshy|custom`, `AI_3D_API_KEY`, `AI_3D_ENDPOINT`. Providers are implemented in `apps/worker/src/ai/`. `mock` builds real relief geometry from the image so the pipeline can be exercised without an external service.

## Sketchfab
`SKETCHFAB_API_TOKEN` (required for downloads). Imports store license/author/source and the export writes `CREDITS.txt`.

## Malware scanning
`MALWARE_SCANNER=clamav` with `CLAMAV_HOST/PORT` (docker compose profile `scan`).

## Worker
`WORKER_CONCURRENCY`, `WORKER_TMP_DIR`. Optional external tooling: `CODEWALKER_CLI` (path to a CodeWalker-compatible XML→binary converter) and `BLENDER_BIN` for future Blender-backed processors.

## Admin bootstrap
`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` are used by the seed to create the first admin.
