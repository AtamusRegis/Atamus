#!/usr/bin/env bash
#
# PTR: Claude's private test copy of Atamus. Runs entirely inside the workspace —
# its own throwaway Postgres + the game server in PTR mode (ATAMUS_PTR=1: no
# accounts, dev commands enabled) serving the website at http://localhost:8090.
# Never deployed; live players never see it.
#
#   scripts/ptr.sh start    # start (or restart the server after code changes)
#   scripts/ptr.sh stop
#   scripts/ptr.sh reset    # wipe the PTR database and start fresh
#   scripts/ptr.sh status
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${PTR_DATA:-/var/tmp/atamus-ptr}"
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
PGPORT=5433; PORT=8090

pg_up() {
  if [ ! -d "$DATA/pg" ]; then
    mkdir -p "$DATA"; chown postgres "$DATA"
    su postgres -c "$PG_BIN/initdb -D $DATA/pg -A trust -U postgres >/dev/null"
  fi
  if ! su postgres -c "$PG_BIN/pg_ctl -D $DATA/pg status" >/dev/null 2>&1; then
    su postgres -c "$PG_BIN/pg_ctl -D $DATA/pg -o '-p $PGPORT -k $DATA -c listen_addresses=127.0.0.1' -l $DATA/pg.log start -w >/dev/null"
  fi
  su postgres -c "psql -h 127.0.0.1 -p $PGPORT -tAc \"SELECT 1 FROM pg_database WHERE datname='atamus'\"" | grep -q 1 \
    || su postgres -c "createdb -h 127.0.0.1 -p $PGPORT atamus"
}
server_stop() { [ -f "$DATA/server.pid" ] && kill "$(cat "$DATA/server.pid")" 2>/dev/null || true; rm -f "$DATA/server.pid"; }
server_start() {
  server_stop
  (cd "$ROOT/packages/server" && [ -d node_modules ] || npm install --omit=dev --no-audit --no-fund >/dev/null)
  cd "$ROOT/packages/server"
  ATAMUS_PTR=1 PORT=$PORT DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/atamus" ALLOWED_ORIGINS="http://localhost:$PORT" \
    nohup node src/index.js > "$DATA/server.log" 2>&1 & echo $! > "$DATA/server.pid"
  for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/healthz" >/dev/null && break; sleep 0.3; done
  curl -sf "http://localhost:$PORT/healthz" >/dev/null && echo "PTR up: http://localhost:$PORT/game.html" || { echo "PTR server failed:"; tail -20 "$DATA/server.log"; exit 1; }
}

case "${1:-start}" in
  start)  pg_up; server_start ;;
  stop)   server_stop; su postgres -c "$PG_BIN/pg_ctl -D $DATA/pg stop -m fast" >/dev/null 2>&1 || true; echo "PTR stopped" ;;
  reset)  server_stop; su postgres -c "$PG_BIN/pg_ctl -D $DATA/pg stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DATA"; pg_up; server_start ;;
  status) curl -sf "http://localhost:$PORT/healthz" && echo || echo "PTR down" ;;
  *) echo "usage: $0 start|stop|reset|status"; exit 1 ;;
esac
