#!/usr/bin/env bash
# SP-A-100F2 — one-shot Neakasa restore on Hetzner (run from /opt/apps/smartproto/app).
# Prerequisites: code pulled (slug NOT in removed-slugs.json), web rebuilt/restarted.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/apps/smartproto/app}"
DB="${SMARTPROTO_DB_PATH:-/opt/apps/smartproto/data/smartproto.db}"
MEDIA="${SMARTPROTO_MEDIA_DIR:-/opt/apps/smartproto/images}"
SLUG="${1:-neakasa-riko-fresh-made-wet-meal-feeder}"
HERO_URL="${2:-https://cdn.shopify.com/s/files/1/0600/4736/0185/files/neakasa_riko_main_2.webp}"

cd "$APP_DIR"

echo "==> Restore $SLUG"
SMARTPROTO_DB_PATH="$DB" SMARTPROTO_MEDIA_DIR="$MEDIA" \
  npx tsx scripts/restore-article-from-wal.ts \
    --slug="$SLUG" \
    --hero-url="$HERO_URL"

echo "==> Verify"
curl -sS -o /dev/null -w "article %{http_code}\n" "https://www.smartproto.net/articles/${SLUG}" || true
curl -sS -o /dev/null -w "hero %{http_code}\n" "https://www.smartproto.net/api/media/${SLUG}/hero.jpg" || true
file "${MEDIA}/${SLUG}/hero.jpg" || true
ls -la "${MEDIA}/${SLUG}/" || true
