# Deployment

## Topology
- **web**: stateless Next.js standalone server (`docker/web.Dockerfile`), scale horizontally behind a load balancer/CDN. Sticky sessions are not required (sessions live in Postgres, CSRF in cookies, SSE streams are per-connection).
- **worker**: `docker/worker.Dockerfile`; scale by adding replicas. CPU/memory heavy — give each replica several cores and ≥ 4 GB RAM; set `WORKER_CONCURRENCY` per replica. Queues: `processing`, `ai-generation`, `external-imports`, `maintenance`.
- **postgres**, **redis** (persistent), **object storage** (R2/S3), optional **clamav**.

## Build & run
```bash
docker compose --profile app build
docker compose --profile app up -d
docker compose exec web sh -c "cd /app && node -e 0"   # web container is standalone; run migrations from CI or a one-off job:
pnpm --filter @modsmith/db migrate:deploy               # from a machine with DATABASE_URL set
```
Run `prisma migrate deploy` in CI before rolling out a new image. The seed is idempotent and safe to re-run.

## Environment
Set every variable in `.env.example`. Generate secrets: `openssl rand -base64 48` (`APP_SECRET`), `openssl rand -base64 32` (`ENCRYPTION_KEY`). `APP_URL` must be the public HTTPS origin (used for cookies, CSRF origin checks, OAuth redirects, signed local URLs and email links).

## Reverse proxy
Terminate TLS at the proxy, forward `X-Forwarded-For` (rate limits and audit hashing use it) and disable response buffering for `/api/v1/jobs/*/events` and `/api/v1/notifications/stream` (SSE). Allow request bodies up to ~16 MiB on `/hub-ingest/v1/*` (media) — regular uploads never pass through the app.

## Backups & disaster recovery
- Postgres: nightly `pg_dump` + WAL archiving (point-in-time recovery). The ledger, creations and audit logs are the system of record.
- Object storage: enable bucket versioning/lifecycle; results under `results/` are permanent until the user deletes a creation, `uploads/` are temporary (24 h), `hub/` follows retention.
- Redis: AOF persistence; losing Redis loses queued (not yet started) jobs — held credits remain and can be refunded from `/admin/jobs` (retry or refund).
- Recovery order: restore Postgres → restore bucket → start Redis → start web → start workers → re-run `/admin/health`.

## Scaling notes
- Heavy tools can be split onto dedicated worker pools by queue name (`queueForProcessor`).
- Move `ServerHubLog` to a partitioned table or a dedicated cluster when ingestion exceeds ~50M rows; the maintenance job already prunes by `expiresAt`.
- Put thumbnails behind a CDN via `S3_PUBLIC_BASE_URL` only for non-sensitive objects.

## Monitoring
Scrape the worker heartbeat hash and BullMQ counts (`/api/v1/admin/health`), alert on `StripeWebhookEvent.error`, `EmailOutbox.status = failed`, failed-job rate and queue depth.
