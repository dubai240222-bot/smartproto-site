#!/usr/bin/env bash
# SP-LIGHT-002 — SmartProto-only host cleanup on Hetzner.
# Default: dry-run. Pass --apply to delete confirmed junk.
# Never: docker system prune -a, volume prune, compose down -v, HeSIM/other projects.
set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then APPLY=1; fi

KEEP_CONTAINERS=(smartproto-web smartproto-worker)
ROOTS=(/opt/apps/smartproto /opt/smartproto)
FORBIDDEN='hesim|hijaz|reklama|aslplus|asl-plus|qr-?bot|seller'

log() { printf '%s\n' "$*"; }
act() {
  if [[ "$APPLY" -eq 1 ]]; then
    log "APPLY: $*"
    eval "$@"
  else
    log "DRY: $*"
  fi
}

log "=== SP-LIGHT-002 $(date -Is) apply=$APPLY ==="
log "--- live containers ---"
docker ps -a --filter name=smartproto --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.ID}}' || true
log "--- other compose projects (do not touch) ---"
docker ps -a --format '{{.Names}}' | grep -Eiv 'smartproto' | head -40 || true

log "--- processes (host vs container) ---"
ps auxww | grep -E 'hetzner-worker|run-newsroom-tick|run-factory' | grep -v grep || log '(none on host)'

log "--- systemd / cron mentioning smartproto ---"
systemctl list-units --all --no-pager 2>/dev/null | grep -i smartproto || log '(no systemd unit)'
crontab -l 2>/dev/null | grep -i smartproto || log '(no root crontab lines)'
grep -RIl smartproto /etc/cron.d /etc/cron.daily /etc/systemd/system 2>/dev/null | head || log '(no cron.d/systemd files)'

USED_IDS=""
for c in "${KEEP_CONTAINERS[@]}"; do
  if docker inspect "$c" >/dev/null 2>&1; then
    USED_IDS="$USED_IDS $(docker inspect -f '{{.Image}} {{.Id}}' "$c" 2>/dev/null || true)"
    docker inspect -f "{{.Name}} image={{.Config.Image}} id={{.Image}}" "$c"
  else
    log "WARN: missing $c"
  fi
done

log "--- smartproto images ---"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' | grep -i smartproto || true

# Stop/remove extra containers whose name is smartproto* but not the two keepers.
while read -r name; do
  [[ -z "$name" ]] && continue
  skip=0
  for k in "${KEEP_CONTAINERS[@]}"; do
    if [[ "$name" == "$k" ]]; then skip=1; fi
  done
  if [[ "$skip" -eq 1 ]]; then continue; fi
  if echo "$name" | grep -Eqi "$FORBIDDEN"; then
    log "SKIP container $name (not exclusively SmartProto)"
    continue
  fi
  log "extra container: $name"
  act "docker stop '$name'"
  act "docker rm '$name'"
done < <(docker ps -a --format '{{.Names}}' | grep -E '^smartproto' || true)

# Tag current web image as rollback, then remove unused smartproto image IDs.
WEB_IMG=$(docker inspect -f '{{.Image}}' smartproto-web 2>/dev/null || true)
if [[ -n "$WEB_IMG" ]]; then
  act "docker tag '$WEB_IMG' smartproto-web:rollback-light || true"
fi
WORKER_IMG=$(docker inspect -f '{{.Image}}' smartproto-worker 2>/dev/null || true)
if [[ -n "$WORKER_IMG" ]]; then
  act "docker tag '$WORKER_IMG' smartproto-worker:rollback-light || true"
fi

while read -r repo tag id; do
  [[ -z "$id" ]] && continue
  ref="${repo}:${tag}"
  if echo "$ref $repo" | grep -Eqi "$FORBIDDEN"; then continue; fi
  if echo "$repo" | grep -Eiq 'smartproto'; then
    if echo "$USED_IDS" | grep -q "$id"; then
      log "KEEP in-use image $ref $id"
      continue
    fi
    if [[ "$tag" == "rollback-light" ]]; then
      log "KEEP rollback tag $ref"
      continue
    fi
    log "unused smartproto image $ref $id"
    act "docker rmi '$id' || true"
  fi
done < <(docker images --format '{{.Repository}} {{.Tag}} {{.ID}}')

# Host files: tarballs, leftover build dirs. Never data/images/.env/db.
for root in "${ROOTS[@]}"; do
  [[ -d "$root" ]] || continue
  log "--- tree $root (depth 2) ---"
  du -sh "$root" 2>/dev/null || true
  du -sh "$root"/* "$root"/*/* 2>/dev/null | sort -hr | head -40 || true
  while read -r f; do
    act "rm -f '$f'"
  done < <(find "$root" -maxdepth 3 -type f \( -name '*.tar' -o -name 'smartproto.tar' -o -name '*.tar.gz' \) 2>/dev/null || true)
  for leftover in "$root/app/.next" "$root/app/node_modules" "$root/.next" "$root/node_modules" "$root/app/dist"; do
    if [[ -e "$leftover" ]]; then
      log "host leftover $leftover"
      act "rm -rf '$leftover'"
    fi
  done
done

# Truncate only SmartProto container json logs if > 80MB.
for c in "${KEEP_CONTAINERS[@]}"; do
  lp=$(docker inspect -f '{{.LogPath}}' "$c" 2>/dev/null || true)
  [[ -z "$lp" || ! -f "$lp" ]] && continue
  sz=$(stat -c%s "$lp" 2>/dev/null || echo 0)
  if [[ "$sz" -gt $((80 * 1024 * 1024)) ]]; then
    log "log $c size=$sz"
    act "truncate -s 0 '$lp'"
  else
    log "log $c size=$sz (keep)"
  fi
done

log "--- docker stats snapshot ---"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null | grep -E 'NAME|smartproto|hesim|HESIM' || docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | head -20

log "=== done apply=$APPLY ==="
log "Site/db/env/images not touched. No global prune."
