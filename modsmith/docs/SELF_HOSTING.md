# Self-hosting Modsmith on your own server

This is the path for: **your own Linux server**, **local-disk storage**, and a **full test including a real export**. It assumes a fresh Ubuntu 22.04 or Debian 12 box with a public IP and root access.

Local-disk storage means uploads and finished resources are written to a directory on the server and served through short-lived signed URLs from the app itself. It is the quickest way to test everything. It is **not** what you want long term: see [Moving to real object storage](#moving-to-real-object-storage) at the end.

---

## The short version

On a fresh Ubuntu or Debian server, one command does everything in this guide:

```bash
curl -fsSL https://raw.githubusercontent.com/kak64/kak64/claude/fivem-creator-saas-fzdabu/modsmith/scripts/install.sh \
  | sudo bash -s -- --domain modsmith.example.com
```

It installs Node, pnpm and Docker, clones the repository, generates real secrets, starts PostgreSQL
and Redis, migrates and seeds the database, builds the app, installs `modsmith-web` and
`modsmith-worker` as systemd services, configures Caddy with an automatic certificate, and prints
your admin password. Re-running it updates the code and leaves your secrets, database and files
alone. Use `--no-tls` instead of `--domain` to try it on `http://SERVER_IP:3000` first.

Then check the install actually works:

```bash
cd /opt/modsmith/modsmith && node scripts/smoke-test.mjs
```

That drives the real API end to end: registration, email verification, a model upload with
server-side content checks, a spoofed-file rejection, credit pricing and holding, a real export
through the worker, the ZIP contents, the free re-export window, Server Hub ingestion and search,
and the authorization boundaries. Thirteen checks, and it cleans up after itself.

The rest of this guide is the same thing done by hand, plus the reference material.

---

## 1. What the server needs

| | Minimum | Comfortable |
| --- | --- | --- |
| CPU | 2 cores | 4+ cores (the worker is CPU-bound) |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 60 GB+ (finished resources are kept forever) |

Install Node 22, pnpm, git and Docker:

```bash
apt update && apt install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
corepack enable && corepack prepare pnpm@10.33.0 --activate
curl -fsSL https://get.docker.com | sh
node -v && pnpm -v && docker -v
```

## 2. Get the code

```bash
git clone https://github.com/kak64/kak64.git /opt/modsmith-repo
cd /opt/modsmith-repo
git checkout claude/fivem-creator-saas-fzdabu
cd modsmith
pnpm install
```

The application lives in the `modsmith/` subdirectory. Every command below runs from there.

## 3. Start Postgres and Redis

```bash
docker compose up -d postgres redis
docker compose ps
```

Both must report `healthy`. MinIO is behind an `s3` profile and is deliberately not started, because this guide uses local-disk storage.

## 4. Configure

```bash
cp .env.example .env
```

Edit `.env`. These are the values that matter for this setup:

```bash
APP_URL=https://modsmith.example.com      # your real public URL, or http://SERVER_IP:3000 to try it quickly
APP_SECRET=<openssl rand -base64 48>
ENCRYPTION_KEY=<openssl rand -base64 32>

DATABASE_URL=postgresql://modsmith:modsmith@localhost:5432/modsmith?schema=public
REDIS_URL=redis://localhost:6379

STORAGE_PROVIDER=local
LOCAL_STORAGE_DIR=/var/lib/modsmith/storage

EMAIL_PROVIDER=console                    # verification links get printed to the log
AI_3D_PROVIDER=mock                       # real image-to-3D geometry, no API key needed

ADMIN_EMAIL=you@example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<a strong password>
```

Generate the two secrets properly. They sign session cookies and encrypt Discord tokens:

```bash
echo "APP_SECRET=$(openssl rand -base64 48)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
mkdir -p /var/lib/modsmith/storage
```

**`APP_URL` must be the URL your browser actually uses.** With local storage the app signs upload and download URLs against it, and browsers upload directly to those URLs. If it is wrong, uploads fail.

## 5. Create the schema and seed

```bash
pnpm db:migrate
pnpm db:seed
```

The seed creates the tools, credit packs, subscription plans, guides, changelog, partners, feature flags and your admin account from the `ADMIN_*` values.

## 6. Build and run

```bash
pnpm build
```

Run the web app and the worker as two services. Both must see the same `LOCAL_STORAGE_DIR`, because the web tier writes the upload and the worker reads it.

```ini
# /etc/systemd/system/modsmith-web.service
[Unit]
Description=Modsmith web
After=network.target docker.service

[Service]
WorkingDirectory=/opt/modsmith-repo/modsmith
EnvironmentFile=/opt/modsmith-repo/modsmith/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm --filter @modsmith/web start
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/modsmith-worker.service
[Unit]
Description=Modsmith worker
After=network.target docker.service

[Service]
WorkingDirectory=/opt/modsmith-repo/modsmith
EnvironmentFile=/opt/modsmith-repo/modsmith/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm --filter @modsmith/worker start
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now modsmith-web modsmith-worker
systemctl status modsmith-web modsmith-worker --no-pager
journalctl -u modsmith-worker -f      # should log "worker started" for four queues
```

### Alternative: run both in Docker

```bash
docker compose --profile app up -d --build
```

This builds both images and gives web and worker a shared `storage` volume, which is required for local-disk storage. Note the images are built from the same source but have not been built in the environment where this guide was written, so prefer the systemd path for a first run.

## 7. Put it behind HTTPS

Local-disk storage sends file bytes through the app, so raise the upload limit. With Caddy:

```
modsmith.example.com {
    reverse_proxy localhost:3000 {
        flush_interval -1          # required: job progress uses Server-Sent Events
    }
    request_body {
        max_size 2GB
    }
}
```

With Nginx:

```nginx
server {
    server_name modsmith.example.com;
    client_max_body_size 2G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Job progress and notifications stream; buffering would stall them.
    location ~ ^/api/v1/(jobs/[^/]+/events|notifications/stream)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

Then `certbot --nginx -d modsmith.example.com`. Set `APP_URL` to the `https://` address and restart both services.

## 8. Test it, end to end

The fastest check is the script, which does all of the following automatically:

```bash
node scripts/smoke-test.mjs                          # against APP_URL from .env
node scripts/smoke-test.mjs --url http://1.2.3.4:3000 --keep
```

To do it by hand instead:

1. **Sign up.** Open `APP_URL`, click Create free account. You should land in the workshop with 150 credits.
2. **Verify the email.** No mail provider is configured, so the link is printed to the log:
   ```bash
   journalctl -u modsmith-web | grep -A 3 "EMAIL to"
   ```
   Open the `/verify?token=...` link. The balance becomes 200.
3. **Open the Prop Creator** at `/app/tools/prop-creator`.
4. **Upload a model.** Any OBJ, FBX, glTF, GLB or DAE file. If you have none, generate the test cube used by the automated suite:
   ```bash
   cd /opt/modsmith-repo/modsmith/apps/web
   pnpm exec tsx -e 'import {cubeGlb} from "./e2e/fixtures"; import {writeFileSync} from "node:fs"; writeFileSync("/tmp/cube.glb", cubeGlb());'
   ```
   Download `/tmp/cube.glb` to your machine and drop it in.
5. **Configure and export.** Set a prop name, pick box collision, leave automatic LODs on, press Export resource. It costs 40 credits, held immediately.
6. **Watch it build.** The stage list advances through validation, converting, LODs, textures and packaging. You can close the tab; it keeps running.
7. **Download the ZIP** from My Creations. Inside you get `fxmanifest.lua`, `client/spawn.lua`, a real binary `stream/<name>.ytd`, and `stream/<name>.ydr.xml`, `.ybn.xml`, `.ytyp.xml` plus a README explaining the CodeWalker import step. See `docs/LIMITATIONS.md` for why those three are XML.
8. **Check the refund path.** Upload a broken file, export it, and watch the job fail and your credits come back. The ledger at `/app/credits` shows the debit and the matching return.
9. **Check the admin panel** at `/admin` with the seeded admin account. `/admin/health` should show the database, Redis, storage and worker all green.

### Test the Server Hub against a real FiveM server

1. `/app/hub`, create a server, generate a token. **Copy it now**, it is shown once.
2. Download the resource from the same page, or `curl -O` from `/api/v1/server-hub/resource`.
3. Drop `msmhub` into your FiveM `resources/` folder and add to `server.cfg`:
   ```
   set msmhub_token "msh_..."
   set msmhub_endpoint "https://modsmith.example.com"
   ensure msmhub
   ```
4. Restart. Join the server, then look at `/app/hub/logs`. You should see `msmhub started` and player join and drop events.
5. From any resource: `exports.msmhub:info("Item moved", { dataset = "inventory", metadata = { item = "lockpick" }, source = src })`, then search for `lockpick` in the log explorer.

## 9. Run the automated suite on the server

```bash
docker exec -it modsmith-postgres-1 psql -U modsmith -c 'CREATE DATABASE modsmith_test'
pnpm test                 # 268 unit and integration tests
pnpm --filter @modsmith/web exec playwright install --with-deps chromium
pnpm test:e2e             # 36 end-to-end tests against the running app
```

## Moving to real object storage

Local disk is fine for testing and for a single small server. Switch to S3-compatible storage before you take real users, because file bytes currently pass through the app process and nothing is replicated. Cloudflare R2 has no egress fees and is what the project is written for:

```bash
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=modsmith
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

Keep the bucket private and allow `PUT` and `GET` from your `APP_URL` origin in its CORS rules, exposing the `ETag` header. Nothing else changes: uploads then go straight from the browser to the bucket and never touch your server.

## Backups

- **Postgres** holds the credit ledger, creations and audit log. `docker exec modsmith-postgres-1 pg_dump -U modsmith modsmith | gzip > backup.sql.gz`, nightly.
- **`LOCAL_STORAGE_DIR`** holds every finished resource. Losing it loses users' downloads.
- **Redis** only holds queues and rate limits. Losing it loses jobs that had not started; held credits can be refunded from `/admin/jobs`.

## If something does not work

| Symptom | Cause |
| --- | --- |
| Upload fails immediately | `APP_URL` does not match the URL in your browser |
| Upload fails at ~1 MB | Reverse proxy body size limit |
| Job stays queued forever | Worker not running. Check `journalctl -u modsmith-worker` |
| Job fails with a storage error | Web and worker are using different `LOCAL_STORAGE_DIR` values |
| Progress bar never moves | Proxy is buffering. Apply the SSE settings in section 7 |
| No verification email | Expected with `EMAIL_PROVIDER=console`. Read the link from the log |
