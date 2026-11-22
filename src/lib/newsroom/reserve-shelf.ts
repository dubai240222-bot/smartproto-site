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
  /** Original story time from the gated article (not the site go-live stamp). */
  sourcePublishedAt?: string;
  lastError?: string;
  attempts?: number;
  article: Record<string, unknown>;
};

/** Drop from auto-release after this age (still kept on disk until ack/quarantine). */
export const RESERVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RESERVE_FAST_DECAY_MS = 36 * 60 * 60 * 1000;
const FAST_DECAY_RE =
  /\b(breaking|сегодня|сегодня ночью|tonight|just announced|hours ago|минуту назад|только что)\b/i;

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
    out.sort((a, b) => {
      const t = String(a.storedAt).localeCompare(String(b.storedAt));
      if (t !== 0) return t;
      return String(a.id).localeCompare(String(b.id));
    });
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
  const sourcePublishedAt =
    item.sourcePublishedAt ||
    (typeof item.article.publishedAt === 'string' ? item.article.publishedAt : storedAt);
  const rec: ReserveItem = {
    ...item,
    id,
    storedAt,
    sourcePublishedAt,
  };
  await fs.writeFile(path.join(reserveDir(), `${id}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

export function peekOldestReserve(): ReserveItem | null {
  return listReserveItems()[0] || null;
}

export function reserveFilePath(id: string): string {
  return path.join(reserveDir(), `${id}.json`);
}

/** Remove only after a verified live write (or verified duplicate). */
export function ackReserveItem(id: string): boolean {
  const file = reserveFilePath(id);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

export function recordReserveFailure(item: ReserveItem, error: string): void {
  const next: ReserveItem = {
    ...item,
    attempts: (item.attempts || 0) + 1,
    lastError: String(error).slice(0, 400),
  };
  writeFileSync(reserveFilePath(item.id), `${JSON.stringify(next, null, 2)}\n`);
}

export function quarantineReserveItem(item: ReserveItem, reason: string): void {
  ensureDirSync();
  const staleDir = path.join(reserveDir(), 'stale');
  mkdirSync(staleDir, { recursive: true });
  const next: ReserveItem = {
    ...item,
    lastError: reason.slice(0, 400),
  };
  writeFileSync(path.join(staleDir, `${item.id}.json`), `${JSON.stringify(next, null, 2)}\n`);
  ackReserveItem(item.id);
}

export function isReserveTooStale(item: ReserveItem, now = Date.now()): boolean {
  const stored = Date.parse(item.storedAt);
  if (!Number.isFinite(stored)) return true;
  const age = now - stored;
  if (age >= RESERVE_MAX_AGE_MS) return true;
  const hay = `${item.article.title || ''} ${item.article.summary || ''} ${item.channel || ''}`;
  if (FAST_DECAY_RE.test(hay) && age >= RESERVE_FAST_DECAY_MS) return true;
  return false;
}

/** @deprecated unsafe — deletes before publish. Use peek → publish → ack. */
export function takeOldestReserve(): ReserveItem | null {
  const oldest = peekOldestReserve();
  if (!oldest) return null;
  ackReserveItem(oldest.id);
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

export type ReservePublishResult = {
  ok: boolean;
  already?: boolean;
  slug: string;
  error?: string;
};

export type ReservePublisher = {
  getBySlug?: (slug: string) => { slug: string } | undefined | null;
  upsert?: (article: Record<string, unknown>) => void;
};

async function defaultPublisher(): Promise<ReservePublisher> {
  if (process.env.ARTICLES_STORE !== 'sqlite') return {};
  const repo = await import('@/lib/data-store/articles-repo');
  return {
    getBySlug: (slug) => repo.getArticleBySlugFromDb(slug),
    upsert: (article) =>
      repo.upsertArticle(article as unknown as import('@/lib/data-store/articles-repo').StoredArticle, {
        skipPostPublishTranslation: true,
      }),
  };
}

/**
 * Cheap live publish of a parked story. No Scout/Reviewer/Editor.
 * Does NOT delete the reserve file — caller must ack after verify.
 */
export async function publishReserveItemLive(
  item: ReserveItem,
  publisher?: ReservePublisher,
): Promise<ReservePublishResult> {
  const pub = publisher && (publisher.getBySlug || publisher.upsert) ? publisher : await defaultPublisher();
  const existing = pub.getBySlug?.(item.slug);
  if (existing) {
    return { ok: true, already: true, slug: item.slug };
  }
  const publishedAt = new Date().toISOString();
  const article = {
    ...item.article,
    slug: item.slug,
    sourceUrl: item.sourceUrl || item.article.sourceUrl,
    publishedAt,
    sourcePublishedAt: item.sourcePublishedAt || item.article.publishedAt,
  };
  try {
    if (!pub.upsert) {
      return { ok: false, slug: item.slug, error: 'no-publisher' };
    }
    pub.upsert(article);
    const verify = pub.getBySlug?.(item.slug);
    if (pub.getBySlug && !verify) {
      return { ok: false, slug: item.slug, error: 'verify-failed' };
    }
    return { ok: true, slug: item.slug };
  } catch (err) {
    return {
      ok: false,
      slug: item.slug,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SafeReleaseResult = {
  status: 'published' | 'already' | 'failed' | 'stale' | 'empty';
  slug?: string;
  error?: string;
  reservedLeft: number;
};

/**
 * PEEK → VALIDATE → PUBLISH → VERIFY → ACK.
 * Never deletes the reserve file before a verified write or duplicate.
 */
export async function releaseOldestReserveSafely(
  publisher?: ReservePublisher,
  now = Date.now(),
): Promise<SafeReleaseResult> {
  const item = peekOldestReserve();
  if (!item) return { status: 'empty', reservedLeft: 0 };
  if (isReserveTooStale(item, now)) {
    quarantineReserveItem(item, 'stale-for-auto-release');
    return { status: 'stale', slug: item.slug, reservedLeft: countReserveItems() };
  }
  const result = await publishReserveItemLive(item, publisher);
  if (result.ok) {
    ackReserveItem(item.id);
    return {
      status: result.already ? 'already' : 'published',
      slug: result.slug,
      reservedLeft: countReserveItems(),
    };
  }
  recordReserveFailure(item, result.error || 'publish-failed');
  return {
    status: 'failed',
    slug: item.slug,
    error: result.error,
    reservedLeft: countReserveItems(),
  };
}

export function looksLikeCreditError(text: string): boolean {
  return /402\b|insufficient credits|payment required|credit balance|can only afford|quota exceeded/i.test(
    text,
  );
}
