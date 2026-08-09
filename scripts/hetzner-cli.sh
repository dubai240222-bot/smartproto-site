#!/bin/bash
# SP-A-056 — installed as /usr/local/bin/smartproto on the Hetzner host.
# Controls the editorial worker mode without touching GitHub/Vercel/Cursor.
set -euo pipefail

DATA_DIR="/opt/apps/smartproto/data"
MODE_FILE="$DATA_DIR/worker-mode.json"
STATE_FILE="$DATA_DIR/worker-state.json"

mkdir -p "$DATA_DIR"

case "${1:-}" in
  off|single|auto|test-auto)
    printf '{"mode":"%s","setAt":"%s"}\n' "$1" "$(date -u +%FT%TZ)" > "$MODE_FILE"
    echo "SmartProto worker mode set to: $1"
    ;;
  status)
    echo "=== mode ==="
    cat "$MODE_FILE" 2>/dev/null || echo "(no mode file yet — worker not started)"
    echo "=== last run state ==="
    cat "$STATE_FILE" 2>/dev/null || echo "(no runs yet)"
    echo "=== containers ==="
    docker ps --filter "name=smartproto-" --format '{{.Names}}\t{{.Status}}'
    echo "=== web health ==="
    curl -fsS http://127.0.0.1:3100/api/health 2>&1 || echo "web not responding"
    ;;
  *)
    echo "usage: smartproto {off|single|auto|test-auto|status}"
    exit 1
    ;;
esac
