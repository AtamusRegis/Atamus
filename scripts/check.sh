#!/usr/bin/env bash
# Syntax-check every JS file in the server, website and scripts. Run before every push.
# Files are tried as CommonJS first, then as ES modules (game3d.js and the server are ESM).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in packages/server/src/*.js packages/server/src/game/*.js website/*.js scripts/*.mjs; do
  [ -f "$f" ] || continue
  node --check "$f" 2>/dev/null || node --input-type=module --check < "$f" 2>/dev/null \
    || { echo "SYNTAX ERROR: $f"; node --input-type=module --check < "$f" || true; fail=1; }
done
[ $fail -eq 0 ] && echo "check: all files parse" || exit 1
