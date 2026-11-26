#!/usr/bin/env bash
# LW-SP-01 — compose invariants: loopback HTTP, worker not in default services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
f="$ROOT/docker-compose.leaseweb.yml"
grep -q 'SMARTPROTO_HTTP_BIND:-127.0.0.1' "$f"
grep -q 'profiles: \["worker"\]' "$f"
grep -q '/srv/projects/smartproto' "$f"
snap="$ROOT/scripts/lw-sp-01-snapshot.sh"
grep -q 's.backup(d)' "$snap"
grep -q "exclude '.env'" "$snap"
grep -q '/srv/projects/smartproto' "$snap"
if grep -A2 'smartproto-worker:' "$f" | grep -q 'profiles'; then
  :
else
  echo "worker missing profiles" >&2
  exit 1
fi
echo "test-lw-sp-01-compose: PASS"
