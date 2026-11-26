#!/usr/bin/env bash
# LW-SP-01 — start SmartProto WEB only on Leaseweb. Worker stays off.
# Run from the app checkout: /srv/projects/smartproto/app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f docker-compose.leaseweb.yml ]]; then
  echo "missing docker-compose.leaseweb.yml" >&2
  exit 1
fi
exec docker compose -f docker-compose.leaseweb.yml -p smartproto up -d --build smartproto-web
