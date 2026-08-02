/**
 * SP-A-035 — China Collector v1 (safe sources only). No AI / Qwen / publish.
 */
import { fetchRssFeed, type RssItem } from './rss';
import {
  listSafeChinaSources,
  type ChinaRawCandidate,
  type ChinaSource,
  type ChinaSourceType,
} from './china-sources';
import { chinaHardReject, findChinaNoveltySignals, looksChinaConsumerGadget } from '../ai/china-analyst';

const TYPES = new Set<ChinaSourceType>(['rss', 'sitemap', 'newsroom', 'crowdfunding', 'public_page']);
const FEED_BY_ID: Record<string, string> = {
  'ithome-rss': 'https://www.ithome.com/rss/',
  '36kr-rss': 'https://36kr.com/feed',
  'anker-news': 'https://www.anker.com/blogs/news.atom',
};
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export interface ChinaFilteredCandidate {
  candidate: ChinaRawCandidate;
  decision: 'CONSIDER' | 'REJECT';
  reason: string;
}

function isClearlyOld(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t > MAX_AGE_MS;
}

function toCandidate(source: ChinaSource, item: RssItem): ChinaRawCandidate {
  const title = (item.title || '').trim();
  const summary = (item.text || '').slice(0, 800);
  return {
    sourceId: source.id, sourceName: source.name, sourceUrl: (item.url || '').trim(),
    platform: source.type, language: 'zh', title, summary, priceText: '',
    imageUrl: item.imageUrl || '', publishedAt: item.publishedAt || '',
    rawSignals: findChinaNoveltySignals(`${title}\n${summary}`),
    collectedAt: new Date().toISOString(),
  };
}

export function filterChinaCandidate(c: ChinaRawCandidate): ChinaFilteredCandidate {
  if (!c.title.trim()) return { candidate: c, decision: 'REJECT', reason: 'empty title' };
  if (!c.sourceUrl.trim()) return { candidate: c, decision: 'REJECT', reason: 'no URL' };
  if (c.publishedAt && isClearlyOld(c.publishedAt)) {
    return { candidate: c, decision: 'REJECT', reason: 'clearly old date' };
  }
  const gate = chinaHardReject(c);
  if (gate.reject) return { candidate: c, decision: 'REJECT', reason: gate.reason };
  // Prefer buyable consumer gadgets over weak signal matches (e.g. 消费电子 in an essay).
  if (!looksChinaConsumerGadget(c.title, c.summary)) {
    return { candidate: c, decision: 'REJECT', reason: 'not a consumer gadget launch' };
  }
  return { candidate: c, decision: 'CONSIDER', reason: 'novelty signals present' };
}

function resolveFeedUrl(source: ChinaSource): string | null {
  if (FEED_BY_ID[source.id]) return FEED_BY_ID[source.id];
  if (/\.(xml|atom|rss)(\?|$)/i.test(source.url) || /\/(rss|feed|atom)(\/|$)/i.test(source.url)) {
    return source.url;
  }
  return null;
}

async function fetchSitemap(pageUrl: string, limit: number): Promise<RssItem[]> {
  const url = /sitemap/i.test(pageUrl) ? pageUrl : new URL('/sitemap.xml', pageUrl).href;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SmartProtoChinaCollector/1.0', Accept: 'application/xml,text/xml,*/*' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const locs = [...(await res.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => m[1].trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, limit);
    return locs.map((u, i) => ({
      id: u, title: decodeURIComponent(u.split('/').filter(Boolean).pop() || `sm-${i}`),
      url: u, text: '', publishedAt: new Date().toISOString(), sourceName: 'sitemap',
    }));
  } catch { return []; }
}

async function fromSource(source: ChinaSource, limit: number): Promise<ChinaRawCandidate[]> {
  if (!TYPES.has(source.type)) return [];
  if (source.type === 'sitemap') return (await fetchSitemap(source.url, limit)).map((i) => toCandidate(source, i));
  const feed = resolveFeedUrl(source);
  if (!feed) return []; // newsroom/cf/public_page only when a simple feed is known
  return (await fetchRssFeed(feed, { limit, sourceName: source.name })).map((i) => toCandidate(source, i));
}

/** Collect from accessMode===safe. Never calls Qwen. */
export async function collectChinaCandidates(opts: { limitPerSource?: number } = {}): Promise<ChinaRawCandidate[]> {
  const limit = opts.limitPerSource ?? 8;
  const out: ChinaRawCandidate[] = [];
  for (const s of listSafeChinaSources()) out.push(...(await fromSource(s, limit)));
  return out;
}

export async function collectAndFilterChina(opts: { limitPerSource?: number } = {}): Promise<ChinaFilteredCandidate[]> {
  return (await collectChinaCandidates(opts)).map(filterChinaCandidate);
}
