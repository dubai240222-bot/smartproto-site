/**
 * Mobile Apps “mine” — public RSS/Atom sources for useful / novel apps & games.
 * Safe feeds only (no shady store scrapes). Wired into desks + newsroom tick.
 *
 * Verified 2026-08-02 (HTTP 200 RSS/Atom):
 *   - MacStories iOS category
 *   - Cult of Mac Apps
 *   - 9to5Google Apps guides
 *   - Google Play / Google Blog editorial
 *   - Product Hunt public feed (keyword-filtered for apps)
 *   - TouchArcade (wonderful / notable games)
 *   - Android Authority main feed (keyword-filtered for apps)
 *
 * Skipped / unavailable at probe time:
 *   - AppAdvice (DNS fail)
 *   - Android Authority /apps/feed (500)
 *   - Product Hunt topic feeds (403)
 *   - Apple top-apps RSS (404)
 */

export type AppSourceAccess = 'safe' | 'needs_review';

export interface AppSource {
  id: string;
  name: string;
  feedUrl: string;
  accessMode: AppSourceAccess;
  notes: string;
  /** When true, items still need app/game keyword match (mixed tech feeds). */
  requiresAppKeyword?: boolean;
}

/** Human-edited registry — collectors only fetch accessMode===safe. */
export const APP_SOURCES: AppSource[] = [
  {
    id: 'macstories-ios',
    name: 'MacStories iOS',
    feedUrl: 'https://www.macstories.net/category/ios/feed/',
    accessMode: 'safe',
    notes: 'App Store / iOS app stories and deep reviews',
  },
  {
    id: 'cultofmac-apps',
    name: 'Cult of Mac Apps',
    feedUrl: 'https://www.cultofmac.com/category/apps/feed/',
    accessMode: 'safe',
    notes: 'Mac/iOS app discoveries and novelties',
  },
  {
    id: '9to5google-apps',
    name: '9to5Google Apps',
    feedUrl: 'https://9to5google.com/guides/apps/feed/',
    accessMode: 'safe',
    notes: 'Android / Google apps coverage',
  },
  {
    id: 'google-play-blog',
    name: 'Google Play Blog',
    feedUrl: 'https://blog.google/products/google-play/rss/',
    accessMode: 'safe',
    notes: 'Official Google Play editorial / featured apps',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    feedUrl: 'https://www.producthunt.com/feed',
    accessMode: 'safe',
    notes: 'Public PH Atom — filter to mobile/app launches (no topic scrape)',
    requiresAppKeyword: true,
  },
  {
    id: 'toucharcade',
    name: 'TouchArcade',
    feedUrl: 'https://toucharcade.com/feed/',
    accessMode: 'safe',
    notes: 'Notable / wonderful mobile games',
  },
  {
    id: 'android-authority',
    name: 'Android Authority',
    feedUrl: 'https://www.androidauthority.com/feed/',
    accessMode: 'safe',
    notes: 'Main AA feed — keyword-filter for apps (dedicated /apps/feed was 500)',
    requiresAppKeyword: true,
  },
  {
    id: 'macstories-main',
    name: 'MacStories',
    feedUrl: 'https://www.macstories.net/feed/',
    accessMode: 'safe',
    notes: 'Broader MacStories — soft app keyword filter',
    requiresAppKeyword: true,
  },
];

export function listSafeAppSources(): AppSource[] {
  return APP_SOURCES.filter((s) => s.accessMode === 'safe');
}

/** [displayName, feedUrl] pairs for RSS collectors. */
export function appSourceFeedPairs(): [string, string][] {
  return listSafeAppSources().map((s) => [s.name, s.feedUrl]);
}

export function appSourceRequiresKeyword(sourceName: string): boolean {
  const n = sourceName.toLowerCase();
  const hit = APP_SOURCES.find(
    (s) => s.name.toLowerCase() === n || s.id.toLowerCase() === n || n.includes(s.name.toLowerCase()),
  );
  return hit?.requiresAppKeyword === true;
}
