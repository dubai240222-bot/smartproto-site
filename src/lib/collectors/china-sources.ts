/**
 * SP-A-032-U1 — China Source Registry (where cheap collectors may look).
 * Budget later: parsers gather many → hard-reject → Qwen max 3–5/cycle.
 * Qwen may suggest sources; only humans add entries here. No scraping in this file.
 */

export type ChinaSourceType =
  | 'rss' | 'sitemap' | 'public_page' | 'newsroom' | 'crowdfunding' | 'marketplace';

export type ChinaAccessMode = 'safe' | 'needs_review' | 'blocked';

export interface ChinaSource {
  id: string;
  name: string;
  region: 'china';
  language: 'zh' | 'en';
  type: ChinaSourceType;
  url: string;
  priority: 'high' | 'medium' | 'low';
  accessMode: ChinaAccessMode;
  notes: string;
}

/** Raw candidate from collectors (no AI). Qwen reads these short blobs only. */
export interface ChinaRawCandidate {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  platform: string;
  language: 'zh';
  title: string;
  summary: string;
  priceText: string;
  imageUrl: string;
  publishedAt: string;
  rawSignals: string[];
  collectedAt: string;
}

const MARKET_NOTE =
  'Do not scrape without reviewing access rules, captcha, auth, and block risk.';

/** Seed registry — collectors not wired yet; marketplace = needs_review. */
export const CHINA_SOURCES: ChinaSource[] = [
  { id: 'xiaomi-newsroom', name: 'Xiaomi Newsroom', region: 'china', language: 'zh', type: 'newsroom', url: 'https://www.mi.com/news', priority: 'high', accessMode: 'safe', notes: 'Official manufacturer newsroom' },
  { id: 'huawei-consumer', name: 'Huawei Consumer News', region: 'china', language: 'zh', type: 'newsroom', url: 'https://consumer.huawei.com/en/press/', priority: 'high', accessMode: 'safe', notes: 'Official product/press pages' },
  { id: 'anker-news', name: 'Anker Newsroom', region: 'china', language: 'en', type: 'newsroom', url: 'https://www.anker.com/blogs/news', priority: 'high', accessMode: 'safe', notes: 'Manufacturer product announcements' },
  { id: 'modian-cf', name: 'Modian Crowdfunding', region: 'china', language: 'zh', type: 'crowdfunding', url: 'https://zhongchou.modian.com/', priority: 'high', accessMode: 'safe', notes: 'CN crowdfunding / preorder signals' },
  { id: 'indiegogo-tech', name: 'Indiegogo Tech', region: 'china', language: 'en', type: 'crowdfunding', url: 'https://www.indiegogo.com/explore/tech-innovation', priority: 'high', accessMode: 'safe', notes: 'Crowdfunding hardware (global+CN makers)' },
  { id: 'ces-asia-exhibits', name: 'CES / CN exhibition pages', region: 'china', language: 'en', type: 'public_page', url: 'https://www.ces.tech/', priority: 'high', accessMode: 'safe', notes: 'Exhibition / factory launch pages' },
  { id: 'aliexpress-new', name: 'AliExpress New Arrivals', region: 'china', language: 'en', type: 'marketplace', url: 'https://www.aliexpress.com/', priority: 'high', accessMode: 'safe', notes: 'Use only if public listing/RSS remains safe; no aggressive scrape' },
  { id: 'producthunt-hw', name: 'Product Hunt Hardware', region: 'china', language: 'en', type: 'public_page', url: 'https://www.producthunt.com/topics/hardware', priority: 'high', accessMode: 'safe', notes: 'Hardware launches often include CN makers' },
  { id: '36kr-rss', name: '36Kr', region: 'china', language: 'zh', type: 'rss', url: 'https://36kr.com/', priority: 'high', accessMode: 'safe', notes: 'CN tech media — prefer official RSS/public feed when wired' },
  { id: 'ithome-rss', name: 'IT之家', region: 'china', language: 'zh', type: 'rss', url: 'https://www.ithome.com/', priority: 'high', accessMode: 'safe', notes: 'CN gadget media RSS/public feed' },
  { id: 'taobao', name: 'Taobao', region: 'china', language: 'zh', type: 'marketplace', url: 'https://www.taobao.com/', priority: 'low', accessMode: 'needs_review', notes: MARKET_NOTE },
  { id: 'tmall', name: 'Tmall', region: 'china', language: 'zh', type: 'marketplace', url: 'https://www.tmall.com/', priority: 'low', accessMode: 'needs_review', notes: MARKET_NOTE },
  { id: '1688', name: '1688', region: 'china', language: 'zh', type: 'marketplace', url: 'https://www.1688.com/', priority: 'low', accessMode: 'needs_review', notes: MARKET_NOTE },
  { id: 'jd', name: 'JD.com', region: 'china', language: 'zh', type: 'marketplace', url: 'https://www.jd.com/', priority: 'low', accessMode: 'needs_review', notes: MARKET_NOTE },
  { id: 'xhs', name: 'Xiaohongshu', region: 'china', language: 'zh', type: 'marketplace', url: 'https://www.xiaohongshu.com/', priority: 'low', accessMode: 'needs_review', notes: MARKET_NOTE },
];

export function listSafeChinaSources(): ChinaSource[] {
  return CHINA_SOURCES.filter((s) => s.accessMode === 'safe');
}
