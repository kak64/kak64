# Modsmith

Browser-based FiveM asset workshop: create props, add-on vehicles, liveries, clothing textures, weapon skins, tattoos, face skins and accessories in the browser, send heavy conversions to background workers, keep every finished resource in **My Creations**, and pay with credits (Stripe). A second product inside the same account — **Server Hub** — gives FiveM servers searchable structured logs, private screenshots and phone-media storage behind server-scoped tokens.

> Modsmith is an original product. It is not affiliated with Rockstar Games, Take-Two Interactive or Cfx.re.

## Stack

| Layer | Technology |
| --- | --- |
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix-based UI kit, Three.js / React Three Fiber |
| API | Next.js route handlers under `/api/v1/*` and `/hub-ingest/v1/*`, Zod validation, consistent `{ success, data, error }` envelope |
| Data | PostgreSQL 16 + Prisma ORM |
| Queue / cache / rate limits | Redis 7 + BullMQ |
| Workers | Separate Node process (`apps/worker`) with per-tool processors behind the `AssetProcessor` interface |
| Storage | S3-compatible private object storage (Cloudflare R2, MinIO, AWS S3) with short-lived signed URLs; `local` provider for development/tests |
| Payments | Stripe Checkout + Customer Portal + signed, idempotent webhooks |
| Auth | Argon2id passwords, HttpOnly cookie sessions stored in Postgres, CSRF double-submit + origin checks, Discord OAuth |
| Email | Provider abstraction (console / Resend / Postmark) |
| Tests | Vitest (unit + Postgres/Redis integration), Playwright (E2E) |
| Ops | Docker Compose (Postgres, Redis, MinIO, optional ClamAV), Dockerfiles for web and worker |

## Repository layout

```
modsmith/
  apps/web            Next.js app: marketing site, auth, workshop (/app), admin (/admin), API routes
  apps/worker         BullMQ workers + asset processors (prop, AI prop, car importer, vehicle, livery, retexture,
                      clothing, weapon, tattoo, face, accessory, optimizer, inspect, sketchfab, maintenance)
  packages/core       Tool registry, Zod schemas, API envelope, AssetProcessor interface, constants
  packages/db         Prisma schema, migrations, seed
  packages/services   Shared server services: env, storage, credits ledger, jobs, billing, hub, email, discord…
  packages/rage       RAGE resource formats (RSC7, .ytd/.ydr/.yft/.ydd/.ybn readers, native + CodeWalker-XML writers, DDS)
  packages/hub-resource/msmhub   FiveM Lua resource for Server Hub (logs, screenshots, phone adapters)
  docs/               Architecture, deployment, setup guides, processing contract
```

## Install on your own server

```bash
curl -fsSL https://raw.githubusercontent.com/kak64/kak64/claude/fivem-creator-saas-fzdabu/modsmith/scripts/install.sh \
  | sudo bash -s -- --domain modsmith.example.com
cd /opt/modsmith/modsmith && node scripts/smoke-test.mjs
```

See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for what it does and how to do it by hand.

## Quick start (local)

```bash
cd modsmith
cp .env.example .env            # edit APP_SECRET / ENCRYPTION_KEY at minimum
docker compose up -d            # Postgres, Redis, MinIO (bucket "modsmith" is created automatically)
pnpm install
pnpm db:migrate                 # applies Prisma migrations
pnpm db:seed                    # tools, credit packs, plans, guides, changelog, partners, flags, admin user
pnpm dev                        # web on http://localhost:3000 + worker (tsx watch)
```

The seed creates an admin account from `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` (defaults `admin@modsmith.local` / `admin` / `ChangeMe123!`).

Without Docker you can point `DATABASE_URL`/`REDIS_URL` at local services and set `STORAGE_PROVIDER=local` (objects are written under `LOCAL_STORAGE_DIR` and served through signed app URLs — development only).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm dev:web` / `pnpm dev:worker` | Development servers |
| `pnpm build` | Generates Prisma client and builds the web app (standalone output) |
| `pnpm typecheck`, `pnpm lint` | Type-check / lint every package |
| `pnpm test` | Vitest unit + integration tests (needs Postgres `modsmith_test` and Redis; `SKIP_DB_TESTS=1` to run unit tests only) |
| `pnpm test:e2e` | Playwright end-to-end tests (see `docs/TESTING.md`) |
| `pnpm db:migrate:dev` | Create a new migration from schema changes |
| `pnpm db:seed` | Seed reference data |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, data model, job lifecycle, credit ledger, security model
- [`docs/WINDOWS.md`](docs/WINDOWS.md) — running on Windows Server, via WSL2 or natively
- [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) — step-by-step deployment on your own server, with a full export test
- [`docs/SETUP.md`](docs/SETUP.md) — Postgres, Redis, object storage, Stripe, Discord, email, AI provider, Sketchfab
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment (Docker, scaling workers, backups, disaster recovery)
- [`docs/TESTING.md`](docs/TESTING.md) — unit, integration and E2E test instructions
- [`docs/PROCESSING_CONTRACT.md`](docs/PROCESSING_CONTRACT.md) — web ⇄ worker ⇄ rage contract
- [`docs/SERVER_HUB.md`](docs/SERVER_HUB.md) — Server Hub API and the `msmhub` resource
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — **what is verified, what is best-effort and what is not implemented**
- [`docs/AGENT_BRIEF.md`](docs/AGENT_BRIEF.md) — engineering conventions

## Product principles (enforced in code)

1. A job marked completed always corresponds to a real artifact in object storage (`completeJob` requires the result key).
2. Credits live in an append-only ledger with row locks; the browser never decides a balance or a job status.
3. Credits are held when a job is queued and **automatically returned** on failure or cancellation; users only pay for successful builds. Same file + same settings within 7 days is free (hash-based, filename-independent).
4. Private objects are only reachable through short-lived signed URLs; Server Hub tokens are HMAC-hashed at rest and scoped to one server.
5. Tool pricing, gating, credit bonuses, retention and storage limits are database settings editable in `/admin`.
6. AI providers, storage providers, email providers, payment integration and FiveM phone integrations are all behind replaceable adapters.
7. Every administrative mutation is written to `AuditLog`.
