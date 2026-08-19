/**
 * SP-A-066 / SP-A-081 — Homepage helpers (display-only).
 * Feed order is chronological (newest first) on /.
 * Mix helpers remain available for experiments; public pages use date sort.
 */
import type { Article } from '@/data/articles';
import { inferEditorialFocus, type EditorialFocus } from '@/lib/newsroom/diversity-guard';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';
import { heroNeedsLibraryReplacement } from '@/lib/photo-library';

export type MixBucket =
  | 'ai_models'
  | 'phone_apps'
  | 'robotics'
  | 'invention'
  | 'phone_gadget'
  | 'production'
  | 'commodity'
  | 'other';

const AI_MODEL_RE =
  /\b(gemini|gpt|claude|llm|openai|deepmind|anthropic|llama|qwen|mistral|frontier model|ai model|robotics\s*er|on-device ai|agentic|neural|chatgpt|copilot)\b|модель\s+ии|языков\w+\s+модель|искусственн\w*\s+интеллект/i;

const PHONE_APP_RE =
  /\b(app store|google play|ios app|android app|mobile app|smartphone app|приложение|телеф\w*\s+приложен|мессенджер|ai\s+app)\b/i;

const PHONE_HARDWARE_RE =
  /\b(iphone|pixel|galaxy|redmi|xiaomi|iqoo|oneplus|oppo|vivo|smartphone|смартфон|foldable|fold)\b/i;

const ROBOTICS_RE =
  /\b(robot|robotics|humanoid|tactabot|manipulat|csail)\b|робот/i;

const INVENTION_RE =
  /\b(prototype|research|lab|invention|breakthrough|optical|neuromuscular|gesture bracelet|rfid)\b|изобретен|прототип|исследован|лаборатор|прорыв/i;

/** Low reader-signal commodities for this site — mice, boomboxes, generic speakers, etc. */
const COMMODITY_RE =
  /\b(mouse|мышь|мыши|boombox|xboom|bluetooth speaker|портативн\w*\s+акустик|колонк|динамик|keyboard|клавиатур|механическ\w+\s+клавиатур|earbuds|наушник|headphones|гарнитур|charger|зарядк|power bank|powerbank|cable|кабель|tripod|штатив|webcam|веб-?камер|usb hub|usb-hub|ssd enclosure|корпус\s+nvme|watering|полив|bassinet|люльк|lego)\b/i;

/** Local copy of SPA-066 weak-tile heuristic (avoid coupling to photo-scout exports). */
function isWeakIllustrationUrl(url: string): boolean {
  const u = url.toLowerCase();
  // SP-A-084 curated stock banners (spfb=1) are intentional display assets.
  if (/[?&]spfb=1(?:&|$)/.test(u) || /\/media\/fallbacks\//i.test(u)) return false;
  return (
    /avatar|logo|icon|favicon|sprite|emoji|gravatar|placeholder/i.test(u) ||
    /\.svg(\?|$)/i.test(u) ||
    /google.*logo|gstatic\.com\/.*logo|lh3\.googleusercontent\.com\/.*[-_]s\d{2,3}([?\-]|$)/i.test(u) ||
    /unsplash\.com/i.test(u)
  );
}

function blobOf(a: Article): string {
  const tags = Array.isArray(a.tags) ? a.tags.join(' ') : '';
  return `${a.title}\n${a.summary}\n${a.category}\n${tags}\n${(a.content || '').slice(0, 600)}`;
}

export function inferMixBucket(article: Article): MixBucket {
  const blob = blobOf(article);
  if (AI_MODEL_RE.test(blob) || PHONE_APP_RE.test(blob)) {
    if (PHONE_APP_RE.test(blob) && !AI_MODEL_RE.test(blob)) return 'phone_apps';
    return 'ai_models';
  }
  if (ROBOTICS_RE.test(blob) && !COMMODITY_RE.test(blob)) return 'robotics';
  if (INVENTION_RE.test(blob) && !COMMODITY_RE.test(blob)) return 'invention';
  if (PHONE_HARDWARE_RE.test(blob)) return 'phone_gadget';
  if (COMMODITY_RE.test(blob)) return 'commodity';
  const focus: EditorialFocus = inferEditorialFocus({
    title: article.title,
    text: `${article.summary}\n${article.content || ''}`,
    tags: article.tags,
    sourceUrl: article.sourceUrl,
  });
  if (focus === 'ai_future') return 'ai_models';
  if (focus === 'robotics_research') return 'robotics';
  if (focus === 'unusual_invention') return 'invention';
  if (focus === 'consumer_gadget' || focus === 'china') return 'production';
  return 'other';
}

function articleHeroUrl(article: Article): string | undefined {
  return article.images?.find((i) => i.role === 'hero')?.url || article.imageUrl || undefined;
}

/** Logo / brand / icon tiles that read as empty illustrations on the lead. */
export function isWeakHeroUrl(url: string): boolean {
  if (isWeakIllustrationUrl(url)) return true;
  return heroNeedsLibraryReplacement(url);
}

export function hasDisplayWorthyImage(article: Article): boolean {
  const url = articleHeroUrl(article);
  if (!url || !String(url).trim()) return false;
  return !isWeakHeroUrl(url);
}

export function displayHeroUrl(article: Article): string | undefined {
  const url = articleHeroUrl(article);
  if (!url || isWeakHeroUrl(url)) return undefined;
  return url;
}

/** Newest article as lead; rest stays chronological. */
export function pickRotatingLead(
  feed: Article[],
  _holdHours = 5,
): { lead: Article; rest: Article[] } {
  if (feed.length === 0) {
    throw new Error('pickRotatingLead: empty feed');
  }
  const sorted = sortArticlesByPublishedDate(feed);
  const lead = sorted[0];
  const rest = sorted.slice(1);
  return { lead, rest };
}

/** @deprecated Public feeds use chronological order; kept for compatibility. */
export function mixHomepageArticles(list: Article[], limit = 40): Article[] {
  return sortArticlesByPublishedDate(list).slice(0, limit);
}

/** Homepage / archive order: newest first. */
export function orderArticlesForHomepage(list: Article[]): Article[] {
  return sortArticlesByPublishedDate(list);
}
