/**
 * Auto-publish observability for /api/health (sqlite / Hetzner worker).
 * No LLM — reads worker-state, factory journal, articles DB.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildFreshnessReport, isAutoPublicationAgent } from '@/lib/newsroom/freshness';

export type AutoPublishHealth = {
  scheduler_alive: boolean;
  worker_mode: string | null;
  last_editorial_tick_at: string | null;
  last_editorial_tick_status: string | null;
  last_auto_publish_at: string | null;
  last_auto_publish_slug: string | null;
  last_auto_publish_error: string | null;
  editorial_lock_state: 'free' | 'held';
  freshness_status: 'OK' | 'WARNING' | 'CRITICAL' | null;
  auto_publish_stale: boolean;
  ticks_last_24h: number;
  auto_published_last_24h: number;
  top_skip_reasons: { reason: string; count: number }[];
  blocked_at: string | null;
  pipeline: {
    candidates: number;
    scout_passed: number;
    reviewer_passed: number;
    editor_completed: number;
    visual_pending: number;
    ready: number;
    published: number;
  };
  pending_count: number;
  oldest_pending_age_hours: number | null;
  last_error: string | null;
};

const STALE_MS = 6 * 60 * 60 * 1000;

function dataDir(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function readJsonFile<T>(fp: string): T | null {
  try {
    if (!existsSync(fp)) return null;
    return JSON.parse(readFileSync(fp, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function buildAutoPublishHealth(opts?: {
  articles?: Array<{ slug: string; publishedAt?: string; agentId?: string | null }>;
}): AutoPublishHealth {
  const dir = dataDir();
  const workerState = readJsonFile<{
    lastRunAt?: string;
    lastRunStatus?: string;
    lastAutoPublicationAt?: string;
    freshnessStatus?: 'OK' | 'WARNING' | 'CRITICAL';
  }>(path.join(dir, 'worker-state.json'));

  const modeFile = readJsonFile<{ mode?: string }>(path.join(dir, 'worker-mode.json'));
  const workerMode = modeFile?.mode || null;

  const journal = readJsonFile<{ entries?: Array<Record<string, unknown>> }>(
    path.join(dir, 'factory-journal.json'),
  );
  const entries = (journal?.entries || []) as Array<{
    processedAt?: string;
    status?: string;
    reason?: string;
    skipReason?: string;
    slug?: string;
  }>;

  let articles = opts?.articles;
  if (!articles && process.env.ARTICLES_STORE === 'sqlite') {
    try {
      const { getAllArticlesFromDb } = require('@/lib/data-store/articles-repo') as {
        getAllArticlesFromDb: () => Array<{
          slug: string;
          publishedAt?: string;
          agentId?: string | null;
        }>;
      };
      articles = getAllArticlesFromDb();
    } catch {
      articles = [];
    }
  }

  const freshness = buildFreshnessReport({
    articles: articles?.map((a) => ({ publishedAt: a.publishedAt, agentId: a.agentId })),
    journalEntries: entries,
    lastAutoPublicationAt: workerState?.lastAutoPublicationAt,
  });

  const autoArticles = (articles || [])
    .filter((a) => isAutoPublicationAgent(a.agentId) && a.publishedAt)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const lastAutoSlug = autoArticles[0]?.slug || null;
  const lastAutoAt =
    workerState?.lastAutoPublicationAt || autoArticles[0]?.publishedAt || null;

  let lastError: string | null = null;
  const failed = entries
    .filter((e) => e.status === 'error' || e.status === 'rejected')
    .sort((a, b) => String(b.processedAt).localeCompare(String(a.processedAt)));
  if (failed[0]) {
    lastError = String(failed[0].reason || failed[0].skipReason || '').slice(0, 200) || null;
  }

  const lockHeld = existsSync(path.join(dir, 'factory-publish.lock'));
  const lastTickAt = workerState?.lastRunAt || null;

  let schedulerAlive = false;
  if (lastTickAt) {
    const t = Date.parse(lastTickAt);
    schedulerAlive = Number.isFinite(t) && Date.now() - t < 45 * 60 * 1000;
  }

  let autoPublishStale = !lastAutoAt;
  if (lastAutoAt) {
    const t = Date.parse(lastAutoAt);
    autoPublishStale = Number.isFinite(t) && Date.now() - t >= STALE_MS;
  }
  if (workerMode === 'off') autoPublishStale = false;

  const recent = entries.slice(-500);
  const published = recent.filter((e) => e.status === 'published').length;
  const scoutRejected = recent.filter(
    (e) => e.status === 'rejected' && /scout|score|нет явного покупаемого|NO_PRODUCT|buy\/preorder/i.test(String(e.reason || '')),
  ).length;
  const reviewerRejected = recent.filter(
    (e) => e.status === 'rejected' && /reviewer|REJECT/i.test(String(e.reason || '')),
  ).length;
  const editorRejected = recent.filter(
    (e) => e.status === 'rejected' && /editor|draft too short|toneCheck|JSON/i.test(String(e.reason || '')),
  ).length;
  const visualPending = recent.filter(
    (e) => /visual|no hero|photo/i.test(String(e.reason || e.skipReason || '')),
  ).length;
  const hardNoProduct = recent.filter(
    (e) => e.status === 'rejected' && /нет явного покупаемого|buy\/preorder|NO_PRODUCT/i.test(String(e.reason || '')),
  ).length;

  let blockedAt: string | null = null;
  if (!schedulerAlive && workerMode !== 'off') blockedAt = 'WORKER';
  else if (lockHeld) blockedAt = 'LOCK';
  else if (hardNoProduct > scoutRejected * 0.5 && hardNoProduct > 20) blockedAt = 'SCOUT';
  else if (editorRejected > published * 3 && editorRejected > 5) blockedAt = 'EDITOR';
  else if (visualPending > published * 2 && visualPending > 3) blockedAt = 'VISUAL_DESK';
  else if (published === 0 && recent.length > 50 && workerMode !== 'off') blockedAt = 'SCOUT';

  const queued = recent.filter((e) => e.status === 'queued' || e.status === 'error');
  let oldestPendingAge: number | null = null;
  if (queued.length) {
    const oldest = queued
      .map((e) => Date.parse(String(e.processedAt || '')))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b)[0];
    if (oldest) oldestPendingAge = Math.round((Date.now() - oldest) / (60 * 60 * 1000) * 10) / 10;
  }

  return {
    scheduler_alive: schedulerAlive && workerMode !== 'off',
    worker_mode: workerMode,
    last_editorial_tick_at: lastTickAt,
    last_editorial_tick_status: workerState?.lastRunStatus || null,
    last_auto_publish_at: lastAutoAt,
    last_auto_publish_slug: lastAutoSlug,
    last_auto_publish_error: lastError,
    editorial_lock_state: lockHeld ? 'held' : 'free',
    freshness_status: workerState?.freshnessStatus || freshness.freshnessStatus,
    auto_publish_stale: autoPublishStale && workerMode !== 'off',
    ticks_last_24h: freshness.ticksLast24h,
    auto_published_last_24h: freshness.publicationsLast24h,
    top_skip_reasons: freshness.topZeroPublishReasons,
    blocked_at: blockedAt,
    pipeline: {
      candidates: recent.length,
      scout_passed: Math.max(0, recent.length - scoutRejected - hardNoProduct),
      reviewer_passed: Math.max(0, recent.length - scoutRejected - reviewerRejected - hardNoProduct),
      editor_completed: Math.max(0, recent.length - scoutRejected - reviewerRejected - editorRejected),
      visual_pending: visualPending,
      ready: Math.max(0, published + queued.length),
      published,
    },
    pending_count: queued.length,
    oldest_pending_age_hours: oldestPendingAge,
    last_error: lastError,
  };
}
