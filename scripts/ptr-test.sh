#!/usr/bin/env bash
# Regression + stress suite against the PTR. Starts the PTR if needed, runs every test in
# scripts/tests/, and fails if any check fails or the server logged a command error.
#   scripts/ptr-test.sh            # all tests
#   scripts/ptr-test.sh gameplay   # one test file (scripts/tests/<name>.mjs)
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="${PTR_DATA:-/var/tmp/atamus-ptr}/server.log"
scripts/check.sh || exit 1
scripts/ptr.sh start >/dev/null || exit 1
before=$(grep -c "command \|unhandledRejection" "$LOG" 2>/dev/null || true)
tests=("${@:-session fuzz gameplay ui}"); fail=0
for name in ${tests[@]}; do node "scripts/tests/$name.mjs" || fail=1; done
after=$(grep -c "command \|unhandledRejection" "$LOG" 2>/dev/null || true)
if [ "${after:-0}" != "${before:-0}" ]; then echo "✗ server logged errors during the run:"; grep -A3 "command \|unhandledRejection" "$LOG" | tail -20; fail=1; fi
curl -sf localhost:8090/healthz >/dev/null || { echo "✗ PTR server is down"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
