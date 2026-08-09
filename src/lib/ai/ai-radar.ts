/**
 * SP-A-065C — AI Early Warning channel (collect → event filter → resolve primary).
 * Does NOT publish. Does NOT rewrite gadget/robotics pipeline.
 *
 * CORE INSTINCT: «Узнать о новой свободе раньше других — и получить её первым».
 * Brand names alone never raise priority.
 */

import { fetchRssFeed, type RssItem } from '../collectors/rss';
import {
  AI_RADAR_SKIPPED,
  enabledAiRadarSources,
  isAiRadarPrimaryHost,
  type AiRadarSource,
} from '../collectors/ai-radar-sources';
import { buildScoutPool, topicKey } from './candidate-prerank';

export type AiEventPriority = 'high' | 'medium' | 'low' | 'drop';

export interface AiRadarCandidate {
  title: string;
  text: string;
  url: string;
  sourceName: string;
  radarRole: AiRadarSource['radarRole'];
  priority: AiEventPriority;
  eventSignals: string[];
  primaryUrl?: string;
  primaryTitle?: string;
  primaryResolved: boolean;
  needsPrimaryResolve: boolean;
}

const AI_TOPIC_RE =
  /\b(ai|a\.i\.|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|deepmind|model|agentic|autonom|robot|нейро|ии)\b/i;

/** High: real EVENT / WOW / FREEDOM — not brand mention. */
const HIGH_EVENT_RE =
  /\b(pause[sd]?|halt(ed|ing)?|puts? the brakes|too (powerful|capable)|critical (cyber|capability)|cyber (risk|threat|capabilit)|preparedness|safety (incident|framework)|went rogue|escaped|sandboxed|unexpected(ly)? (autonomous|capable)|breakthrough|embodied|humanoid|does (real )?work (instead|for)|replace(s|ing)? (human|office|commute)|cheaper than|mass[- ]market|freedom from|without human intervention|next frontier|astra|нажал(а|и)? на тормоз|критическ\w* (кибер|способност)|неожиданн\w* способн)\b/i;

const MEDIUM_EVENT_RE =
  /\b(deploy(ment|ed|ing)?|capability|agent(ic)?|robotics|physical ai|assistant (that|which)|on-device|frontier|research demo|prototype|opens? (weights|source model)|новый интерфейс|домашн\w* робот)\b/i;

/** Low / noise — brand fluff without life-changing event. */
const LOW_NOISE_RE =
  /\b(api (version|bump|update)|pricing|price (cut|tier|war)|benchmark (score|leaderboard)|model refresh|changelog|quarterly|partnership announcement|vibe coding course|dinner party|managed agents hooks)\b/i;

export function classifyAiEvent(title: string, text = ''): {
  priority: AiEventPriority;
  signals: string[];
} {
  const hay = `${title}\n${text}`.slice(0, 2500);
  const signals: string[] = [];
  // Brand/education fluff — never high even if "capability" appears in boilerplate.
  if (/\bvibe coding\b|\bdinner party\b|\bmanaged agents hooks\b/i.test(hay)) {
    signals.push('noise: course/hooks/dinner fluff');
    return { priority: 'low', signals };
  }
  if (LOW_NOISE_RE.test(hay) && !HIGH_EVENT_RE.test(hay)) {
    signals.push('noise: pricing/benchmark/api/refresh');
    return { priority: 'low', signals };
  }
  if (HIGH_EVENT_RE.test(hay)) {
    signals.push('high: pause/critical/autonomous/breakthrough/freedom');
    return { priority: 'high', signals };
  }
  if (MEDIUM_EVENT_RE.test(hay)) {
    signals.push('medium: capability/deploy/robotics/agent');
    return { priority: 'medium', signals };
  }
  if (!AI_TOPIC_RE.test(hay)) {
    return { priority: 'drop', signals: ['no AI signal'] };
  }
  signals.push('weak: AI topic without clear event');
  return { priority: 'low', signals };
}

function needsResolve(role: AiRadarSource['radarRole'], title: string, text: string): boolean {
  if (role === 'primary') return false;
  const hay = `${title}\n${text}`;
  return /\b(model|capability|safety|cyber|robot|breakthrough|pause|deploy|autonom|llm|gpt|claude|gemini|astra)\b/i.test(
    hay,
  );
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Match discovery story to an official item already in the primary pool (no inventing). */
export function resolveToPrimary(
  candidate: { title: string; text: string; url: string },
  primaryPool: RssItem[],
): { url?: string; title?: string; resolved: boolean } {
  if (isAiRadarPrimaryHost(candidate.url)) {
    return { url: candidate.url, title: candidate.title, resolved: true };
  }
  const hay = `${candidate.title}\n${candidate.text}\n${candidate.url}`;
  const key = topicKey(candidate.title);
  const tokens = new Set(key.split(' ').filter((t) => t.length > 3));
  if (tokens.size < 2 && !/\b(astra|cyber|preparedness)\b/i.test(hay)) {
    return { resolved: false };
  }

  let best: { item: RssItem; overlap: number } | null = null;
  for (const p of primaryPool) {
    if (!isAiRadarPrimaryHost(p.url)) continue;
    const pt = new Set(topicKey(p.title).split(' ').filter((t) => t.length > 3));
    let overlap = 0;
    for (const t of tokens) if (pt.has(t)) overlap += 1;
    const rare =
      hay.match(
        /\b(astra|preparedness|cyber|zero-?day|weathernext|lyria|gemini robotics|critical cyber)\b/gi,
      ) || [];
    const primaryHay = `${p.title}\n${p.text}\n${p.url}`;
    for (const r of rare) {
      if (new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(primaryHay)) {
        overlap += 3;
      }
    }
    // Shared lab/vendor + event noun
    if (
      /\bopenai\b/i.test(hay) &&
      /\bopenai\.com\b/i.test(p.url) &&
      /\b(astra|cyber|preparedness|pause|brakes)\b/i.test(hay) &&
      /\b(astra|cyber|preparedness|frontier|capability)\b/i.test(primaryHay)
    ) {
      overlap += 4;
    }
    if (overlap >= 3 && (!best || overlap > best.overlap)) {
      best = { item: p, overlap };
    }
  }
  if (!best) return { resolved: false };
  return { url: best.item.url, title: best.item.title, resolved: true };
}

export async function collectAiRadarCandidates(opts?: {
  limitPerSource?: number;
}): Promise<{
  candidates: AiRadarCandidate[];
  primaryPool: RssItem[];
  perSource: Record<string, { raw: number; kept: number; role: string }>;
  skipped: { name: string; reason: string }[];
}> {
  const sources = enabledAiRadarSources();
  const perSource: Record<string, { raw: number; kept: number; role: string }> = {};
  const primaryPool: RssItem[] = [];
  const rawItems: { item: RssItem; src: AiRadarSource }[] = [];

  for (const src of sources) {
    const items = await fetchRssFeed(src.feedUrl, {
      limit: opts?.limitPerSource ?? src.limit ?? 25,
      sourceName: src.name,
      maxRawBytes: src.maxRawBytes,
      skipPageImageFetch: true,
    });
    let kept = 0;
    for (const it of items) {
      if (!it.title || !it.url) continue;
      if (src.requireAiSignal && !AI_TOPIC_RE.test(`${it.title}\n${it.text || ''}`)) continue;
      kept += 1;
      rawItems.push({ item: it, src });
      if (src.radarRole === 'primary') primaryPool.push(it);
    }
    perSource[src.name] = { raw: items.length, kept, role: src.radarRole };
  }

  const candidates: AiRadarCandidate[] = [];
  const seen = new Set<string>();
  for (const { item, src } of rawItems) {
    const title = decodeBasicEntities(item.title);
    const text = decodeBasicEntities(item.text || item.title);
    const tk = topicKey(title);
    if (tk && seen.has(tk)) continue;
    if (tk) seen.add(tk);

    const { priority, signals } = classifyAiEvent(title, text);
    if (priority === 'drop') continue;

    const need = needsResolve(src.radarRole, title, text);
    let primaryUrl: string | undefined;
    let primaryTitle: string | undefined;
    let primaryResolved = src.radarRole === 'primary' || isAiRadarPrimaryHost(item.url);
    if (primaryResolved) {
      primaryUrl = item.url;
      primaryTitle = title;
    } else if (need) {
      const resolved = resolveToPrimary({ title, text, url: item.url }, primaryPool);
      primaryResolved = resolved.resolved;
      primaryUrl = resolved.url;
      primaryTitle = resolved.title;
    }

    candidates.push({
      title,
      text,
      url: item.url,
      sourceName: src.name,
      radarRole: src.radarRole,
      priority,
      eventSignals: signals,
      primaryUrl,
      primaryTitle,
      primaryResolved,
      needsPrimaryResolve: need,
    });
  }

  // Prefer high event priority in ordering (not brand).
  candidates.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2, drop: 3 } as const;
    const d = rank[a.priority] - rank[b.priority];
    if (d !== 0) return d;
    if (a.primaryResolved !== b.primaryResolved) return a.primaryResolved ? -1 : 1;
    return 0;
  });

  return {
    candidates,
    primaryPool,
    perSource,
    skipped: [...AI_RADAR_SKIPPED],
  };
}

/** Build Scout pool from AI radar candidates (reuses 065B pre-rank utilities). */
export function buildAiScoutPool(candidates: AiRadarCandidate[], limit = 15) {
  const asItems = candidates
    .filter((c) => c.priority === 'high' || c.priority === 'medium')
    .map((c) => ({
      title: c.title,
      text: c.text,
      url: c.primaryUrl || c.url,
      sourceName: c.sourceName,
    }));
  return buildScoutPool(asItems, { limit, maxPerSource: 4 });
}
