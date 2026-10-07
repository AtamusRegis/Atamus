#!/usr/bin/env bash
#
# Atamus server bootstrap. Run once on a fresh Ubuntu box as root:
#
#   curl -fsSL https://raw.githubusercontent.com/AtamusRegis/atamus/main/scripts/setup.sh | sudo bash
#
# It is safe to re-run: it updates to the latest code and restarts the service.
#
set -euo pipefail

DOMAIN="play.atamus.io"
APP_DIR="/opt/atamus"
REPO="https://github.com/AtamusRegis/atamus.git"
NODE_VERSION="v22.11.0"
SERVER_SUBDIR="packages/server"

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

if [[ $EUID -ne 0 ]]; then echo "Please run as root (use sudo)."; exit 1; fi

# ---------------------------------------------------------------- swap
if ! swapon --show | grep -q .; then
  log "Creating 2G swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- packages
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates ufw postgresql postgresql-contrib \
  debian-keyring debian-archive-keyring apt-transport-https

# ---------------------------------------------------------------- Node.js
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != "$NODE_VERSION" ]]; then
  log "Installing Node.js $NODE_VERSION"
  TARBALL="node-${NODE_VERSION}-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}" -o "/tmp/${TARBALL}"
  rm -rf /usr/local/lib/nodejs-atamus
  mkdir -p /usr/local/lib/nodejs-atamus
  tar -xJf "/tmp/${TARBALL}" -C /usr/local/lib/nodejs-atamus --strip-components=1
  ln -sf /usr/local/lib/nodejs-atamus/bin/node /usr/local/bin/node
  ln -sf /usr/local/lib/nodejs-atamus/bin/npm  /usr/local/bin/npm
  rm -f "/tmp/${TARBALL}"
fi
log "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------- Caddy (auto HTTPS)
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ---------------------------------------------------------------- firewall
log "Configuring firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable

# ---------------------------------------------------------------- database
log "Configuring PostgreSQL"
systemctl enable --now postgresql
ENV_FILE="${APP_DIR}/server.env"
if [[ -f "$ENV_FILE" ]]; then
  # Reuse the existing DB password on re-runs.
  DB_PASS="$(grep -oP 'postgres://atamus:\K[^@]+' "$ENV_FILE" || true)"
fi
if [[ -z "${DB_PASS:-}" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atamus') THEN
    CREATE ROLE atamus LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE atamus PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE atamus OWNER atamus'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'atamus')\gexec
SQL

# ---------------------------------------------------------------- app user + code
if ! id atamus >/dev/null 2>&1; then
  log "Creating atamus service user"
  useradd --system --create-home --home-dir /home/atamus --shell /usr/sbin/nologin atamus
fi

log "Fetching application code"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

log "Installing server dependencies"
cd "${APP_DIR}/${SERVER_SUBDIR}"
npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------- env file
log "Writing environment file"
cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://atamus:${DB_PASS}@127.0.0.1:5432/atamus
ALLOWED_ORIGINS=https://atamus.io,https://www.atamus.io
SESSION_TTL_DAYS=30
RECOVERY_TTL_MINUTES=15
ENV
chmod 600 "$ENV_FILE"
chown -R atamus:atamus "$APP_DIR"

# ---------------------------------------------------------------- systemd service
log "Installing systemd service"
cat > /etc/systemd/system/atamus.service <<UNIT
[Unit]
Description=Atamus game server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=atamus
WorkingDirectory=${APP_DIR}/${SERVER_SUBDIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/node src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable atamus
systemctl restart atamus

# ---------------------------------------------------------------- Caddy reverse proxy
log "Configuring Caddy for ${DOMAIN}"
cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl enable caddy
systemctl restart caddy

log "Done. Check status with:  systemctl status atamus caddy --no-pager"
echo "Health check (after DNS + TLS settle):  curl https://${DOMAIN}/healthz"
