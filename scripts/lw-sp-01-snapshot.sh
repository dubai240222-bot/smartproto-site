#!/usr/bin/env bash
# LW-SP-01 — agreed local snapshot only (SQLite + images). No .env.
# Does NOT copy between hosts. ENGINEERING transfers after they classify
# the archive blocker (technical vs policy). Registered dest:
#   /srv/projects/smartproto/{data,images}
# Hetzner source: /opt/apps/smartproto/{data,images}
set -euo pipefail

SRC_ROOT="${SMARTPROTO_SRC:-/opt/apps/smartproto}"
DEST_ROOT="${SMARTPROTO_DEST:-/srv/projects/smartproto}"
SNAP_ROOT="${SMARTPROTO_SNAP:-/srv/backups/lw-sp-01}"
DB_NAME="smartproto.db"

exclude_env() {
  local from="$1" to="$2"
  mkdir -p "$to"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude '.env' --exclude '.env.*' "$from/" "$to/"
  else
    # no secrets: skip hidden env files
    shopt -s dotglob nullglob
    local p
    for p in "$from"/* "$from"/.[!.]* "$from"/..?*; do
      [[ -e "$p" ]] || continue
      local base
      base="$(basename "$p")"
      [[ "$base" == .env || "$base" == .env.* ]] && continue
      cp -a "$p" "$to/"
    done
  fi
}

sqlite_backup() {
  local src_db="$1" dest_db="$2"
  mkdir -p "$(dirname "$dest_db")"
  python3 - "$src_db" "$dest_db" <<'PY'
import sqlite3, sys, os
src, dst = sys.argv[1], sys.argv[2]
if not os.path.isfile(src):
    raise SystemExit(f"missing sqlite: {src}")
os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
if os.path.exists(dst):
    os.remove(dst)
s = sqlite3.connect(src)
d = sqlite3.connect(dst)
try:
    s.backup(d)
finally:
    d.close()
    s.close()
PY
}

cmd="${1:-}"
case "$cmd" in
  snapshot)
    sqlite_backup "$SRC_ROOT/data/$DB_NAME" "$SNAP_ROOT/data/$DB_NAME"
    exclude_env "$SRC_ROOT/images" "$SNAP_ROOT/images"
    echo "lw-sp-01 snapshot: $SNAP_ROOT (sqlite+images, no .env)"
    ;;
  restore)
    sqlite_backup "$SNAP_ROOT/data/$DB_NAME" "$DEST_ROOT/data/$DB_NAME"
    exclude_env "$SNAP_ROOT/images" "$DEST_ROOT/images"
    echo "lw-sp-01 restore: $DEST_ROOT (sqlite+images, no .env)"
    ;;
  *)
    echo "usage: $0 snapshot|restore" >&2
    echo "  snapshot: $SRC_ROOT -> $SNAP_ROOT" >&2
    echo "  restore:  $SNAP_ROOT -> $DEST_ROOT" >&2
    exit 1
    ;;
esac
