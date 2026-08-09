/**
 * SP-A-065B — cheap deterministic pre-rank + topic dedupe before Scout.
 * Does NOT call AI. Goal: give discovery sources a fair shot in TOP 12–16.
 */

import { discoveryRankFor, sourceMetaByName } from '../collectors/source-registry';
import {
  looksCommodityRoutine,
  looksSmartHomeRoutine,
} from './scout-recalibrate';
import { isAiOrInventionAlert, isOverplayedMassTopic } from './hard-reject';

export interface PreRankItem {
  title: string;
  text?: string;
  url?: string;
  sourceName: string;
}

const DEAL_OPINION_RE =
  /\b(on sale|deal|discount|% off|just \$\d+|here.?s why|i.?ve used|acquires?|acquisition|best \d+|roundup|gift guide|video friday|week in review)\b/i;
const UNUSUAL_SIGNAL_RE =
  /\b(humanoid|robot|drone|swarm|exoskeleton|wristband|gesture|neuromuscular|cry|bassinet|ultra-?thin|haptic|translator|on-device ai|prototype|breakthrough|foldable|hover|gimbal)\b|робот|браслет|люльк|рой\s+дрон/i;
const RESEARCH_SIGNAL_RE =
  /\b(mit|ieee|eth|wyss|csail|researchers?|university|lab\s+demo|peer[- ]reviewed)\b/i;

/** Normalize title for near-duplicate detection. */
export function topicKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, ' ')
    .replace(/\b(the|a|an|new|with|for|and|to|of|in|on)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' ');
}

/** Drop near-duplicate topics (keep first / higher-ranked later). */
export function dedupeSimilarTopics<T extends PreRankItem>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = topicKey(it.title);
    if (!key) {
      out.push(it);
      continue;
    }
    if (seen.has(key)) continue;
    // Also block if 4+ token overlap with an kept key
    let dup = false;
    const tokens = new Set(key.split(' '));
    for (const prev of seen) {
      const prevTokens = prev.split(' ');
      const overlap = prevTokens.filter((t) => tokens.has(t)).length;
      if (overlap >= 4) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Higher = better for Scout queue. Purely local heuristics.
 * Source tier does NOT auto-inflate to a publish score — only discovery priority.
 */
export function cheapPreRankScore(item: PreRankItem): number {
  const title = item.title || '';
  const text = item.text || '';
  const hay = `${title}\n${text}`.slice(0, 1200);
  const meta = sourceMetaByName(item.sourceName);
  let score = 50;

  // Discovery / research sources get a seat at the table (not a Scout score boost).
  if (meta?.tier === 'A_DISCOVERY') score += 12;
  else if (meta?.tier === 'A_PRIMARY') score += 6;
  else if (meta?.tier === 'B') score += 2;
  else if (meta?.tier === 'C') score -= 4;

  if (meta?.focus.some((f) => f === 'robotics' || f === 'research' || f === 'ai' || f === 'china')) {
    score += 8;
  }

  if (UNUSUAL_SIGNAL_RE.test(hay)) score += 18;
  if (RESEARCH_SIGNAL_RE.test(hay) || isAiOrInventionAlert(title, text)) score += 10;
  if (DEAL_OPINION_RE.test(title)) score -= 25;
  if (isOverplayedMassTopic(title, text) || looksCommodityRoutine(title, text)) score -= 30;
  if (looksSmartHomeRoutine(title, text)) score -= 18;

  // Prefer fresher discoveryRank (lower rank number → slight boost)
  const dr = discoveryRankFor(item.sourceName);
  score += Math.max(0, 10 - Math.min(dr, 10));

  return score;
}

export interface ScoutPoolResult<T extends PreRankItem> {
  rawCount: number;
  afterDedupe: number;
  pool: T[];
  /** Debug: top cheap scores */
  rankedPreview: { title: string; sourceName: string; cheap: number }[];
}

/**
 * Build Scout pool: dedupe → cheap rank → diversify sources → TOP limit (12–16).
 */
export function buildScoutPool<T extends PreRankItem>(
  items: T[],
  opts?: { limit?: number; maxPerSource?: number },
): ScoutPoolResult<T> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 14, 16));
  const maxPerSource = opts?.maxPerSource ?? 3;
  const rawCount = items.length;
  const deduped = dedupeSimilarTopics(items);
  const ranked = [...deduped].sort((a, b) => {
    const d = cheapPreRankScore(b) - cheapPreRankScore(a);
    if (d !== 0) return d;
    return discoveryRankFor(a.sourceName) - discoveryRankFor(b.sourceName);
  });

  const pool: T[] = [];
  const perSource = new Map<string, number>();
  for (const it of ranked) {
    if (pool.length >= limit) break;
    const n = perSource.get(it.sourceName) || 0;
    if (n >= maxPerSource) continue;
    perSource.set(it.sourceName, n + 1);
    pool.push(it);
  }

  // If diversity starved the pool, fill from ranked ignoring per-source cap.
  if (pool.length < Math.min(limit, ranked.length)) {
    for (const it of ranked) {
      if (pool.length >= limit) break;
      if (pool.includes(it)) continue;
      pool.push(it);
    }
  }

  return {
    rawCount,
    afterDedupe: deduped.length,
    pool,
    rankedPreview: ranked.slice(0, 20).map((it) => ({
      title: it.title,
      sourceName: it.sourceName,
      cheap: cheapPreRankScore(it),
    })),
  };
}
