#!/usr/bin/env bash
# Privacy gate: no console output and no network calls outside the payments
# module may exist in shipped source. Run before every release.
set -u
fail=0

hits=$(grep -rn "console\." src --include='*.ts' | grep -v '^src/payments/' || true)
if [ -n "$hits" ]; then
  echo "FAIL: console.* in shipped source (could leak values):"
  echo "$hits"
  fail=1
fi

hits=$(grep -rn "fetch(\|XMLHttpRequest\|navigator\.sendBeacon\|new WebSocket" src --include='*.ts' | grep -v '^src/payments/' || true)
if [ -n "$hits" ]; then
  echo "FAIL: network primitives outside src/payments/:"
  echo "$hits"
  fail=1
fi

if [ $fail -eq 0 ]; then
  echo "privacy check OK: no console output, no network outside payments"
fi
exit $fail
