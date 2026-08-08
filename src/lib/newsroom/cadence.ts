/**
 * SP-A-054 — News cadence + temporary warmup ramp.
 *
 * Normal: ~25 min between news ticks (~2–3/hour, max 1/tick).
 * Warmup: 4× slower (~95–100 min) until SMARTPROTO_NEWS_WARMUP_UNTIL (ISO),
 * then automatically returns to normal. Articles stay ~3h.
 *
 * GHA keeps schedule every 25 minutes; tick/workflow skip when floor not met (cheap idle).
 */

export const NEWS_NORMAL_INTERVAL_MS = 25 * 60 * 1000;
/** ~90–100 min — 4× vs 25m; mid-band ≈95m */
export const NEWS_WARMUP_INTERVAL_MS = 95 * 60 * 1000;
export const ARTICLE_INTERVAL_MS = 3 * 60 * 60 * 1000;

export function parseWarmupUntilMs(
  raw = process.env.SMARTPROTO_NEWS_WARMUP_UNTIL,
): number | null {
  const s = raw?.trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function isNewsWarmupActive(now = Date.now()): boolean {
  const until = parseWarmupUntilMs();
  return until != null && now < until;
}

export function getNewsWarmupUntilIso(): string | null {
  const until = parseWarmupUntilMs();
  return until != null ? new Date(until).toISOString() : null;
}

/** Effective news interval; SMARTPROTO_NEWS_INTERVAL_MS overrides when set > 0. */
export function getNewsIntervalMs(now = Date.now()): number {
  const override = Number(process.env.SMARTPROTO_NEWS_INTERVAL_MS);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return isNewsWarmupActive(now) ? NEWS_WARMUP_INTERVAL_MS : NEWS_NORMAL_INTERVAL_MS;
}

export function getArticleIntervalMs(): number {
  const override = Number(process.env.SMARTPROTO_ARTICLE_INTERVAL_MS);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return ARTICLE_INTERVAL_MS;
}

export interface CadenceCheck {
  allow: boolean;
  warmup: boolean;
  intervalMs: number;
  lastPublishedAt: string | null;
  elapsedMs: number | null;
  warmupUntil: string | null;
  reason: string;
}

/** Last publishedAt for a cycle from factory journal entries. */
export function lastCyclePublishMs(
  journal: { entries?: Array<{ status?: string; cycle?: string; processedAt?: string }> },
  cycle: 'news' | 'article',
): number | null {
  let last: number | null = null;
  for (const e of journal.entries || []) {
    if (e.status !== 'published') continue;
    // Legacy entries may omit cycle — treat as news for floor purposes.
    const c = e.cycle === 'article' ? 'article' : e.cycle === 'news' ? 'news' : 'news';
    if (c !== cycle) continue;
    const t = e.processedAt ? Date.parse(e.processedAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (last == null || t > last) last = t;
  }
  return last;
}

/**
 * Whether a news/article tick may run given last publish + warmup floor.
 * workflow_dispatch / --force callers can pass force=true to bypass.
 */
export function checkCycleCadence(opts: {
  cycle: 'news' | 'article';
  journal: { entries?: Array<{ status?: string; cycle?: string; processedAt?: string }> };
  now?: number;
  force?: boolean;
}): CadenceCheck {
  const now = opts.now ?? Date.now();
  const warmup = opts.cycle === 'news' && isNewsWarmupActive(now);
  const intervalMs =
    opts.cycle === 'article' ? getArticleIntervalMs() : getNewsIntervalMs(now);
  const lastMs = lastCyclePublishMs(opts.journal, opts.cycle);
  const warmupUntil = opts.cycle === 'news' ? getNewsWarmupUntilIso() : null;

  if (opts.force) {
    return {
      allow: true,
      warmup,
      intervalMs,
      lastPublishedAt: lastMs != null ? new Date(lastMs).toISOString() : null,
      elapsedMs: lastMs != null ? now - lastMs : null,
      warmupUntil,
      reason: 'forced',
    };
  }

  if (lastMs == null) {
    return {
      allow: true,
      warmup,
      intervalMs,
      lastPublishedAt: null,
      elapsedMs: null,
      warmupUntil,
      reason: warmup
        ? `warmup active until ${warmupUntil}; no prior ${opts.cycle} publish`
        : `no prior ${opts.cycle} publish`,
    };
  }

  const elapsedMs = now - lastMs;
  if (elapsedMs < intervalMs) {
    const remainMin = Math.ceil((intervalMs - elapsedMs) / 60_000);
    return {
      allow: false,
      warmup,
      intervalMs,
      lastPublishedAt: new Date(lastMs).toISOString(),
      elapsedMs,
      warmupUntil,
      reason: warmup
        ? `warmup floor ${Math.round(intervalMs / 60_000)}m — wait ~${remainMin}m (until ${warmupUntil})`
        : `cadence floor ${Math.round(intervalMs / 60_000)}m — wait ~${remainMin}m`,
    };
  }

  return {
    allow: true,
    warmup,
    intervalMs,
    lastPublishedAt: new Date(lastMs).toISOString(),
    elapsedMs,
    warmupUntil,
    reason: warmup
      ? `warmup ok (${Math.round(intervalMs / 60_000)}m floor until ${warmupUntil})`
      : `cadence ok (${Math.round(intervalMs / 60_000)}m floor)`,
  };
}
