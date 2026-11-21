/**
 * SP-A-105 — spare-news carousel (reserve shelf).
 *
 * Fully gated stories can be stored instead of going live, then released
 * cheaply when OpenRouter is down or the homepage goes stale.
 * Never calls Scout/Reviewer/Editor. Does not change newsroom prompts.
 */
import { promises as fs } from 'node:fs';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getNewsIntervalMs } from '@/lib/newsroom/cadence';
import {
  buildFreshnessReport,
  type FreshnessStatus,
} from '@/lib/newsroom/freshness';

export const RESERVE_TARGET_DEFAULT = 8;
/** Stretch ~8 stories across ~5–7 days of a credit outage. */
export const RESERVE_RELEASE_INTERVAL_MS_DEFAULT = 8 * 60 * 60 * 1000;

export type ReserveItem = {
  id: string;
  slug: string;
  sourceUrl: string;
  channel: string;
  cycle: 'news' | 'article';
  storedAt: string;
  article: Record<string, unknown>;
};

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

export function reserveDir(): string {
  return path.join(dataRoot(), 'news-reserve');
}

export function loadReserveTarget(): number {
  const n = Number(process.env.SMARTPROTO_RESERVE_TARGET ?? RESERVE_TARGET_DEFAULT);
  if (!Number.isFinite(n) || n < 0) return RESERVE_TARGET_DEFAULT;
  return Math.min(24, Math.floor(n));
}

export function loadReserveReleaseIntervalMs(): number {
  const n = Number(
    process.env.SMARTPROTO_RESERVE_RELEASE_INTERVAL_MS ?? RESERVE_RELEASE_INTERVAL_MS_DEFAULT,
  );
  if (!Number.isFinite(n) || n < 60_000) return RESERVE_RELEASE_INTERVAL_MS_DEFAULT;
  return Math.floor(n);
}

function ensureDirSync(): void {
  mkdirSync(reserveDir(), { recursive: true });
}

export function listReserveItems(): ReserveItem[] {
  try {
    ensureDirSync();
    const files = readdirSync(reserveDir()).filter((f) => f.endsWith('.json'));
    const out: ReserveItem[] = [];
    for (const f of files) {
      try {
        const parsed = JSON.parse(readFileSync(path.join(reserveDir(), f), 'utf8')) as ReserveItem;
        if (parsed?.slug && parsed.article) out.push(parsed);
      } catch {
        /* skip */
      }
    }
    out.sort((a, b) => String(a.storedAt).localeCompare(String(b.storedAt)));
    return out;
  } catch {
    return [];
  }
}

export function countReserveItems(): number {
  return listReserveItems().length;
}

const LIVE_CHANNELS = /chief|author-door|staff-author/i;

export function shouldHoldForReserve(opts: {
  channel?: string;
  cycle?: string;
  freshnessStatus: FreshnessStatus;
  minutesSinceLastAuto: number | null;
  shelfCount?: number;
  now?: number;
}): boolean {
  if ((opts.cycle || 'news') !== 'news') return false;
  if (LIVE_CHANNELS.test(opts.channel || '')) return false;
  const target = loadReserveTarget();
  const count = opts.shelfCount ?? countReserveItems();
  if (count >= target) return false;
  // Homepage is already stale — go live, do not stockpile.
  if (opts.freshnessStatus === 'CRITICAL') return false;
  const intervalMin = Math.round(getNewsIntervalMs(opts.now) / 60_000);
  if (opts.minutesSinceLastAuto == null || opts.minutesSinceLastAuto >= intervalMin) {
    return false;
  }
  return true;
}

export async function saveReserveItem(item: Omit<ReserveItem, 'id' | 'storedAt'> & { id?: string }): Promise<ReserveItem> {
  ensureDirSync();
  const storedAt = new Date().toISOString();
  const id = item.id || `reserve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const rec: ReserveItem = {
    ...item,
    id,
    storedAt,
  };
  await fs.writeFile(path.join(reserveDir(), `${id}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

export function peekOldestReserve(): ReserveItem | null {
  return listReserveItems()[0] || null;
}

export function takeOldestReserve(): ReserveItem | null {
  const oldest = peekOldestReserve();
  if (!oldest) return null;
  const file = path.join(reserveDir(), `${oldest.id}.json`);
  if (existsSync(file)) unlinkSync(file);
  return oldest;
}

export function shouldReleaseReserve(opts: {
  freshnessStatus: FreshnessStatus;
  minutesSinceLastAuto: number | null;
  lastReserveReleaseAt?: string | null;
  lastCreditErrorAt?: string | null;
  now?: number;
  shelfCount?: number;
}): boolean {
  const count = opts.shelfCount ?? countReserveItems();
  if (count <= 0) return false;
  const now = opts.now ?? Date.now();
  const lastRel = opts.lastReserveReleaseAt ? Date.parse(opts.lastReserveReleaseAt) : NaN;
  const interval = loadReserveReleaseIntervalMs();
  const sinceRelease = Number.isFinite(lastRel) ? now - lastRel : interval;
  if (sinceRelease < interval) return false;

  const creditAt = opts.lastCreditErrorAt ? Date.parse(opts.lastCreditErrorAt) : NaN;
  const creditRecent = Number.isFinite(creditAt) && now - creditAt < 24 * 60 * 60 * 1000;
  const stale =
    opts.freshnessStatus === 'CRITICAL' ||
    opts.freshnessStatus === 'WARNING' ||
    (opts.minutesSinceLastAuto != null && opts.minutesSinceLastAuto >= 180);

  return stale || creditRecent;
}

export function freshnessForReserve(articles: Array<{ publishedAt?: string; agentId?: string | null }>) {
  return buildFreshnessReport({ articles });
}

/** Cheap live publish of a parked story. No Scout/Reviewer/Editor. */
export async function publishReserveItemLive(
  item: ReserveItem,
): Promise<{ ok: boolean; slug: string }> {
  const publishedAt = new Date().toISOString();
  const article = {
    ...item.article,
    publishedAt,
  };
  if (process.env.ARTICLES_STORE === 'sqlite') {
    const { upsertArticle } = await import('@/lib/data-store/articles-repo');
    upsertArticle(
      article as import('@/lib/data-store/articles-repo').StoredArticle,
      { skipPostPublishTranslation: true },
    );
  }
  return { ok: true, slug: item.slug };
}

export function looksLikeCreditError(text: string): boolean {
  return /402\b|insufficient credits|payment required|credit balance|can only afford|quota exceeded/i.test(
    text,
  );
}
