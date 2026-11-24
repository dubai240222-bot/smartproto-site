#!/usr/bin/env bash
# LEAN-001-02 — read-only SmartProto measurements for Hetzner HQ.
# No prune, no compose down, no other projects.
set -euo pipefail
echo "=== SP-LEAN-001-02 diag $(date -Is) ==="
echo "--- smartproto containers ---"
docker ps -a --filter name=smartproto --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo "--- stats ---"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' | grep -E 'NAME|smartproto' || true
echo "--- worker cmd / idle ---"
docker inspect smartproto-worker --format '{{json .Config.Cmd}}' 2>/dev/null || true
docker exec smartproto-worker sh -c 'echo IDLE=${SMARTPROTO_WORKER_IDLE_SEC:-unset} LIGHT=${SMARTPROTO_LIGHT:-unset}' 2>/dev/null || true
echo "--- worker tail ---"
docker logs smartproto-worker --tail 40 2>&1 | tail -40
echo "--- lock / mode ---"
ls -l /opt/apps/smartproto/data/worker-once.lock /opt/apps/smartproto/data/worker-mode.json /opt/apps/smartproto/data/worker-state.json 2>/dev/null || true
echo "--- host dupes ---"
ps auxww | grep -E 'hetzner-worker|run-newsroom-tick' | grep -v grep || echo '(none)'
echo "--- disk project ---"
du -sh /opt/apps/smartproto /opt/apps/smartproto/data /opt/apps/smartproto/images 2>/dev/null || true
echo "--- site ---"
curl -sI -m 10 http://127.0.0.1:3100/ | head -8 || true
echo "=== end ==="
