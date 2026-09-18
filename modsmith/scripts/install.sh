#!/usr/bin/env bash
#
# Modsmith installer for a single Linux server (Ubuntu 22.04+ / Debian 12+).
#
#   curl -fsSL https://raw.githubusercontent.com/kak64/kak64/claude/fivem-creator-saas-fzdabu/modsmith/scripts/install.sh | sudo bash -s -- --domain modsmith.example.com
#
# Or, having cloned the repository already:
#   sudo bash modsmith/scripts/install.sh --domain modsmith.example.com
#
# Safe to re-run: existing secrets, the database and uploaded files are left alone.
set -euo pipefail

REPO_URL="https://github.com/kak64/kak64.git"
BRANCH="claude/fivem-creator-saas-fzdabu"
INSTALL_DIR="/opt/modsmith"
STORAGE_DIR="/var/lib/modsmith/storage"
PORT="3000"
DOMAIN=""
USE_TLS="yes"
SKIP_DEPS="no"
SEED="yes"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)   DOMAIN="$2"; shift 2 ;;
    --dir)      INSTALL_DIR="$2"; shift 2 ;;
    --storage)  STORAGE_DIR="$2"; shift 2 ;;
    --branch)   BRANCH="$2"; shift 2 ;;
    --repo)     REPO_URL="$2"; shift 2 ;;
    --port)     PORT="$2"; shift 2 ;;
    --no-tls)   USE_TLS="no"; shift ;;
    --skip-deps) SKIP_DEPS="yes"; shift ;;
    --no-seed)  SEED="no"; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
      echo
      echo "Options:"
      echo "  --domain <host>   public hostname; enables HTTPS through Caddy"
      echo "  --no-tls          serve plain HTTP on the port instead (testing only)"
      echo "  --dir <path>      install directory (default $INSTALL_DIR)"
      echo "  --storage <path>  where uploads and finished resources live (default $STORAGE_DIR)"
      echo "  --branch <name>   git branch (default $BRANCH)"
      echo "  --port <n>        port the app listens on (default $PORT)"
      echo "  --skip-deps       do not install Node, pnpm or Docker"
      echo "  --no-seed         skip seeding reference data and the admin account"
      exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; DIM=$'\e[2m'; OFF=$'\e[0m'
step() { echo; echo "${GREEN}==>${OFF} $*"; }
warn() { echo "${YELLOW}warning:${OFF} $*" >&2; }
die()  { echo "${RED}error:${OFF} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run this as root (sudo bash $0 ...)"
command -v apt-get >/dev/null || die "this installer targets Debian and Ubuntu; follow docs/SELF_HOSTING.md manually on other distributions"
[[ -n "$DOMAIN" || "$USE_TLS" == "no" ]] || die "pass --domain <host> for HTTPS, or --no-tls to serve plain HTTP for testing"

if [[ "$USE_TLS" == "yes" ]]; then
  APP_URL="https://${DOMAIN}"
else
  PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  APP_URL="http://${DOMAIN:-$PUBLIC_IP}:${PORT}"
fi

# ── dependencies ─────────────────────────────────────────────────────────────
if [[ "$SKIP_DEPS" == "no" ]]; then
  step "Installing system dependencies"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates gnupg openssl jq >/dev/null

  if ! command -v node >/dev/null || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  corepack enable >/dev/null 2>&1 || npm i -g corepack >/dev/null
  corepack prepare pnpm@10.33.0 --activate >/dev/null

  command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  echo "   node $(node -v), pnpm $(pnpm -v), docker $(docker -v | awk '{print $3}' | tr -d ,)"
fi

# ── source ───────────────────────────────────────────────────────────────────
step "Fetching the source"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard --quiet "origin/$BRANCH"
  echo "   updated $INSTALL_DIR to $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  echo "   cloned into $INSTALL_DIR at $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
fi
APP="$INSTALL_DIR/modsmith"
[[ -f "$APP/package.json" ]] || die "$APP does not look like the application directory"
cd "$APP"

# ── configuration ────────────────────────────────────────────────────────────
step "Writing configuration"
mkdir -p "$STORAGE_DIR"
if [[ -f .env ]]; then
  echo "   .env already exists; keeping your secrets and only ensuring required keys"
else
  cp .env.example .env
fi
# Rewrites KEY=VALUE in .env, appending it when absent. Uses awk so that base64 secrets and URLs
# need no escaping, and avoids depending on python3 being installed.
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 } ; next }
    { print }
    END { if (!done) print k "=" v }
  ' .env > "$tmp"
  mv "$tmp" .env
}
current() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

if [[ -z "$(current APP_SECRET)" || "$(current APP_SECRET)" == *change-me* ]]; then
  set_env APP_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
fi
if [[ -z "$(current ENCRYPTION_KEY)" || "$(current ENCRYPTION_KEY)" == *change-me* ]]; then
  set_env ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
fi
ADMIN_PW="$(current ADMIN_PASSWORD)"
if [[ -z "$ADMIN_PW" || "$ADMIN_PW" == "ChangeMe123!" ]]; then
  ADMIN_PW="$(openssl rand -base64 18 | tr -d '\n/+=' | cut -c1-20)Aa1!"
  set_env ADMIN_PASSWORD "$ADMIN_PW"
fi
set_env APP_URL "$APP_URL"
set_env NODE_ENV production
set_env DATABASE_URL "postgresql://modsmith:modsmith@localhost:5432/modsmith?schema=public"
set_env TEST_DATABASE_URL "postgresql://modsmith:modsmith@localhost:5432/modsmith_test?schema=public"
set_env REDIS_URL "redis://localhost:6379"
set_env STORAGE_PROVIDER local
set_env LOCAL_STORAGE_DIR "$STORAGE_DIR"
set_env EMAIL_PROVIDER console
set_env AI_3D_PROVIDER mock
set_env PORT "$PORT"
chmod 600 .env
echo "   APP_URL=$APP_URL, storage=$STORAGE_DIR"

# ── datastores ───────────────────────────────────────────────────────────────
step "Starting PostgreSQL and Redis"
docker compose up -d postgres redis >/dev/null
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U modsmith >/dev/null 2>&1; then break; fi
  if [[ $i -eq 60 ]]; then die "PostgreSQL did not become ready; check 'docker compose logs postgres'"; fi
  sleep 2
done
docker compose exec -T postgres psql -U modsmith -d modsmith -c 'SELECT 1' >/dev/null
echo "   both healthy"

# ── build ────────────────────────────────────────────────────────────────────
step "Installing packages and building (this takes a few minutes)"
pnpm install --frozen-lockfile >/dev/null
pnpm db:migrate >/dev/null
if [[ "$SEED" == "yes" ]]; then
  set -a; . ./.env; set +a
  pnpm db:seed >/dev/null
fi
pnpm build >/dev/null
echo "   built"

# ── services ─────────────────────────────────────────────────────────────────
step "Installing services"
write_unit() {
  cat > "/etc/systemd/system/modsmith-$1.service" <<UNIT
[Unit]
Description=Modsmith $1
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP
EnvironmentFile=$APP/.env
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$(command -v pnpm) --filter @modsmith/$1 start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
}
write_unit web
write_unit worker
systemctl daemon-reload
systemctl enable --now modsmith-web modsmith-worker >/dev/null
echo "   modsmith-web and modsmith-worker enabled"

# ── reverse proxy ────────────────────────────────────────────────────────────
if [[ "$USE_TLS" == "yes" ]]; then
  step "Configuring HTTPS for $DOMAIN"
  if ! command -v caddy >/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
  cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    encode zstd gzip

    # Local-disk storage sends file bytes through the app, so allow large uploads.
    request_body {
        max_size 2GB
    }

    reverse_proxy localhost:${PORT} {
        # Job progress and notifications are Server-Sent Events; buffering would stall them.
        flush_interval -1
    }
}
CADDY
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  echo "   Caddy is serving $DOMAIN and will obtain a certificate automatically"
else
  warn "running without TLS on port $PORT; sessions and uploads are unencrypted. Use --domain for production."
fi

# ── verify ───────────────────────────────────────────────────────────────────
step "Checking the installation"
for i in $(seq 1 45); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:${PORT}/api/health" || true)"
  if [[ "$code" == "200" ]]; then break; fi
  if [[ $i -eq 45 ]]; then journalctl -u modsmith-web -n 30 --no-pager; die "the web service did not become healthy"; fi
  sleep 2
done
health="$(curl -s "http://localhost:${PORT}/api/health")"
echo "   $health"

cat <<SUMMARY

${GREEN}Modsmith is installed.${OFF}

  URL         $APP_URL
  Admin       $(current ADMIN_USERNAME)  /  $(current ADMIN_PASSWORD)
  Source      $APP
  Storage     $STORAGE_DIR   ${DIM}(back this up: finished resources live here)${OFF}

Next:
  ${DIM}# run the acceptance test against the live install${OFF}
  cd $APP && node scripts/smoke-test.mjs

  ${DIM}# follow the services${OFF}
  journalctl -u modsmith-web -u modsmith-worker -f

  ${DIM}# email is printed to the log rather than sent; find a verification link with${OFF}
  journalctl -u modsmith-web | grep -A3 'EMAIL to'

Change the admin password after your first login at $APP_URL/app/settings.
SUMMARY
