/**
 * SP-A-066b — Homepage editorial mix (display-only).
 * Prefer AI models / phone apps / strong inventions; soft-demote commodity
 * audio/mice/keyboards; avoid same-bucket streaks on the first screen.
 * Does not change Scout/Publisher — only how the homepage orders published cards.
 */
import type { Article } from '@/data/articles';
import { inferEditorialFocus, type EditorialFocus } from '@/lib/newsroom/diversity-guard';

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

function blobOf(a: Article): string {
  const tags = Array.isArray(a.tags) ? a.tags.join(' ') : '';
  return `${a.title}\n${a.summary}\n${a.category}\n${tags}\n${(a.content || '').slice(0, 600)}`;
}

export function inferMixBucket(article: Article): MixBucket {
  const blob = blobOf(article);
  if (AI_MODEL_RE.test(blob) || PHONE_APP_RE.test(blob)) {
    // Apps / models first even if also "gadget"
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

function bucketPriority(bucket: MixBucket): number {
  switch (bucket) {
    case 'ai_models':
      return 100;
    case 'phone_apps':
      return 95;
    case 'robotics':
      return 80;
    case 'invention':
      return 75;
    case 'phone_gadget':
      return 60;
    case 'production':
      return 45;
    case 'other':
      return 35;
    case 'commodity':
      return 8;
    default:
      return 30;
  }
}

function recencyBonus(publishedAt: string, nowMs: number): number {
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return 0;
  const ageH = Math.max(0, (nowMs - t) / 3_600_000);
  if (ageH < 6) return 25;
  if (ageH < 24) return 18;
  if (ageH < 72) return 10;
  if (ageH < 168) return 4;
  return 0;
}

function scoreArticle(article: Article, nowMs: number): number {
  const bucket = inferMixBucket(article);
  let score = bucketPriority(bucket) + recencyBonus(article.publishedAt, nowMs);
  // Prefer real product/scene photos over empty logo tiles on the homepage.
  if (hasDisplayWorthyImage(article)) score += 12;
  else if (articleHeroUrl(article) && isWeakHeroUrl(articleHeroUrl(article)!)) score -= 20;
  return score;
}

function articleHeroUrl(article: Article): string | undefined {
  return article.images?.find((i) => i.role === 'hero')?.url || article.imageUrl || undefined;
}

/** Logo / brand / icon tiles that read as empty illustrations on the lead. */
export function isWeakHeroUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /logo|favicon|sprite|wordmark|brand[-_]?mark|icon[-_]?only|\/icons?\/|apple-touch|og-default|default[-_]image|placeholder|1x1|pixel\.gif|\.svg(\?|$)/i.test(
      u,
    ) ||
    /google.*logo|gstatic\.com\/.*logo|lh3\.googleusercontent\.com\/.*[-_]s\d{2,3}([?\-]|$)/i.test(u) ||
    /unsplash\.com/i.test(u)
  );
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

/**
 * Rotate the LEAD among strong photo-backed candidates every `holdHours`.
 * Stays put for many hours, but changes more often than “forever newest #1”.
 */
export function pickRotatingLead(
  feed: Article[],
  holdHours = 5,
): { lead: Article; rest: Article[] } {
  if (feed.length === 0) {
    throw new Error('pickRotatingLead: empty feed');
  }
  const photoPool = feed.filter(hasDisplayWorthyImage);
  const interestPool = feed.filter((a) => {
    const b = inferMixBucket(a);
    return b === 'ai_models' || b === 'phone_apps' || b === 'robotics' || b === 'invention';
  });
  const pool =
    photoPool.length >= 3
      ? photoPool.slice(0, 12)
      : interestPool.length >= 3
        ? interestPool.slice(0, 12)
        : feed.slice(0, 12);

  const bucket = Math.floor(Date.now() / (Math.max(1, holdHours) * 3_600_000));
  const lead = pool[bucket % pool.length] || feed[0];
  const rest = feed.filter((a) => a.slug !== lead.slug);
  return { lead, rest };
}

/**
 * Greedy mix: always pick the highest-scoring remaining article that does not
 * repeat the previous mix bucket (when alternatives exist). Soft — never empties.
 */
export function mixHomepageArticles(list: Article[], limit = 40): Article[] {
  if (list.length <= 1) return [...list];
  const nowMs = Date.now();
  const remaining = [...list].sort((a, b) => {
    const ds = scoreArticle(b, nowMs) - scoreArticle(a, nowMs);
    if (ds !== 0) return ds;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const out: Article[] = [];
  let lastBucket: MixBucket | null = null;

  while (remaining.length > 0 && out.length < limit) {
    let pickIdx = 0;
    if (lastBucket) {
      const alt = remaining.findIndex((a) => inferMixBucket(a) !== lastBucket);
      // Prefer diversity unless the only strong candidates are same-bucket
      if (alt >= 0) {
        const same = remaining[0];
        const diverse = remaining[alt];
        const sameScore = scoreArticle(same, nowMs);
        const divScore = scoreArticle(diverse, nowMs);
        // Allow same-bucket only if it is clearly fresher/stronger (+18+)
        pickIdx = sameScore >= divScore + 18 && inferMixBucket(same) === lastBucket ? 0 : alt;
        // Extra: never open with two commodities in a row if anything else exists
        if (
          lastBucket === 'commodity' &&
          inferMixBucket(remaining[pickIdx]) === 'commodity'
        ) {
          const non = remaining.findIndex((a) => inferMixBucket(a) !== 'commodity');
          if (non >= 0) pickIdx = non;
        }
      }
    }

    const [picked] = remaining.splice(pickIdx, 1);
    out.push(picked);
    lastBucket = inferMixBucket(picked);
  }

  // Append any leftovers beyond limit order for pager completeness when caller asks full list
  if (limit >= list.length) {
    return out;
  }
  return out;
}

/** Full homepage order: mixed front preference, then remaining chronologically mixed. */
export function orderArticlesForHomepage(list: Article[]): Article[] {
  const mixed = mixHomepageArticles(list, list.length);
  return mixed;
}
