/**
 * SP-A-065 — editorial source registry.
 * Tier does NOT auto-inflate Scout score; it only guides discovery priority.
 */

export type SourceTier = 'A_PRIMARY' | 'A_DISCOVERY' | 'B' | 'C';

export type SourceFocus =
  | 'robotics'
  | 'ai'
  | 'china'
  | 'research'
  | 'healthtech'
  | 'consumer'
  | 'mobility'
  | 'materials'
  | 'gadgets'
  | 'hardware'
  | 'design'
  | 'general_tech';

export type SourceIngest = 'rss' | 'china' | 'html';

export interface EditorialSource {
  id: string;
  name: string;
  feedUrl: string;
  ingest: SourceIngest;
  tier: SourceTier;
  focus: SourceFocus[];
  /** Soft rank for candidate ordering (lower = earlier). Not a score boost. */
  discoveryRank: number;
  /** Cap raw RSS body for oversized feeds (bytes). */
  maxRawBytes?: number;
  /** Per-tick item cap (default 50). */
  limit?: number;
  enabled: boolean;
  notes?: string;
}

/**
 * Live RSS polled by newsroom tick (Channel B).
 * Existing production feeds kept; SP-INTEL-001 starter pack appended.
 */
export const RSS_SOURCES: EditorialSource[] = [
  // —— existing production ——
  {
    id: 'yanko-design',
    name: 'Yanko Design',
    feedUrl: 'https://www.yankodesign.com/feed/',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['design', 'gadgets', 'consumer'],
    discoveryRank: 0,
    enabled: true,
  },
  {
    id: 'new-atlas',
    name: 'New Atlas',
    feedUrl: 'https://newatlas.com/index.rss',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['gadgets', 'research', 'mobility', 'healthtech'],
    discoveryRank: 2,
    enabled: true,
  },
  {
    id: 'new-atlas-electronics',
    name: 'New Atlas Electronics',
    feedUrl: 'https://newatlas.com/electronics/index.rss',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['gadgets', 'hardware'],
    discoveryRank: 3,
    enabled: true,
  },
  {
    id: 'new-atlas-wearables',
    name: 'New Atlas Wearables',
    feedUrl: 'https://newatlas.com/wearables/index.rss',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['gadgets', 'healthtech', 'ai'],
    discoveryRank: 1,
    enabled: true,
  },
  // Known New Atlas category paths (≤2 tweaks) — mobility / medical diversity without mass RSS.
  {
    id: 'new-atlas-automotive',
    name: 'New Atlas Automotive',
    feedUrl: 'https://newatlas.com/automotive/index.rss',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['mobility', 'gadgets', 'consumer'],
    discoveryRank: 2,
    limit: 25,
    enabled: true,
    notes: 'Thematic balance — EV/mobility/charging desk',
  },
  {
    id: 'new-atlas-medical',
    name: 'New Atlas Medical',
    feedUrl: 'https://newatlas.com/medical/index.rss',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['healthtech', 'research', 'materials'],
    discoveryRank: 2,
    limit: 25,
    enabled: true,
    notes: 'Thematic balance — health-tech desk',
  },
  {
    id: 'gadget-flow',
    name: 'Gadget Flow',
    feedUrl: 'https://thegadgetflow.com/feed/',
    ingest: 'rss',
    tier: 'A_PRIMARY',
    focus: ['gadgets', 'consumer'],
    discoveryRank: 1,
    enabled: true,
  },
  {
    id: 'hackaday',
    name: 'Hackaday',
    feedUrl: 'https://hackaday.com/blog/feed/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['hardware', 'gadgets', 'research'],
    discoveryRank: 6,
    enabled: true,
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    feedUrl: 'https://techcrunch.com/feed/',
    ingest: 'rss',
    tier: 'B',
    focus: ['general_tech', 'ai', 'consumer'],
    discoveryRank: 10,
    enabled: true,
  },
  {
    id: 'the-verge',
    name: 'The Verge',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    ingest: 'rss',
    tier: 'B',
    focus: ['general_tech', 'consumer'],
    discoveryRank: 11,
    enabled: true,
  },
  {
    id: 'the-verge-gadgets',
    name: 'The Verge Gadgets',
    feedUrl: 'https://www.theverge.com/rss/gadgets/index.xml',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['gadgets', 'consumer'],
    discoveryRank: 5,
    enabled: true,
  },
  {
    id: 'engadget',
    name: 'Engadget',
    feedUrl: 'https://www.engadget.com/rss.xml',
    ingest: 'rss',
    tier: 'B',
    focus: ['gadgets', 'consumer'],
    discoveryRank: 12,
    enabled: true,
  },
  {
    id: '9to5google',
    name: '9to5Google',
    feedUrl: 'https://9to5google.com/feed/',
    ingest: 'rss',
    tier: 'C',
    focus: ['consumer', 'gadgets'],
    discoveryRank: 14,
    enabled: true,
  },
  {
    id: 'android-authority',
    name: 'Android Authority',
    feedUrl: 'https://www.androidauthority.com/feed',
    ingest: 'rss',
    tier: 'C',
    focus: ['consumer', 'gadgets'],
    discoveryRank: 15,
    enabled: true,
  },

  // —— SP-INTEL-001 starter pack (wave 1) ——
  {
    id: 'technode',
    name: 'TechNode',
    feedUrl: 'https://technode.com/feed/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['china', 'ai', 'hardware'],
    discoveryRank: 7,
    maxRawBytes: 400_000,
    limit: 25,
    enabled: true,
    notes: 'Full feed is ~11MB/2000 items — truncated before parse',
  },
  {
    id: 'ieee-spectrum-robotics',
    name: 'IEEE Spectrum Robotics',
    feedUrl: 'https://spectrum.ieee.org/feeds/topic/robotics.rss',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['robotics', 'research', 'ai'],
    discoveryRank: 5,
    limit: 30,
    enabled: true,
  },
  {
    id: 'the-robot-report',
    name: 'The Robot Report',
    feedUrl: 'https://www.therobotreport.com/feed/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['robotics', 'hardware'],
    discoveryRank: 5,
    limit: 25,
    enabled: true,
  },
  {
    id: 'mit-news',
    name: 'MIT News',
    feedUrl: 'https://news.mit.edu/rss/feed',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['research', 'ai', 'robotics'],
    discoveryRank: 6,
    limit: 30,
    enabled: true,
  },
  {
    id: 'harvard-wyss',
    name: 'Harvard Wyss Institute',
    feedUrl: 'https://wyss.harvard.edu/feed/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['research', 'healthtech', 'materials'],
    discoveryRank: 3,
    limit: 20,
    enabled: true,
  },
  {
    id: 'mit-csail',
    name: 'MIT CSAIL',
    feedUrl: 'https://www.csail.mit.edu/rss.xml',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['ai', 'research', 'robotics'],
    discoveryRank: 5,
    limit: 20,
    enabled: true,
  },
  {
    id: 'eth-zurich',
    name: 'ETH Zurich',
    feedUrl:
      'https://www.ethz.ch/en/news-und-veranstaltungen/eth-news/news/_jcr_content.feed.html',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['research', 'robotics', 'materials'],
    discoveryRank: 6,
    limit: 20,
    enabled: true,
    notes: 'Atom feed; often sparse',
  },
  {
    id: 'tech-xplore',
    name: 'Tech Xplore',
    feedUrl: 'https://techxplore.com/rss-feed/',
    ingest: 'rss',
    tier: 'A_DISCOVERY',
    focus: ['research', 'ai', 'robotics', 'hardware'],
    discoveryRank: 7,
    limit: 30,
    enabled: true,
  },
];

/** Documented skip — not wired (unstable / no usable RSS / heavy scrape). */
export const SKIPPED_STARTER_SOURCES: {
  name: string;
  reason: string;
}[] = [
  {
    name: 'EurekAlert Engineering/Technology',
    reason: 'RSS endpoints 403/404 without authenticated/custom scrape',
  },
  {
    name: 'Robot Start',
    reason: 'Host unreachable / no stable public RSS',
  },
  {
    name: 'KAIST News',
    reason: 'No working public RSS found in short probe',
  },
  {
    name: 'Jiqizhixin',
    reason: 'Feed returns empty/non-item HTML — needs dedicated adapter',
  },
  {
    name: 'QbitAI',
    reason: '403 / anti-bot — skip until stable non-headless ingest',
  },
];

export function enabledRssSources(): EditorialSource[] {
  return RSS_SOURCES.filter((s) => s.enabled && s.ingest === 'rss');
}

export function sourceMetaByName(name: string): EditorialSource | undefined {
  const n = name.toLowerCase();
  return RSS_SOURCES.find((s) => s.name.toLowerCase() === n || s.id === n);
}

export function discoveryRankFor(name: string): number {
  return sourceMetaByName(name)?.discoveryRank ?? 20;
}
