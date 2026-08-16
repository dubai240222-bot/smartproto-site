# SmartProto Deployment

## 1) Build the Docker image locally

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain.com \
  -t smartproto:latest .
```

If you want SEO links, robots, and sitemap to use the production domain, pass `NEXT_PUBLIC_SITE_URL` at runtime:

```bash
docker run -e NEXT_PUBLIC_SITE_URL=https://www.smartproto.net ...
```

Default for SmartProto compose/Dockerfile is `https://www.smartproto.net`. Localhost values are sanitized away from public SEO helpers.

## 2) Move the image to Hetzner

### Option A: save and copy the image

```bash
docker save smartproto:latest -o smartproto.tar
scp smartproto.tar root@YOUR_HETZNER_IP:/opt/smartproto/
```

On the server:

```bash
docker load -i /opt/smartproto/smartproto.tar
```

### Option B: push to a registry

If you use Docker Hub, GHCR, or another registry:

```bash
docker tag smartproto:latest ghcr.io/YOUR_ORG/smartproto:latest
docker push ghcr.io/YOUR_ORG/smartproto:latest
```

Then on Hetzner:

```bash
docker pull ghcr.io/YOUR_ORG/smartproto:latest
```

## 3) Run the container on Hetzner

```bash
docker run -d \
  --name smartproto \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e NEXT_PUBLIC_SITE_URL=https://your-domain.com \
  smartproto:latest
```

## 4) Put a reverse proxy in front of port 3000

Cloudflare proxies standard web traffic on ports like `80`, `443`, `8080`, and `8443`. It should not be pointed directly at container port `3000` for a public website.

Recommended setup:

1. Run the app container on `3000`.
2. Put Nginx or Caddy on the Hetzner server.
3. Proxy `80` and `443` to `http://127.0.0.1:3000`.

Example Nginx upstream:

```nginx
server {
  listen 80;
  server_name your-domain.com www.your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Then add HTTPS with Let’s Encrypt or Caddy.

## 5) Cloudflare setup

### DNS

1. Add an `A` record for `@` pointing to your Hetzner server IP.
2. Add a `CNAME` or `A` record for `www` if you use it.
3. Keep the orange cloud enabled if you want Cloudflare CDN and proxying.

### SSL/TLS

1. Set SSL/TLS mode to **Full (strict)**.
2. Install a valid origin certificate or Let’s Encrypt certificate on the Hetzner proxy.
3. Enable **Always Use HTTPS**.

### Performance

1. Leave Cloudflare proxy enabled for CDN caching.
2. Optional: turn on Brotli, HTTP/3, and Auto Minify if they fit your setup.

## 6) Editorial Chief PIN

Primary gate for `/editorial/chief` and `/editorial/author` is `SMARTPROTO_NEWS_PIN`
(example in `.env.example`: `098765-543210`). Server-side only — never `NEXT_PUBLIC_*`.
Legacy `EDITORIAL_DOOR_SECRET` still works when set.

On Hetzner (`/opt/apps/smartproto/app/.env`), set the PIN then recreate:

```bash
cd /opt/apps/smartproto/app
# ensure SMARTPROTO_NEWS_PIN=… in .env
docker compose --env-file .env -f docker-compose.smartproto.yml -p smartproto up -d --build
```

## 6b) Daily news quota (AUTO volume)

Target **5–6 news / rolling 24h** on the Hetzner worker (`smartproto-worker`).
Enforced in `src/lib/newsroom/daily-quota.ts` during each news tick:

| Env | Default | Meaning |
| --- | --- | --- |
| `SMARTPROTO_NEWS_DAILY_TARGET` | `6` | Publish-until target; then ease boosts |
| `SMARTPROTO_NEWS_DAILY_MIN` | `5` | Soft floor (starvation / no-image policy) |
| `SMARTPROTO_NEWS_QUOTA_SCOUT_RELAX` | `8` | Points below Scout floor when behind (70→62, floor min 60) |
| `SMARTPROTO_NEWS_QUOTA_SCOUT_FLOOR_MIN` | `60` | Never relax Scout below this |
| `SCOUT_SCORE_THRESHOLD` | `70` | Base Scout floor (compose) |
| `SMARTPROTO_NEWS_INTERVAL_MS` | `1500000` (25m) | Cadence floor between news publishes |

When **behind** target: skip China×3 burn, Scout pool ≤8 (fewer LLM calls), slight floor relax, prefer attaching thematic/stock hero over empty cards.
When **at/over** target: normal floors, China ≤1 attempt/tick.

Articles stay on the slower ~3h cadence (`SMARTPROTO_ARTICLE_INTERVAL_MS`).

## 7) Useful checks

```bash
docker logs -f smartproto-worker
docker logs -f smartproto-web
curl -I https://your-domain.com
curl https://your-domain.com/sitemap.xml
curl https://your-domain.com/robots.txt
curl -s http://127.0.0.1:3100/api/health
```
