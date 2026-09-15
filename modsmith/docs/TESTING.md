# Testing

## Unit & integration (Vitest)
```bash
docker compose up -d postgres redis        # or local services
pnpm test                                   # all packages
SKIP_DB_TESTS=1 pnpm test                   # unit tests only (no Postgres/Redis)
```
Integration suites (`*.int.test.ts`) run against `TEST_DATABASE_URL` (default `modsmith_test`), apply migrations automatically and truncate tables between tests. Coverage includes: registration/duplicates/validation, login (email or username), suspended accounts, email verification (single-use, expiry, one-time bonus), password reset (silent for unknown emails, single use, session revocation), partner bonus + referral tracking; ledger balances, idempotency, concurrent debit race, one-time grants; job hold/charge/refund/cancel, free re-export hashing (filename-independent), verification gating, inspect jobs; Stripe webhook idempotency, subscription payment failure/renewal allocation; Server Hub token scoping/revocation, ingestion dedupe + IP stripping, media reservations (auth, magic bytes, single-use, expiry); upload validation (spoofed MIME, executables, oversized, wrong extension); RAGE format round-trips (`packages/rage`); worker ZIP safety and processors.

## End-to-end (Playwright)
```bash
pnpm --filter @modsmith/web exec playwright install chromium   # skip if browsers are preinstalled
pnpm dev                                                        # web + worker running with STORAGE_PROVIDER=local, EMAIL_PROVIDER=console
pnpm test:e2e
```
`apps/web/e2e/` covers: register → verify (token read from the database) → login → dashboard → open tool → upload sample → create job → monitor job (worker must be running) → view creation → download → purchase credits (Stripe test mode; skipped unless `STRIPE_SECRET_KEY` is a test key) → Discord (skipped unless configured) → Server Hub project + token → ingest a log with the bearer token → search the log.
