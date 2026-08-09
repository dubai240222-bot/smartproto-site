/**
 * SP-A-065C — AI Early Warning watchlist (separate from gadget RSS_SOURCES).
 * Tier does NOT inflate Scout score. Brand names alone are not enough.
 */

import type { EditorialSource, SourceTier } from './source-registry';

export type AiRadarRole = 'primary' | 'secondary' | 'discovery_only';

export interface AiRadarSource extends EditorialSource {
  radarRole: AiRadarRole;
  /** Soft AI-topic gate for broad feeds (Forbes Innovation). */
  requireAiSignal?: boolean;
}

/** Official / lab feeds — factual authority when present. */
export const AI_RADAR_PRIMARY: AiRadarSource[] = [
  {
    id: 'openai-news',
    name: 'OpenAI News',
    feedUrl: 'https://openai.com/news/rss.xml',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['ai', 'research'],
    discoveryRank: 1,
    maxRawBytes: 500_000,
    limit: 40,
    enabled: true,
    radarRole: 'primary',
    notes: 'Official OpenAI newsroom — truncate oversized feed',
  },
  {
    id: 'google-deepmind',
    name: 'Google DeepMind',
    feedUrl: 'https://deepmind.google/blog/rss.xml',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['ai', 'research', 'robotics'],
    discoveryRank: 2,
    limit: 30,
    enabled: true,
    radarRole: 'primary',
  },
  {
    id: 'google-ai-blog',
    name: 'Google AI Blog',
    feedUrl: 'https://blog.google/technology/ai/rss/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['ai'],
    discoveryRank: 3,
    limit: 25,
    enabled: true,
    radarRole: 'primary',
    notes: 'Official Google AI channel; mixed product + research',
  },
];

export const AI_RADAR_SECONDARY: AiRadarSource[] = [
  {
    id: 'forbes-innovation',
    name: 'Forbes Innovation',
    feedUrl: 'https://www.forbes.com/innovation/feed/',
    ingest: 'rss',
    tier: 'B',
    focus: ['ai', 'general_tech'],
    discoveryRank: 8,
    limit: 25,
    enabled: true,
    radarRole: 'secondary',
    requireAiSignal: true,
    notes: 'Secondary — AI/future filter only; not authority',
  },
  {
    id: 'the-verge-ai',
    name: 'The Verge AI',
    feedUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    ingest: 'rss',
    tier: 'B',
    focus: ['ai'],
    discoveryRank: 7,
    limit: 20,
    enabled: true,
    radarRole: 'secondary',
    notes: 'AI vertical — secondary discovery',
  },
];

export const AI_RADAR_DISCOVERY_ONLY: AiRadarSource[] = [
  {
    id: 'ai-stat',
    name: 'AI-Stat',
    feedUrl: 'https://www.ai-stat.ru/news/rss.xml',
    ingest: 'rss',
    tier: 'C',
    focus: ['ai'],
    discoveryRank: 12,
    limit: 30,
    enabled: true,
    radarRole: 'discovery_only',
    notes: 'DISCOVERY ONLY — never treat as primary authority',
  },
];

/** Documented skips — no stable official RSS in short probe. */
export const AI_RADAR_SKIPPED: { name: string; reason: string }[] = [
  {
    name: 'Anthropic News',
    reason: 'No public official RSS (404 on /news/rss, /rss.xml, /news/feed.xml)',
  },
  {
    name: 'Meta AI Blog',
    reason: 'No dedicated AI RSS (ai.meta.com/blog/rss 404)',
  },
  {
    name: 'Microsoft AI Blog',
    reason: '403 / anti-bot on blogs.microsoft.com/ai feeds',
  },
];

export function enabledAiRadarSources(): AiRadarSource[] {
  return [...AI_RADAR_PRIMARY, ...AI_RADAR_SECONDARY, ...AI_RADAR_DISCOVERY_ONLY].filter(
    (s) => s.enabled,
  );
}

export function isAiRadarPrimaryHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return (
      h === 'openai.com' ||
      h.endsWith('.openai.com') ||
      h === 'deepmind.google' ||
      h === 'blog.google' ||
      h === 'ai.google' ||
      h === 'research.google' ||
      h === 'anthropic.com' ||
      h.endsWith('.anthropic.com') ||
      h === 'ai.meta.com' ||
      h === 'about.fb.com' ||
      h === 'blogs.microsoft.com' ||
      h === 'microsoft.com' ||
      /\.edu$/.test(h) ||
      h.endsWith('.ac.uk')
    );
  } catch {
    return false;
  }
}

export type { SourceTier };
