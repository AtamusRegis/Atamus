#!/usr/bin/env bash
#
# Redeploy the latest main to the running server.
# Installed to /usr/local/bin/atamus-deploy by setup.sh, and run as the
# forced command for the GitHub deploy key — so that key can ONLY redeploy,
# never open a shell.
#
set -euo pipefail

APP_DIR="/opt/atamus"
SERVER_SUBDIR="packages/server"

echo "==> Pulling latest main"
sudo -u atamus bash -c "
  set -e
  git config --global --add safe.directory '${APP_DIR}' 2>/dev/null || true
  cd '${APP_DIR}'
  git fetch --depth 1 origin main
  git reset --hard origin/main
  cd '${SERVER_SUBDIR}'
  npm install --omit=dev --no-audit --no-fund
  git -C '${APP_DIR}' rev-parse --short HEAD > BUILD
"

echo "==> Restarting service"
systemctl restart atamus

REV="$(git -C "${APP_DIR}" rev-parse --short HEAD)"
echo "==> Deployed ${REV}"
