FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SITE_URL=https://www.smartproto.net
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# better-sqlite3 needs a native build toolchain on alpine (musl).
# wget is the compose healthcheck binary (node:20-alpine does not ship it).
RUN apk add --no-cache python3 make g++ wget

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# SP-A-056: parallel Hetzner deployment reads from SQLite at runtime.
ARG ARTICLES_STORE=json
ENV ARTICLES_STORE=${ARTICLES_STORE}
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package.json package-lock.json ./
# typescript stays in devDependencies. next.config.mjs so `next start` does not
# try a runtime `npm install typescript` (LW-SP-01 health timeout on :3100).
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/data ./data
COPY --from=builder /app/drafts ./drafts

EXPOSE 3000

CMD ["npm", "run", "start"]
