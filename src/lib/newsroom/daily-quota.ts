/**
 * Daily news volume: AUTO target ~6, hard public max 7 / rolling 24h.
 *
 * When behind target: Scout relax + skip China×3 so RSS can land.
 * When at/over target: ease boosts (China ≤1).
 * When public stream (AUTO+Chief+Author) hits SMARTPROTO_NEWS_DAILY_MAX: hard stop.
 *
 * Env:
 *   SMARTPROTO_NEWS_DAILY_TARGET   default 6
 *   SMARTPROTO_NEWS_DAILY_MAX      default 7
 *   SMARTPROTO_NEWS_DAILY_MIN      default 5
 *   SMARTPROTO_NEWS_QUOTA_SCOUT_RELAX  default 8
 *   SMARTPROTO_NEWS_QUOTA_SCOUT_FLOOR_MIN  default 60
 */

import { isAutoPublicationAgent } from './freshness';

export const NEWS_DAILY_TARGET_DEFAULT = 6;
export const NEWS_DAILY_MAX_DEFAULT = 7;
export const NEWS_DAILY_MIN_DEFAULT = 5;
export const NEWS_QUOTA_SCOUT_RELAX_DEFAULT = 8;
export const NEWS_QUOTA_SCOUT_FLOOR_MIN_DEFAULT = 60;

export function getNewsDailyTarget(): number {
  const n = Number(process.env.SMARTPROTO_NEWS_DAILY_TARGET || NEWS_DAILY_TARGET_DEFAULT);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : NEWS_DAILY_TARGET_DEFAULT;
}

/** Hard public-stream cap (AUTO + Chief + Author). Default 7. */
export function getNewsDailyMax(): number {
  const n = Number(process.env.SMARTPROTO_NEWS_DAILY_MAX || NEWS_DAILY_MAX_DEFAULT);
  const max = Number.isFinite(n) && n >= 1 ? Math.floor(n) : NEWS_DAILY_MAX_DEFAULT;
  return Math.max(max, getNewsDailyTarget());
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

export function isNewsCycleArticle(a: NewsQuotaArticleLike): boolean {
  const tags = (a.tags || []).map((t) => String(t).toLowerCase().replace(/^#/, ''));
  if (tags.some((t) => t === 'обзор' || t === 'review' || t === 'full-review')) return false;
  if (tags.some((t) => t === 'новость' || t === 'news' || t === 'новинка')) return true;
  return true;
}

/** Every homepage article in the last 24h — AUTO, Chief, Author. */
export function countPublicPublishedLast24h(opts: {
  articles?: Array<{ publishedAt?: string }>;
  now?: Date;
}): number {
  const nowMs = (opts.now || new Date()).getTime();
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;
  return (opts.articles || []).filter((a) => {
    const t = Date.parse(a.publishedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  }).length;
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

  return (opts.journalEntries || []).filter((e) => {
    if (e.status !== 'published') return false;
    if (e.cycle === 'article') return false;
    const t = Date.parse(e.processedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  }).length;
}

export type NewsQuotaPolicy = {
  newsPublishedLast24h: number;
  publicPublishedLast24h: number;
  target: number;
  max: number;
  min: number;
  behind: boolean;
  atOrOverTarget: boolean;
  hardStop: boolean;
  scoutFloorRelax: number;
  scoutLimit: number;
  skipChina: boolean;
  chinaMaxAttempts: number;
  allowPublishWithoutImage: boolean;
  reason: string;
};

export function resolveNewsQuotaPolicy(opts: {
  articles?: NewsQuotaArticleLike[];
  journalEntries?: NewsQuotaJournalLike[];
  now?: Date;
  minutesSinceLastAuto?: number | null;
  freshnessStatus?: 'OK' | 'WARNING' | 'CRITICAL';
}): NewsQuotaPolicy {
  const target = getNewsDailyTarget();
  const max = getNewsDailyMax();
  const min = Math.min(getNewsDailyMin(), target);
  const count = countNewsPublishedLast24h(opts);
  const publicCount = countPublicPublishedLast24h(opts);
  const atOrOverTarget = count >= target;
  const hardStop = publicCount >= max;
  const starved =
    opts.freshnessStatus === 'CRITICAL' ||
    (opts.minutesSinceLastAuto != null && opts.minutesSinceLastAuto >= 180);
  const behind = count < target;

  if (hardStop) {
    return {
      newsPublishedLast24h: count,
      publicPublishedLast24h: publicCount,
      target,
      max,
      min,
      behind: false,
      atOrOverTarget: true,
      hardStop: true,
      scoutFloorRelax: 0,
      scoutLimit: 12,
      skipChina: true,
      chinaMaxAttempts: 0,
      allowPublishWithoutImage: false,
      reason: `hard stop ${publicCount}/${max} public / 24h (AUTO news ${count}/${target})`,
    };
  }

  if (!behind) {
    return {
      newsPublishedLast24h: count,
      publicPublishedLast24h: publicCount,
      target,
      max,
      min,
      behind: false,
      atOrOverTarget: true,
      hardStop: false,
      scoutFloorRelax: 0,
      scoutLimit: 12,
      skipChina: false,
      chinaMaxAttempts: 1,
      allowPublishWithoutImage: false,
      reason: `quota met ${count}/${target} public ${publicCount}/${max} — ease boosts; China≤1`,
    };
  }

  const relax = getNewsQuotaScoutRelax();
  const skipChina = !starved;
  return {
    newsPublishedLast24h: count,
    publicPublishedLast24h: publicCount,
    target,
    max,
    min,
    behind: true,
    atOrOverTarget: false,
    hardStop: false,
    scoutFloorRelax: relax,
    scoutLimit: 8,
    skipChina,
    chinaMaxAttempts: starved ? 2 : 0,
    allowPublishWithoutImage: starved && count < min,
    reason: starved
      ? `behind quota ${count}/${target} public ${publicCount}/${max} CRITICAL — keep China≤2, relax Scout −${relax}`
      : `behind quota ${count}/${target} public ${publicCount}/${max} (min ${min}) — relax Scout −${relax}, skip China`,
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
    `PUBLIC LAST 24H: ${p.publicPublishedLast24h}`,
    `TARGET: ${p.target} (max ${p.max}, min ${p.min})`,
    `HARD STOP: ${p.hardStop ? 'yes' : 'no'}`,
    `BEHIND: ${p.behind ? 'yes' : 'no'}`,
    `AT/OVER TARGET: ${p.atOrOverTarget ? 'yes' : 'no'}`,
    `SCOUT RELAX: ${p.scoutFloorRelax}`,
    `SCOUT LIMIT: ${p.scoutLimit}`,
    `SKIP CHINA: ${p.skipChina ? 'yes' : 'no'} (max ${p.chinaMaxAttempts})`,
    `ALLOW NO-IMAGE: ${p.allowPublishWithoutImage ? 'yes' : 'no'}`,
    `REASON: ${p.reason}`,
  ].join('\n');
}
