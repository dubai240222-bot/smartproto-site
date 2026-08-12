/**
 * SP-A-091 — News feed freshness SLA (quality-preserving).
 * WARNING at 90m without AUTO publish; CRITICAL at 180m.
 * Does NOT lower Scout/commodity/Editor floors — only expands bounded search.
 */

export const FRESHNESS_WARNING_MS = 90 * 60 * 1000;
export const FRESHNESS_CRITICAL_MS = 180 * 60 * 1000;

/** Max Scout-passed candidates to run through Reviewer→Editor per tick (API budget). */
export const PIPELINE_CANDIDATE_BUDGET_DEFAULT = 4;
export const PIPELINE_CANDIDATE_BUDGET_CRITICAL = 5;

export type FreshnessStatus = 'OK' | 'WARNING' | 'CRITICAL';

export type FreshnessReport = {
  lastAutoPublicationAt: string | null;
  minutesSinceLastAutoPublication: number | null;
  publicationsLast24h: number;
  ticksLast24h: number;
  ticksWithZeroPublish: number;
  topZeroPublishReasons: { reason: string; count: number }[];
  freshnessStatus: FreshnessStatus;
  pipelineCandidateBudget: number;
};

const MANUAL_AGENT_RE = /chief-fast-lane|chief-|author-door|author-/i;

export function isAutoPublicationAgent(agentId?: string | null): boolean {
  const a = (agentId || '').trim();
  if (!a) return true; // legacy AUTO rows
  if (MANUAL_AGENT_RE.test(a)) return false;
  return true;
}

export function freshnessStatusFromAgeMs(ageMs: number | null): FreshnessStatus {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'CRITICAL';
  if (ageMs >= FRESHNESS_CRITICAL_MS) return 'CRITICAL';
  if (ageMs >= FRESHNESS_WARNING_MS) return 'WARNING';
  return 'OK';
}

export function pipelineBudgetForStatus(status: FreshnessStatus): number {
  const envBudget = Number(process.env.SMARTPROTO_PIPELINE_CANDIDATE_BUDGET || '');
  if (Number.isFinite(envBudget) && envBudget >= 1 && envBudget <= 8) {
    return Math.floor(envBudget);
  }
  return status === 'CRITICAL'
    ? PIPELINE_CANDIDATE_BUDGET_CRITICAL
    : PIPELINE_CANDIDATE_BUDGET_DEFAULT;
}

export function buildFreshnessReport(opts: {
  now?: Date;
  lastAutoPublicationAt?: string | null;
  /** Journal-like entries with processedAt / status / reason / agent hints */
  journalEntries?: Array<{
    processedAt?: string;
    status?: string;
    reason?: string;
    channel?: string;
  }>;
  /** Articles with publishedAt + agentId */
  articles?: Array<{ publishedAt?: string; agentId?: string | null }>;
}): FreshnessReport {
  const now = opts.now || new Date();
  const nowMs = now.getTime();
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;

  let lastAuto = opts.lastAutoPublicationAt || null;
  if (!lastAuto && opts.articles?.length) {
    const autos = opts.articles
      .filter((a) => isAutoPublicationAgent(a.agentId) && a.publishedAt)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    lastAuto = autos[0]?.publishedAt || null;
  }

  let ageMs: number | null = null;
  let minutes: number | null = null;
  if (lastAuto) {
    const t = Date.parse(lastAuto);
    if (Number.isFinite(t)) {
      ageMs = Math.max(0, nowMs - t);
      minutes = Math.round(ageMs / 60000);
    }
  }

  const status = freshnessStatusFromAgeMs(ageMs);

  const articles24 = (opts.articles || []).filter((a) => {
    const t = Date.parse(a.publishedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  });
  const publicationsLast24h = articles24.filter((a) => isAutoPublicationAgent(a.agentId)).length;

  const entries24 = (opts.journalEntries || []).filter((e) => {
    const t = Date.parse(e.processedAt || '');
    return Number.isFinite(t) && t >= dayAgo;
  });

  // Approximate ticks: group by minute buckets of any entry, or count published+reject batches.
  // Prefer explicit tick markers if present; else unique 5-min buckets of entry times.
  const tickBuckets = new Set<string>();
  for (const e of entries24) {
    const t = Date.parse(e.processedAt || '');
    if (!Number.isFinite(t)) continue;
    const bucket = Math.floor(t / (5 * 60 * 1000));
    tickBuckets.add(String(bucket));
  }
  const ticksLast24h = tickBuckets.size;

  // Zero-publish ticks approximation: buckets with no published entry
  const pubBuckets = new Set<string>();
  for (const e of entries24) {
    if (e.status !== 'published') continue;
    const t = Date.parse(e.processedAt || '');
    if (!Number.isFinite(t)) continue;
    pubBuckets.add(String(Math.floor(t / (5 * 60 * 1000))));
  }
  const ticksWithZeroPublish = Math.max(0, ticksLast24h - pubBuckets.size);

  const reasonCount = new Map<string, number>();
  for (const e of entries24) {
    if (e.status !== 'rejected' && e.status !== 'error') continue;
    const reason = (e.reason || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 90);
    reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1);
  }
  const topZeroPublishReasons = [...reasonCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    lastAutoPublicationAt: lastAuto,
    minutesSinceLastAutoPublication: minutes,
    publicationsLast24h,
    ticksLast24h,
    ticksWithZeroPublish,
    topZeroPublishReasons,
    freshnessStatus: status,
    pipelineCandidateBudget: pipelineBudgetForStatus(status),
  };
}

export function formatFreshnessReport(r: FreshnessReport): string {
  const lines = [
    'FRESHNESS_HEALTH',
    `LAST AUTO PUBLICATION: ${r.lastAutoPublicationAt || '(none)'}`,
    `MINUTES SINCE LAST PUBLICATION: ${r.minutesSinceLastAutoPublication ?? '(unknown)'}`,
    `PUBLICATIONS LAST 24H: ${r.publicationsLast24h}`,
    `TICKS LAST 24H: ${r.ticksLast24h}`,
    `TICKS WITH ZERO PUBLISH: ${r.ticksWithZeroPublish}`,
    `TOP ZERO-PUBLISH REASONS: ${
      r.topZeroPublishReasons.length
        ? r.topZeroPublishReasons.map((x) => `${x.count}× ${x.reason}`).join(' | ')
        : '(none)'
    }`,
    `FRESHNESS STATUS: ${r.freshnessStatus}`,
    `PIPELINE CANDIDATE BUDGET: ${r.pipelineCandidateBudget}`,
  ];
  return lines.join('\n');
}
