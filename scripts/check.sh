#!/usr/bin/env bash
# Syntax-check every JS file in the server, website and scripts. Run before every push.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in packages/server/src/*.js packages/server/src/game/*.js website/*.js scripts/*.mjs scripts/tests/*.mjs; do
  [ -f "$f" ] || continue
  node --check "$f" || { echo "SYNTAX ERROR: $f"; fail=1; }
done
[ $fail -eq 0 ] && echo "check: all files parse" || exit 1
