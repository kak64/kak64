# Server Hub

Server Hub is a second product inside a Modsmith account: server-scoped bearer tokens, structured log ingestion with custom datasets, searchable logs, private screenshots and phone media with one-time upload reservations.

## Tokens
Created in `/app/hub/servers/<id>`; shown once; stored as HMAC-SHA256; revoke/regenerate any time. A token can only write to its own server and can never read dashboard data.

## Logging API
`POST /hub-ingest/v1/logs` — `Authorization: Bearer <token>` — body: array of 1–100 events, ≤ 1 MiB.
```json
[{ "id": "optional-idempotency-id", "level": "info", "message": "Item moved", "resource": "inventory", "dataset": "inventory", "timestamp": 1700000000, "metadata": { "item": "lockpick", "count": 2 }, "player": { "source": 12, "license": "license:…", "discord": "1234", "name": "Alice" } }]
```
Levels: debug, info, warn, error, fatal. Dataset names: letters, numbers, `.`, `_`, `-`, ≤ 48 chars. Duplicate ids are ignored (202 with `duplicates`). IP-like metadata keys are stripped. Retention per plan (`hub.defaultRetentionDays` for free accounts).

## Search
`GET /api/v1/server-hub/logs?projectId=&from=&to=&level=&dataset=&resource=&player=&q=&cursor=&limit=` searches message and serialized metadata; cursor pagination.

## Screenshots
`POST /hub-ingest/v1/screenshots` (multipart `file` + `metadata` JSON, or raw body + `X-Metadata`). The `msmhub` resource asks the client to capture with `screencapture` / `screenshot-basic`, then uploads to a one-time URL — the server token never reaches the client.

## Phone media
1. Server: `POST /hub-ingest/v1/media/reservations` `{ kind, mime, maxBytes, metadata }` → `{ uploadUrl, expiresIn }` (5 min, single use).
2. Client/NUI: `PUT uploadUrl` with the image bytes (or base64 with `Content-Transfer-Encoding: base64`).
3. API validates magic bytes (JPEG/PNG/WebP), size, stores privately, returns `mediaId` + `url`.
Adapters for LB Phone, Quasar, YSeries, CodeM, nPhone, JPR and custom phones live in `packages/hub-resource/msmhub/server/phone/` and all call the same generic media service.

## Security
Private bucket; signed URLs (≤ 10 min); MIME + magic-byte verification; size limits; ownership checks on every dashboard route; server-level authorization for ingestion; expired reservations and retention handled by the maintenance worker; storage quota per account.
