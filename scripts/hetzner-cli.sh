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
  forced)
    # SP-A-063 — temporary burst for layout/image live check, then worker auto → test-auto.
    TARGET="${2:-2}"
    printf '{"mode":"forced","setAt":"%s","target":%s}\n' "$(date -u +%FT%TZ)" "$TARGET" > "$MODE_FILE"
    # Reset forced counter so a new burst starts clean.
    if [[ -f "$STATE_FILE" ]]; then
      python3 - "$STATE_FILE" <<'PY' || true
import json,sys
p=sys.argv[1]
try:
  s=json.load(open(p))
except Exception:
  s={}
s["forcedPublished"]=0
open(p,"w").write(json.dumps(s,indent=2)+"\n")
PY
    fi
    echo "SmartProto worker mode set to: forced (target=$TARGET publishes, then test-auto)"
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
    echo "usage: smartproto {off|single|auto|test-auto|forced [N]|status}"
    exit 1
    ;;
esac
