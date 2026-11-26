#!/usr/bin/env bash
# LW-SP-01 — compose invariants: loopback HTTP, worker not in default services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
f="$ROOT/docker-compose.leaseweb.yml"
grep -q 'SMARTPROTO_HTTP_BIND:-127.0.0.1' "$f"
grep -q 'profiles: \["worker"\]' "$f"
if grep -A2 'smartproto-worker:' "$f" | grep -q 'profiles'; then
  :
else
  echo "worker missing profiles" >&2
  exit 1
fi
echo "test-lw-sp-01-compose: PASS"
