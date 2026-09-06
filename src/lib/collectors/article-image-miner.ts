/**
 * SP-A-102 — Heuristic article image mining / dedup / gallery selection (no extra LLM).
 */
import type { PhotoCandidate } from './photo-scout';

const JUNK_RE =
  /avatar|gravatar|logo|icon|sprite|placeholder|pixel|tracking|analytics|banner|728x90|ad[-_]|\bads?\b|related|recommend|footer|masthead|nav-|navigation|social-share|emoji|badge|qrcode|spinner|1x1/i;

const SCREENSHOT_RE =
  /screenshot|screen%20shot|screen_shot|ui.?capture|geekbench|antutu|benchmark score|price\s*table|\$\d{2,}\.\d{2}/i;

export function normalizeImageUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [
      'w',
      'h',
      'width',
      'height',
      'resize',
      'fit',
      'crop',
      'format',
      'quality',
      'q',
      'auto',
      'ixlib',
      'ixid',
      'utm_source',
      'utm_medium',
      'fbclid',
    ]) {
      u.searchParams.delete(k);
    }
    let path = u.pathname.replace(/\/+$/, '');
    path = path.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch {
    return url.toLowerCase().split('?')[0];
  }
}

export function isJunkArticleImage(url: string, context: string): boolean {
  const hay = `${url} ${context}`.toLowerCase();
  if (JUNK_RE.test(hay)) return true;
  if (SCREENSHOT_RE.test(hay)) return true;
  if (/\.svg(\?|$)|data:image\/svg/i.test(url)) return true;
  return false;
}

export function dedupePhotoCandidates(candidates: PhotoCandidate[]): PhotoCandidate[] {
  const out: PhotoCandidate[] = [];
  const keys = new Set<string>();
  for (const c of candidates) {
    const key = normalizeImageUrlForDedup(c.url);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(c);
  }
  return out;
}

const TIER_SCORE: Record<PhotoCandidate['tier'], number> = {
  official: 100,
  newsroom: 90,
  presskit: 85,
  lab: 80,
  trusted_media: 60,
  source_article: 50,
};

/** Cheap signals: figure/caption/alt, URL path, page title tokens, product name. */
export function subjectMatchScore(
  c: PhotoCandidate,
  titleTokens: string[],
  subjectTokens?: string[],
): number {
  const hay = `${c.context} ${c.url} ${c.pageUrl}`.toLowerCase();
  let score = 0;
  if (/^figure\b|figcaption/i.test(c.context)) score += 12;
  if (c.tier === 'official' || c.tier === 'newsroom' || c.tier === 'presskit') score += 8;
  if (c.tier === 'source_article' && /^figure\b/i.test(c.context)) score += 6;
  for (const t of titleTokens) {
    if (t.length >= 4 && hay.includes(t)) score += 5;
  }
  for (const t of subjectTokens || []) {
    if (t.length >= 3 && hay.includes(t.toLowerCase())) score += 6;
  }
  if (/\/product|\/device|\/press|\/news\/[^/]+\/[^/]+/i.test(c.url + c.pageUrl)) score += 4;
  if (/\b(gadget|wearable|ai gadget|robot|device)\b/i.test(hay) && !titleTokens.some((t) => hay.includes(t))) {
    score -= 10;
  }
  return score;
}

/** Exact subject match — topic/category alone is not enough for gallery padding. */
export function isExactSubjectMatch(
  c: PhotoCandidate,
  titleTokens: string[],
  subjectTokens?: string[],
): boolean {
  return subjectMatchScore(c, titleTokens, subjectTokens) >= 12;
}

export function extractSubjectTokens(title: string): string[] {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]+/gi, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3);
  const stop = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'their', 'about',
    'как', 'что', 'это', 'для', 'при', 'под', 'над', 'все', 'всех', 'новый', 'новая',
  ]);
  return [...new Set(tokens.filter((t) => !stop.has(t)))].slice(0, 16);
}

/** Score candidate for gallery slot — higher = more informative / trustworthy. */
export function scoreGalleryCandidate(c: PhotoCandidate, titleTokens: string[]): number {
  if (isJunkArticleImage(c.url, c.context)) return -100;
  let score = TIER_SCORE[c.tier] || 40;
  const ctx = `${c.context} ${c.url}`.toLowerCase();
  if (/figure|figcaption|gallery|photo|image|product|device|robot|battery|interior|lab|demo|prototype|diagram|infographic|schematic/i.test(ctx)) {
    score += 8;
  }
  if (/og |twitter:image|jsonld/i.test(c.context)) score -= 5;
  for (const t of titleTokens) {
    if (t.length >= 4 && ctx.includes(t)) score += 4;
  }
  if (/\b(1200|1440|1600|2000|2048)\b/.test(c.url)) score += 3;
  if (/\b(150|200|300)x\b/i.test(c.url)) score -= 15;
  return score;
}

export function selectHeuristicGallery(
  candidates: PhotoCandidate[],
  pickedUrls: Set<string>,
  title: string,
  maxGallery: number,
): { url: string; caption?: string; sourceUrl: string; pageUrl: string }[] {
  if (maxGallery <= 0) return [];
  const titleTokens = extractSubjectTokens(title);
  const subjectTokens = titleTokens;

  const pool = dedupePhotoCandidates(candidates).filter((c) => !pickedUrls.has(c.url));
  const scored = pool
    .map((c) => ({ c, score: subjectMatchScore(c, titleTokens, subjectTokens) }))
    .filter((x) => isExactSubjectMatch(x.c, titleTokens, subjectTokens))
    .sort((a, b) => b.score - a.score);

  const out: { url: string; caption?: string; sourceUrl: string; pageUrl: string }[] = [];
  const usedKeys = new Set<string>();

  for (const { c } of scored) {
    if (out.length >= maxGallery) break;
    const key = normalizeImageUrlForDedup(c.url);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const caption = extractCaptionFromContext(c.context);
    out.push({
      url: c.url,
      caption,
      sourceUrl: c.url,
      pageUrl: c.pageUrl,
    });
  }
  return out;
}

const CAPTION_GARBAGE_RE =
  /https?:\/\/|\/(?:wp-content|images|uploads|gadgets|design_news)\/|\.(?:jpg|jpeg|png|webp|gif)\b|data:image|css-hero|src=['"]|data-ad-|googlesyndication|hugging-?face|microduck|plaud|gadgets\/|figure\s+figure|\bimg\s+src/i;

/** Human-readable caption only — hide debug/provenance/filename slugs. */
export function sanitizeCaption(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#?\w+|nbsp);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length < 8) return undefined;
  if (/^og\b/i.test(text)) return undefined;
  if (CAPTION_GARBAGE_RE.test(text)) return undefined;
  if (/^figure\b/i.test(text)) {
    text = text.replace(/^figure\s+/i, '').trim();
  }
  if (text.length > 140) text = `${text.slice(0, 137).trim()}…`;
  if (CAPTION_GARBAGE_RE.test(text) || text.length < 8) return undefined;
  return text;
}

function extractCaptionFromContext(context: string): string | undefined {
  const trimmed = context.trim();
  if (!trimmed || trimmed.length < 8) return undefined;
  if (/^og /.test(trimmed)) return undefined;
  const figureCap = trimmed.match(/^figure\s+(.+)$/i)?.[1];
  const altMatch = (figureCap || trimmed).match(/^([^.!?]{12,120})/);
  return sanitizeCaption(altMatch?.[1]?.trim());
}

/** Extract figure/img pairs from article body HTML (source page). */
export function mineArticleBodyFigures(
  html: string,
  pageUrl: string,
  push: (raw: string, context: string, tier: PhotoCandidate['tier']) => void,
): void {
  const figureRe = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
  let fig: RegExpExecArray | null;
  while ((fig = figureRe.exec(html)) !== null) {
    const block = fig[1];
    const cap = block.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1];
    const caption = cap ? cap.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const imgMatch = block.match(/<img\s+([^>]+)>/i);
    if (!imgMatch) continue;
    const attrs = imgMatch[1];
    const src =
      attrs.match(/data-src=(?:"([^"]+)"|'([^']+)')/i)?.[1] ||
      attrs.match(/src=(?:"([^"]+)"|'([^']+)')/i)?.[1] ||
      '';
    if (!src) continue;
    const alt = attrs.match(/alt=(?:"([^"]*)"|'([^']*)')/i)?.[1] || '';
    push(src, `figure ${alt} ${caption}`.trim(), 'source_article');
  }
}
