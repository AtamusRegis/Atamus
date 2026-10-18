#!/usr/bin/env bash
# Syntax-check every JS file in the server, website and scripts. Run before every push.
# Files are tried as ES modules first (game3d.js and the server are ESM), then as CommonJS.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in packages/server/src/*.js packages/server/src/game/*.js website/*.js scripts/*.mjs; do
  [ -f "$f" ] || continue
  # ES module check first: a plain `node --check` can pass a broken ES module (Node 22 falls back to treating it as a
  # module and doesn't report the error), which once let a broken game page reach live (2026-10-14)
  node --input-type=module --check < "$f" 2>/dev/null || node --input-type=commonjs --check < "$f" 2>/dev/null \
    || { echo "SYNTAX ERROR: $f"; node --input-type=module --check < "$f" || true; fail=1; }
done
[ $fail -eq 0 ] && echo "check: all files parse" || exit 1
