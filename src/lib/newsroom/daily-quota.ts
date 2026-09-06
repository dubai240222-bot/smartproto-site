/**
 * Daily news volume quota — aim for ~5–6 AUTO news publishes / rolling 24h.
 *
 * When behind: slight Scout floor relax + smaller Scout window (fewer LLM calls,
 * better prefilter) + skip China×3 burn so RSS news can land.
 * When at/over target: ease boosts (normal floors; China at most 1 attempt).
 *
 * Env knobs (documented in DEPLOY.md / compose):
 *   SMARTPROTO_NEWS_DAILY_TARGET   default 6
 *   SMARTPROTO_NEWS_DAILY_MIN      default 5  (soft floor for “behind”)
 *   SMARTPROTO_NEWS_QUOTA_SCOUT_RELAX  default 8  (points below base floor when behind)
 *   SMARTPROTO_NEWS_QUOTA_SCOUT_FLOOR_MIN  default 60
 */

import { isAutoPublicationAgent } from './freshness';

export const NEWS_DAILY_TARGET_DEFAULT = 6;
export const NEWS_DAILY_MIN_DEFAULT = 5;
export const NEWS_QUOTA_SCOUT_RELAX_DEFAULT = 8;
export const NEWS_QUOTA_SCOUT_FLOOR_MIN_DEFAULT = 60;

export function getNewsDailyTarget(): number {
  const n = Number(process.env.SMARTPROTO_NEWS_DAILY_TARGET || NEWS_DAILY_TARGET_DEFAULT);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : NEWS_DAILY_TARGET_DEFAULT;
}

export function getNewsDailyMin(): number {
  const n = Number(process.env.SMARTPROTO_NEWS_DAILY_MIN || NEWS_DAILY_MIN_DEFAULT);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : NEWS_DAILY_MIN_DEFAULT;
}

export function getNewsQuotaScoutRelax(): number {
  const n = Number(process.env.SMARTPROTO_NEWS_QUOTA_SCOUT_RELAX || NEWS_QUOTA_SCOUT_RELAX_DEFAULT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NEWS_QUOTA_SCOUT_RELAX_DEFAULT;
}

export function getNewsQuotaScoutFloorMin(): number {
  const n = Number(
    process.env.SMARTPROTO_NEWS_QUOTA_SCOUT_FLOOR_MIN || NEWS_QUOTA_SCOUT_FLOOR_MIN_DEFAULT,
  );
  return Number.isFinite(n) && n >= 40 ? Math.floor(n) : NEWS_QUOTA_SCOUT_FLOOR_MIN_DEFAULT;
}

export type NewsQuotaArticleLike = {
  publishedAt?: string;
  agentId?: string | null;
  tags?: string[];
};

export type NewsQuotaJournalLike = {
  processedAt?: string;
  status?: string;
  cycle?: string;
};

/** True when article looks like a news-cycle piece (not fuller article review). */
export function isNewsCycleArticle(a: NewsQuotaArticleLike): boolean {
  const tags = (a.tags || []).map((t) => String(t).toLowerCase().replace(/^#/, ''));
  if (tags.some((t) => t === 'обзор' || t === 'review' || t === 'full-review')) return false;
  if (tags.some((t) => t === 'новость' || t === 'news' || t === 'новинка')) return true;
  // Legacy AUTO rows without tags — count toward news quota (safer for volume).
  return true;
}

export function countNewsPublishedLast24h(opts: {
  articles?: NewsQuotaArticleLike[];
  journalEntries?: NewsQuotaJournalLike[];
  now?: Date;
}): number {
  const nowMs = (opts.now || new Date()).getTime();
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;

  const fromArticles = (opts.articles || []).filter((a) => {
    if (!isAutoPublicationAgent(a.agentId)) return false;
    if (!isNewsCycleArticle(a)) return false;
    const t = Date.parse(a.publishedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  }).length;

  if (fromArticles > 0) return fromArticles;

  // Fallback: journal cycle=news publishes (or legacy omitted cycle).
  return (opts.journalEntries || []).filter((e) => {
    if (e.status !== 'published') return false;
    if (e.cycle === 'article') return false;
    const t = Date.parse(e.processedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  }).length;
}

export type NewsQuotaPolicy = {
  newsPublishedLast24h: number;
  target: number;
  min: number;
  behind: boolean;
  atOrOverTarget: boolean;
  /** Points to subtract from Scout floor when behind (0 when eased). */
  scoutFloorRelax: number;
  /** Effective Scout pool size — smaller when behind (cost-aware). */
  scoutLimit: number;
  /** Skip China desk this tick so news RSS can publish. */
  skipChina: boolean;
  /** Cap China Qwen attempts (1 when eased / at target). */
  chinaMaxAttempts: number;
  /**
   * When true, allow publishing a news piece with no hero after all image
   * fallbacks (only when critically starved). Prefer attaching thematic stock.
   */
  allowPublishWithoutImage: boolean;
  reason: string;
};

/**
 * Resolve boost / ease policy for a news tick.
 * Articles cycle callers should ignore (or pass cycle=article and get no boost).
 */
export function resolveNewsQuotaPolicy(opts: {
  articles?: NewsQuotaArticleLike[];
  journalEntries?: NewsQuotaJournalLike[];
  now?: Date;
  /** Minutes since last AUTO publish — from freshness report. */
  minutesSinceLastAuto?: number | null;
  freshnessStatus?: 'OK' | 'WARNING' | 'CRITICAL';
}): NewsQuotaPolicy {
  const target = getNewsDailyTarget();
  const min = Math.min(getNewsDailyMin(), target);
  const count = countNewsPublishedLast24h(opts);
  const atOrOverTarget = count >= target;
  const starved =
    opts.freshnessStatus === 'CRITICAL' ||
    (opts.minutesSinceLastAuto != null && opts.minutesSinceLastAuto >= 180);
  // Publish-until-target: boost while under daily target, then ease.
  const behind = count < target;

  if (!behind) {
    return {
      newsPublishedLast24h: count,
      target,
      min,
      behind: false,
      atOrOverTarget: true,
      scoutFloorRelax: 0,
      scoutLimit: 12,
      skipChina: false,
      chinaMaxAttempts: 1,
      allowPublishWithoutImage: false,
      reason: `quota met ${count}/${target} — ease boosts; China≤1`,
    };
  }

  const relax = getNewsQuotaScoutRelax();
  return {
    newsPublishedLast24h: count,
    target,
    min,
    behind: true,
    atOrOverTarget: false,
    scoutFloorRelax: relax,
    // Fewer Scout LLM calls; rely on cheap pre-rank + slightly lower floor.
    scoutLimit: 8,
    skipChina: true,
    chinaMaxAttempts: 0,
    allowPublishWithoutImage: starved && count < min,
    reason: `behind quota ${count}/${target} (min ${min}${starved ? ', starved' : ''}) — relax Scout −${relax}, scout≤8, skip China`,
  };
}

export function applyQuotaScoutFloor(baseFloor: number, policy: NewsQuotaPolicy): number {
  if (!policy.behind || policy.scoutFloorRelax <= 0) return baseFloor;
  const floorMin = getNewsQuotaScoutFloorMin();
  return Math.max(floorMin, baseFloor - policy.scoutFloorRelax);
}

export function formatNewsQuotaPolicy(p: NewsQuotaPolicy): string {
  return [
    'NEWS_DAILY_QUOTA',
    `NEWS LAST 24H: ${p.newsPublishedLast24h}`,
    `TARGET: ${p.target} (min ${p.min})`,
    `BEHIND: ${p.behind ? 'yes' : 'no'}`,
    `AT/OVER TARGET: ${p.atOrOverTarget ? 'yes' : 'no'}`,
    `SCOUT RELAX: ${p.scoutFloorRelax}`,
    `SCOUT LIMIT: ${p.scoutLimit}`,
    `SKIP CHINA: ${p.skipChina ? 'yes' : 'no'} (max ${p.chinaMaxAttempts})`,
    `ALLOW NO-IMAGE: ${p.allowPublishWithoutImage ? 'yes' : 'no'}`,
    `REASON: ${p.reason}`,
  ].join('\n');
}
