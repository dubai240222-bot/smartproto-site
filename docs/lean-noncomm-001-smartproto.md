# LEAN-NONCOMM-001 — SmartProto packet

ID: LEAN-NONCOMM-001 | CURSOR / Grok 4.6 | 24.11.2026  
Mode: READ-ONLY inventory + Contabo *plan*. Not APPLY, not DNS, not SSH.

## Necessity Gate (why this file)

Need: HQ LEAN-ORG-002/003 — one compact independent-app packet, starting with SmartProto.  
Existing: production compose is already two named containers; idle-RAM cut is PR #49 (`--once` + sleep), **not this PR**.  
Budget: zero new processes/containers/cron. This is markdown only.  
Retire: delete this file if HQ supersedes the Contabo plan.  
Rollback: revert this branch; production unchanged.

## 1. Identity

| Field | Value |
| --- | --- |
| Git | `github.com/dubai240222-bot/smartproto-site` (`main` @ `08d3585` when this packet was cut) |
| Public site | https://www.smartproto.net |
| Owner (code) | CURSOR |
| Overlap with CODEX | none (not HeSIM / QR / Seller) |
| Live host path (from compose comments) | `/opt/apps/smartproto/` — `app/`, bind `../data`, `../images` |
| Live host IP / RAM / disk | **UNKNOWN** (no SSH this run) |
| Contabo | **UNKNOWN** (activation not confirmed) |

## 2. Runtime on `main` (repo, not live inspect)

- Compose: `docker-compose.smartproto.yml` project `-p smartproto`
- `smartproto-web`: Next.js, `127.0.0.1:3100:3000`, health `/api/health`, `restart: unless-stopped`
- `smartproto-worker`: same image, command `npx tsx scripts/hetzner-worker.ts` (resident Node on `main`)
- Shared SQLite bind: host `../data` → `/app/data/smartproto.db`
- Shared media bind: host `../images` → `/app/public/media`
- Image: `Dockerfile` `node:20-alpine`, `better-sqlite3` native build
- Public bind: loopback only. TLS/proxy: **UNKNOWN** (Nginx/Caddy not in this repo)

## 3. Data to copy (names only)

Must move together or site is empty:

1. SQLite file: `/opt/apps/smartproto/data/smartproto.db` (+ `-wal`/`-shm` if present). Copy via `sqlite3 .backup`, not `cp` of a live file.
2. Media dir: `/opt/apps/smartproto/images`
3. App env: `/opt/apps/smartproto/app/.env` — **do not commit**. Names: `OPENROUTER_API_KEY`, `SMARTPROTO_NEWS_PIN`, optional `EDITORIAL_DOOR_SECRET`, `NEXT_PUBLIC_SITE_URL`

Do not copy: `node_modules`, build cache, other projects under `/opt`.

## 4. Secrets / deps (no values)

- LLM: OpenRouter (`OPENROUTER_API_KEY`)
- Optional: Google Generative AI package in `package.json` — **runtime use UNKNOWN**
- Editorial PIN: `SMARTPROTO_NEWS_PIN`
- No payments, no eSIM, no Stripe in this app

## 5. Lean already queued (do not duplicate here)

- PR #49 (`cursor/spa-lean-worker-once-16d4`, `6c548dc`): worker `--once` + `sleep 600` + file lock. **Freeze. Do not rewrite in this branch.** APPLY is a separate OWNER GO.
- PR #48 LIGHT stack: **not for deploy**
- This packet does **not** add `lean-check.sh`, INVENTORY daemon, or mem_limit

## 6. Contabo move — steps (paper only)

Preconditions (all still open): Contabo vCPU/RAM/disk/region/backup **UNKNOWN**; DNS GO **no**; SQLite `.backup` **not run**.

1. Confirm Contabo facts from NIZOM/OWNER (not guessed).
2. Restore from `.backup` + rsync images onto Contabo **test** compose (`restart: "no"` until health OK).
3. Isolated smoke: `GET /api/health` on loopback; one editorial PIN check; no live publish required.
4. Cut DNS only on explicit OWNER GO. Keep Hetzner stack running until rollback window ends.
5. Rollback = point DNS back + start previous Hetzner compose/image. Volumes never deleted.

## 7. Out of scope (one blocker)

GitHub `dubai240222-bot` this run: SmartProto yes; `business-posting` exists but **not this diff**.  
**ASLPlus / Reklama / KER440**: no repo on this account. HQ must name `owner/name`. No invented paths.

## Done

- Done: inventory from repo + named host paths from compose/DEPLOY.md  
- Removed: nothing on VPS  
- Measured: n/a (no SSH)  
- Rollback: `git` revert this PR  
- Owner: Contabo facts; #49 APPLY; DNS GO — three separate decisions  
