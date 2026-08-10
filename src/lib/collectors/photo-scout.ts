/**
 * SP-A-064 — Photo Intelligence V2 (Photo Correspondent).
 *
 * Pipeline:
 *  1) Extract visual entity (company/brand/model/object)
 *  2) Mine 10–20 candidates from source + official/newsroom/lab/trusted pages
 *     (NO paid search API; NO invented search results)
 *  3) Photo Editor desk (фоторедактор) picks ≤3 real photos or NONE
 *  4) Download locally — hotlink never required
 *
 * WRONG IMAGE / empty logo tile is worse than NO IMAGE. Rumors / ambiguous models → reject.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { passesImageQualityGate } from './image-extractor';
import {
  classifyHostTier,
  hostnameOf,
  lookupOfficialDomains,
  TRUSTED_MEDIA_HOSTS,
} from './official-domains';
import {
  contextConfirmsEntity,
  extractPhotoEntity,
  extractPhotoEntityHeuristic,
  type PhotoEntity,
} from './photo-entity';
import { getOpenRouterClient, parseJsonObject, clampText } from '../ai/shared';

export interface ScoutImage {
  url: string;
  role: 'hero' | 'secondary' | 'detail';
  sourceUrl: string;
  /** SP-A-065F */
  matchLevel?: 'exact' | 'safe_series' | 'safe_brand' | 'category' | 'research' | 'none';
  label?: string;
}

export type CandidateTier =
  | 'official'
  | 'newsroom'
  | 'presskit'
  | 'lab'
  | 'trusted_media'
  | 'source_article';

export interface PhotoCandidate {
  url: string;
  context: string;
  pageUrl: string;
  tier: CandidateTier;
  rejected?: string;
}

export interface PhotoPipelineReport {
  entity: PhotoEntity;
  candidatesFound: number;
  candidatesRejected: { url: string; reason: string }[];
  selected: ScoutImage[];
  notes: string[];
  /** SP-A-065F */
  imageMatchLevel?: ScoutImage['matchLevel'];
  imageLabel?: string;
  researchMode?: boolean;
}

const IGNORE_SRC_RE =
  /avatar|logo|icon|qrcode|1x1|pixel|spinner|badge|sprite|placeholder|emoji|gravatar|wp-includes|favicon|wordmark|brand[-_]?mark|apple-touch|og-default|default[-_]image/i;

/** Empty brand tiles / logos that look like weak illustrations on the homepage. */
export function isWeakIllustrationUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    IGNORE_SRC_RE.test(u) ||
    /\.svg(\?|$)/i.test(u) ||
    /google.*logo|gstatic\.com\/.*logo|lh3\.googleusercontent\.com\/.*[-_]s\d{2,3}([?\-]|$)/i.test(u) ||
    /unsplash\.com/i.test(u)
  );
}

const SCREENSHOT_MARKER_RE =
  /小时前|分钟前|微博正文|跑分|转发|评论|点赞|geekbench|antutu|benchmark score|single-core|multi-core|截图|screenshot|price\s*table|\$\d{2,}\.\d{2}/i;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PHOTO_EDITOR_MODEL =
  process.env.OPENROUTER_PHOTO_EDITOR_MODEL ??
  process.env.OPENROUTER_SCOUT_MODEL ??
  'deepseek/deepseek-v4-flash:latest';

const TIER_RANK: Record<CandidateTier, number> = {
  official: 0,
  newsroom: 1,
  presskit: 2,
  lab: 3,
  trusted_media: 4,
  source_article: 5,
};

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    if (ctype && !/html|xml|text\/plain/i.test(ctype) && !ctype.includes('octet-stream')) {
      // still try — some CDNs mislabel
    }
    return await res.text();
  } catch {
    return null;
  }
}

function resolveUrl(raw: string, baseUrl: string): string | null {
  try {
    const cleaned = raw.trim().replace(/^\/\//, 'https://').replace(/&amp;/gi, '&');
    if (!cleaned || cleaned.startsWith('data:')) return null;
    if (/\{width\}|\{height\}|PHN2Zy|image\/svg|\.svg(\?|$)/i.test(cleaned)) return null;
    const href = new URL(cleaned, baseUrl).href.split('#')[0];
    if (!/^https?:\/\//i.test(href)) return null;
    if (IGNORE_SRC_RE.test(href)) return null;
    if (/\.svg(\?|$)/i.test(href) || /\/svg\//i.test(href)) return null;
    return href;
  } catch {
    return null;
  }
}

function looksLikeRasterPhoto(url: string): boolean {
  if (/\{width\}|\{height\}|\.svg(\?|$)|data:image\/svg|PHN2Zy|\/api\/media\//i.test(url)) return false;
  if (/logo|symbol|typography|swatch|favicon|sprite|icon[_-]|masthead|nav-|navigation|banner/i.test(url)) {
    return false;
  }
  // Prefer known raster; allow CDN URLs without extension.
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return true;
  if (/\/cdn\/|cloudfront|brightspot|wp-content\/uploads|newsupload|dims4|images\./i.test(url)) {
    return !/banner|nav-|navigation|masthead|logo|sprite|icon/i.test(url);
  }
  return !/banner|nav-|navigation|masthead|logo|sprite|icon|placeholder/i.test(url);
}

/** Collect <img>, og/twitter images, and JSON-LD image fields from a page. */
function mineImagesFromHtml(html: string, pageUrl: string, tier: CandidateTier): PhotoCandidate[] {
  const out: PhotoCandidate[] = [];
  const push = (raw: string, context: string) => {
    const url = resolveUrl(raw, pageUrl);
    if (!url) return;
    out.push({ url, context: context.toLowerCase().slice(0, 500), pageUrl, tier });
  };

  // Open Graph / Twitter
  for (const re of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      push(m[1], `og ${stripTags(html.slice(0, 400))}`);
    }
  }

  // JSON-LD image
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(ld[1]);
      const stack = Array.isArray(data) ? data : [data];
      for (const node of stack) {
        const imgs = node?.image;
        const list = Array.isArray(imgs) ? imgs : imgs ? [imgs] : [];
        for (const im of list) {
          const u = typeof im === 'string' ? im : im?.url || im?.contentUrl;
          if (u) push(String(u), `${node?.name || ''} ${node?.brand?.name || ''} jsonld`);
        }
      }
    } catch {
      /* ignore broken ld+json */
    }
  }

  // <img>
  const imgRegex = /<img\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch =
      attrs.match(/data-original=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/data-src=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/data-lazy-src=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/srcset=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/src=(?:"([^"]+)"|'([^']+)')/i);
    if (!srcMatch) continue;
    let rawSrc = (srcMatch[1] || srcMatch[2] || '').trim();
    // srcset → largest candidate
    if (rawSrc.includes(',')) {
      const parts = rawSrc.split(',').map((p) => p.trim().split(/\s+/)[0]);
      rawSrc = parts[parts.length - 1] || rawSrc;
    }
    const altMatch = attrs.match(/alt=(?:"([^"]*)"|'([^']*)')/i);
    const alt = altMatch?.[1] || altMatch?.[2] || '';
    const before = stripTags(html.slice(Math.max(0, match.index - 280), match.index));
    const after = stripTags(
      html.slice(match.index + match[0].length, match.index + match[0].length + 160),
    );
    push(rawSrc, `${alt} ${before} ${after}`);
  }

  return out;
}

/** Outbound same-topic links worth fetching (official / newsroom / trusted). */
function extractFollowLinks(html: string, pageUrl: string, entity: PhotoEntity): string[] {
  const links = new Set<string>();
  const hints = [
    entity.brand,
    entity.company,
    entity.model,
    ...entity.aliases,
    ...entity.matchTokens,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  const official = lookupOfficialDomains(hints);
  for (const e of official) {
    links.add(`https://${e.domain.replace(/^www\./, 'www.')}/`);
  }

  const aRe = /<a\s+[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html)) !== null) {
    const href = resolveUrl(m[1] || m[2] || '', pageUrl);
    if (!href) continue;
    const host = hostnameOf(href);
    if (!host) continue;
    const text = stripTags(m[3] || '').toLowerCase();
    const pathL = href.toLowerCase();
    const tier = classifyHostTier(host);
    const useful =
      tier === 'official' ||
      tier === 'newsroom' ||
      tier === 'lab' ||
      tier === 'presskit' ||
      (tier === 'trusted_media' && hints.some((h) => pathL.includes(h.replace(/\s+/g, '-')) || text.includes(h)));
    const pressy = /press|newsroom|media.?kit|product|about|blog|research/i.test(href + text);
    if (useful || (pressy && hints.some((h) => text.includes(h) || pathL.includes(h.replace(/\s+/g, ''))))) {
      links.add(href.split('?')[0]);
    }
  }

  // Canonical
  const can = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (can?.[1]) {
    const u = resolveUrl(can[1], pageUrl);
    if (u) links.add(u);
  }

  return [...links].slice(0, 8);
}

function tierForPage(pageUrl: string, sourceUrl: string): CandidateTier {
  try {
    if (new URL(pageUrl).hostname === new URL(sourceUrl).hostname) return 'source_article';
  } catch {
    /* ignore */
  }
  const host = hostnameOf(pageUrl);
  const t = classifyHostTier(host);
  if (t === 'other') {
    if (TRUSTED_MEDIA_HOSTS.has(host) || TRUSTED_MEDIA_HOSTS.has(`www.${host}`)) return 'trusted_media';
    return 'source_article';
  }
  return t as CandidateTier;
}

function softEntityContextOk(c: PhotoCandidate, entity: PhotoEntity): boolean {
  if (SCREENSHOT_MARKER_RE.test(c.context) || SCREENSHOT_MARKER_RE.test(c.url)) return false;
  if (/logo|symbol|typography|swatch/i.test(c.url + c.context)) return false;
  if (/screenshot|screen%20shot|screen_shot/i.test(c.url + c.context)) return false;
  const pageHay = `${c.pageUrl} ${c.context} ${c.url}`.toLowerCase();

  // SP-A-065F: research/lab article images from the source page itself.
  if (entity.objectType === 'research_prototype' && c.tier === 'source_article') {
    return looksLikeRasterPhoto(c.url) && !IGNORE_SRC_RE.test(c.url);
  }

  // When a specific model/product line is known, require it on official pages too
  // (otherwise manufacturer homepage banners falsely "match" the brand alone).
  if (entity.model) {
    const model = entity.model.toLowerCase();
    if (model.length >= 2 && !new RegExp(`\\b${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(pageHay)) {
      // Also accept distinctive object tokens (e.g. bassinet) with brand
      const objectTok = (entity.objectType || entity.object || '').toLowerCase();
      const brand = (entity.brand || entity.company || '').toLowerCase();
      const hasBrand = brand && pageHay.includes(brand.split(/\s+/)[0]);
      const hasObject =
        objectTok &&
        objectTok.split(/[\s/]+/).some((t) => t.length >= 5 && pageHay.includes(t));
      if (!(hasBrand && hasObject)) return false;
    }
  }

  if (c.tier === 'official' || c.tier === 'newsroom' || c.tier === 'lab' || c.tier === 'presskit') {
    const tokens = entity.matchTokens.map((t) => t.toLowerCase());
    if (tokens.some((t) => t.length >= 3 && pageHay.includes(t.toLowerCase()))) return true;
    if (entity.brand && pageHay.includes(entity.brand.toLowerCase())) {
      // Brand alone on official homepage is not enough when model exists.
      return !entity.model;
    }
  }
  return contextConfirmsEntity(`${c.context} ${c.pageUrl}`, entity);
}

/**
 * Mine up to ~20 quality-gated candidates across source + primary pages.
 */
export async function minePhotoCandidates(opts: {
  sourceUrl: string;
  title: string;
  text: string;
  entity: PhotoEntity;
  fallbackUrl?: string;
  html?: string;
  /** SP-A-065F — cap outbound page follows (research budget). */
  maxFollowPages?: number;
}): Promise<{ candidates: PhotoCandidate[]; rejected: { url: string; reason: string }[]; notes: string[] }> {
  const rejected: { url: string; reason: string }[] = [];
  const notes: string[] = [];
  const sourceHtml = opts.html || (await fetchHtml(opts.sourceUrl));
  if (!sourceHtml) {
    notes.push('source HTML unavailable');
    return { candidates: [], rejected, notes };
  }

  const pages: { url: string; html: string; tier: CandidateTier }[] = [
    { url: opts.sourceUrl, html: sourceHtml, tier: 'source_article' },
  ];

  const follow = extractFollowLinks(sourceHtml, opts.sourceUrl, opts.entity);
  const maxPages = Math.max(1, Math.min(opts.maxFollowPages ?? 5, 6));
  notes.push(`follow links: ${follow.length} (maxPages=${maxPages})`);
  for (const url of follow) {
    if (pages.length >= maxPages) break;
    if (pages.some((p) => p.url === url)) continue;
    // eslint-disable-next-line no-await-in-loop
    const html = await fetchHtml(url, 7000);
    if (!html) {
      notes.push(`skip unreachable ${url}`);
      continue;
    }
    pages.push({ url, html, tier: tierForPage(url, opts.sourceUrl) });
  }

  const raw: PhotoCandidate[] = [];
  if (opts.fallbackUrl) {
    raw.push({
      url: opts.fallbackUrl,
      context: `${opts.title} ${(opts.entity.matchTokens || []).join(' ')}`,
      pageUrl: opts.sourceUrl,
      tier: 'source_article',
    });
  }
  for (const p of pages) {
    raw.push(...mineImagesFromHtml(p.html, p.url, p.tier));
  }

  // Dedup + soft entity filter + quality gate
  const seen = new Set<string>();
  const kept: PhotoCandidate[] = [];
  raw.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  for (const c of raw) {
    const key = c.url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    if (!looksLikeRasterPhoto(c.url)) {
      rejected.push({ url: c.url, reason: 'non-raster / banner / svg template' });
      continue;
    }
    if (!softEntityContextOk(c, opts.entity)) {
      rejected.push({ url: c.url, reason: 'entity mismatch / screenshot markers' });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const ok = await passesImageQualityGate(c.url);
    if (!ok) {
      rejected.push({ url: c.url, reason: 'quality gate (size/aspect/host)' });
      continue;
    }
    kept.push(c);
    if (kept.length >= 20) break;
  }

  notes.push(`raw=${raw.length} kept=${kept.length} rejected=${rejected.length} pages=${pages.length}`);
  return { candidates: kept, rejected, notes };
}

interface EditorPick {
  hero?: string | null;
  secondary?: string | null;
  detail?: string | null;
  rejected?: { url: string; reason: string }[];
  reason?: string;
}

/**
 * AI Photo Editor desk (фоторедактор редакции) — picks ≤3 real product/scene photos.
 * Empty logo tiles / brand marks are rejected. WRONG IMAGE is worse than NO IMAGE.
 */
export async function editPhotoSelection(opts: {
  entity: PhotoEntity;
  title: string;
  candidates: PhotoCandidate[];
}): Promise<{ picks: { url: string; role: ScoutImage['role'] }[]; rejected: { url: string; reason: string }[]; reason: string }> {
  const usable = opts.candidates.filter((c) => !isWeakIllustrationUrl(c.url) && looksLikeRasterPhoto(c.url));
  if (!usable.length) {
    return {
      picks: [],
      rejected: opts.candidates.map((c) => ({
        url: c.url,
        reason: isWeakIllustrationUrl(c.url) ? 'weak logo/icon illustration' : 'no usable raster',
      })),
      reason: 'photo desk: no usable product photos in candidates',
    };
  }
  if (opts.entity.status === 'rumor' && !opts.entity.model) {
    return {
      picks: [],
      rejected: usable.map((c) => ({ url: c.url, reason: 'rumor without confirmed model' })),
      reason: 'rumor strict NO IMAGE',
    };
  }

  const catalog = usable.slice(0, 20).map((c, i) => ({
    id: i + 1,
    url: c.url,
    tier: c.tier,
    context: c.context.slice(0, 180),
    pageUrl: c.pageUrl,
  }));

  try {
    const client = getOpenRouterClient();
    const completion = await client.chat.completions.create({
      model: PHOTO_EDITOR_MODEL,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: [
            'You are the SmartProto Photo Editor desk (фоторедактор редакции).',
            'Give the homepage a REAL photo of the product, robot, device, or lab demo — never a logo tile.',
            'WRONG IMAGE or empty brand illustration is worse than NO IMAGE.',
            'Pick at most 3 photos. Prefer: clear full product/device shot, second angle, meaningful detail.',
            'HARD REJECT: logos, icons, wordmarks, Google/G letter tiles, SVG, UI screenshots, social banners, price tables, watermarks, wrong model, near-duplicates, abstract brand art with no device.',
            'If only logo/brand tiles remain → return all null (NO IMAGE).',
            'Return ONLY compact JSON: {"hero":url|null,"secondary":url|null,"detail":url|null,"rejected":[{"url":"...","reason":"..."}],"reason":"..."}',
            'URLs MUST be copied exactly from candidates. Do not invent URLs. Keep rejected ≤6.',
          ].join(' '),
        },
        {
          role: 'user',
          content: clampText(
            JSON.stringify({
              desk: 'Photo Editor',
              articleTitle: opts.title,
              entity: {
                company: opts.entity.company,
                brand: opts.entity.brand,
                model: opts.entity.model,
                object: opts.entity.object,
                objectType: opts.entity.objectType,
                status: opts.entity.status,
                matchTokens: opts.entity.matchTokens,
              },
              candidates: catalog.map((c) => ({
                id: c.id,
                url: c.url,
                tier: c.tier,
                context: c.context.slice(0, 100),
              })),
            }),
            7000,
          ),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || '';
    const parsed = parseJsonObject<EditorPick>(raw);
    const allowed = new Set(usable.map((c) => c.url));
    const roles: ScoutImage['role'][] = ['hero', 'secondary', 'detail'];
    const picks: { url: string; role: ScoutImage['role'] }[] = [];
    for (const role of roles) {
      const u = parsed[role];
      if (
        typeof u === 'string' &&
        allowed.has(u) &&
        looksLikeRasterPhoto(u) &&
        !isWeakIllustrationUrl(u) &&
        !picks.some((p) => p.url === u)
      ) {
        picks.push({ url: u, role });
      }
    }
    const rejected = Array.isArray(parsed.rejected)
      ? parsed.rejected
          .map((r) => ({ url: String(r.url || ''), reason: String(r.reason || 'rejected') }))
          .filter((r) => r.url)
          .slice(0, 10)
      : [];
    if (!picks.length) {
      return {
        picks: [],
        rejected:
          rejected.length > 0
            ? rejected
            : usable.map((c) => ({ url: c.url, reason: parsed.reason || 'photo desk: no safe pick' })),
        reason: parsed.reason || 'photo desk returned no safe images',
      };
    }
    return { picks, rejected, reason: parsed.reason || 'photo desk' };
  } catch (err) {
    console.log(
      `[photo-editor] AI failed, conservative heuristic: ${err instanceof Error ? err.message : String(err)}`,
    );
    const safe = usable.filter(
      (c) =>
        (c.tier === 'official' ||
          c.tier === 'newsroom' ||
          c.tier === 'trusted_media' ||
          c.tier === 'source_article' ||
          c.tier === 'lab' ||
          c.tier === 'presskit') &&
        !isWeakIllustrationUrl(c.url),
    );
    const picks = safe.slice(0, 2).map((c, i) => ({
      url: c.url,
      role: (['hero', 'secondary'] as ScoutImage['role'][])[i],
    }));
    return {
      picks,
      rejected: [],
      reason: picks.length ? 'photo desk heuristic fallback' : 'photo desk AI+heuristic empty',
    };
  }
}

/** Cap oversized downloads (keep format; no WebP — Docker stability). */
function maybeDownscaleNote(buf: Buffer): { buf: Buffer; ext: string } {
  // Without sharp/native codecs we keep original bytes; only enforce size cap.
  return { buf, ext: '' };
}

export async function downloadImagesLocally(
  slug: string,
  candidates: { url: string; role: ScoutImage['role'] }[],
  mediaRoot = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media'),
): Promise<ScoutImage[]> {
  const dir = path.join(mediaRoot, slug);
  const out: ScoutImage[] = [];
  for (const c of candidates) {
    try {
      const res = await fetch(c.url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': UA },
      });
      if (!res.ok) continue;
      let buf = Buffer.from(await res.arrayBuffer());
      // Soft size budget: skip tiny/huge; prefer ≤ 2.5MB for web.
      if (buf.length < 2500) continue;
      if (buf.length > 8 * 1024 * 1024) continue;
      // Reject SVG / HTML mistaken as images
      const head = buf.slice(0, 256).toString('utf8');
      if (/^\s*<svg|^\s*<!DOCTYPE|^\s*<html|^\s*<\?xml/i.test(head)) continue;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
      const isGif = buf.slice(0, 3).toString() === 'GIF';
      if (!isJpeg && !isPng && !isWebp && !isGif) continue;
      if (buf.length > 2.5 * 1024 * 1024) {
        maybeDownscaleNote(buf);
      }
      let ext = isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg';
      // eslint-disable-next-line no-await-in-loop
      await mkdir(dir, { recursive: true });
      const filename = `${c.role}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      await writeFile(path.join(dir, filename), buf);
      out.push({ url: `/api/media/${slug}/${filename}`, role: c.role, sourceUrl: c.url });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * SP-A-065F — narrow research/lab/robotics visual subject when SKU entity is empty.
 */
export function looksResearchPhotoStory(title: string, text: string, sourceUrl = ''): boolean {
  const hay = `${title}\n${text}\n${sourceUrl}`;
  return /\b(research|lab|prototype|robotics?|manipulat|optical|demonstration|experimental|csail|ieee|university|scientists?)\b|исследован|робот|прототип|лаборатор/i.test(
    hay,
  );
}

export function inferResearchPhotoEntity(title: string, text: string, sourceUrl = ''): PhotoEntity | null {
  if (!looksResearchPhotoStory(title, text, sourceUrl)) return null;
  const hay = `${title}\n${text}`;
  const named =
    title.match(/\b(TactaBot|Tacta|Astro|Gemini Robotics|WeatherNext|Astra)\b/i) ||
    hay.match(/\b([A-Z][A-Za-z0-9+]{2,24}(?:Bot|Hand|Glove|Robot)?)\b/);
  const lab =
    hay.match(/\b(MIT CSAIL|CSAIL|IEEE|OpenAI|DeepMind|ETH Zurich|Wyss|Stanford|Berkeley)\b/i)?.[1] ||
    null;
  const brand = named?.[1] || lab || 'research';
  const object = /optical/i.test(hay)
    ? 'optical research system'
    : /manipulat|foam|deformable|liquid/i.test(hay)
      ? 'robot manipulation lab demo'
      : /robot|hand|glove|tactile/i.test(hay)
        ? 'robotics prototype demo'
        : 'research system / lab prototype';
  const tokens = [
    brand,
    named?.[1],
    lab,
    ...(/tacta/i.test(hay) ? ['Tacta', 'TactaBot', 'tactahand', 'tactaglove', 'tactile'] : []),
    ...(/optical/i.test(hay) ? ['optical', 'receiver', 'robotics'] : []),
    ...(/manipulat|csail/i.test(hay) ? ['CSAIL', 'manipulation', 'robot'] : []),
  ]
    .filter(Boolean)
    .map(String);
  return {
    company: lab || brand,
    brand,
    model: named?.[1] || null,
    object,
    objectType: 'research_prototype',
    aliases: [...new Set(tokens)],
    lab,
    status: 'prototype',
    matchTokens: [...new Set(tokens.filter((t) => t.length >= 2))],
  };
}

/** Prefer candidates whose URL/context clearly matches research entity tokens (e.g. tactahand). */
function researchTokenMatchedPicks(
  entity: PhotoEntity,
  candidates: PhotoCandidate[],
): { url: string; role: ScoutImage['role'] }[] {
  const tokens = entity.matchTokens
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4 && !/research|system|prototype|robotics|demo|manipulat/.test(t));
  const soft = entity.matchTokens.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
  const scored = candidates
    .filter(
      (c) =>
        looksLikeRasterPhoto(c.url) &&
        !IGNORE_SRC_RE.test(c.url) &&
        !/banner|728x90|ad[-_]/i.test(c.url) &&
        !/screenshot|screen%20shot|screen_shot|ui.?capture|comments?/i.test(c.url + c.context),
    )
    .map((c) => {
      const hay = `${c.url} ${c.context}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t.toLowerCase())) score += 3;
      for (const t of soft) if (hay.includes(t)) score += 1;
      if (/og /.test(c.context) || c.context.startsWith('og')) score += 2;
      if (c.tier === 'lab' || c.tier === 'source_article' || c.tier === 'trusted_media') score += 1;
      return { c, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x, i) => ({
    url: x.c.url,
    role: (['hero', 'secondary'] as ScoutImage['role'][])[i],
  }));
}

/**
 * Full V2 entry — used by newsroom tick and backfill.
 * SP-A-065F: research/lab fallback when SKU entity is missing; token-matched picks
 * if AI editor zeros real product/demo frames (e.g. tactahand).
 */
export async function resolveArticlePhotos(opts: {
  slug: string;
  title: string;
  text: string;
  sourceUrl: string;
  fallbackUrl?: string;
  html?: string;
  /** Cap follow-up page fetches for research mode (default 2). */
  maxResearchPages?: number;
}): Promise<PhotoPipelineReport> {
  let entity = await extractPhotoEntity({
    title: opts.title,
    text: opts.text,
    sourceUrl: opts.sourceUrl,
  });
  let researchMode = false;
  const notes: string[] = [];

  if (!entity.brand && !entity.company && entity.matchTokens.length === 0) {
    const research = inferResearchPhotoEntity(opts.title, opts.text, opts.sourceUrl);
    if (research) {
      entity = research;
      researchMode = true;
      notes.push('research photo entity fallback');
    } else {
      return {
        entity,
        candidatesFound: 0,
        candidatesRejected: [],
        selected: [],
        notes: ['no extractable visual entity — NO IMAGE'],
        imageMatchLevel: 'none',
      };
    }
  } else if (
    entity.objectType === 'research_prototype' ||
    entity.status === 'prototype' ||
    looksResearchPhotoStory(opts.title, opts.text, opts.sourceUrl)
  ) {
    researchMode = true;
    // Enrich tokens for named robotics products (TactaBot → tactahand filenames)
    if (/tacta/i.test(`${entity.brand} ${entity.model} ${opts.title}`)) {
      entity = {
        ...entity,
        matchTokens: [
          ...new Set([
            ...entity.matchTokens,
            'Tacta',
            'TactaBot',
            'tactahand',
            'tactaglove',
            'tactile',
          ]),
        ],
        status: entity.status === 'unknown' ? 'prototype' : entity.status,
      };
      researchMode = true;
      notes.push('tacta robotics token enrich');
    }
  }

  if (entity.status === 'rumor' && !entity.model) {
    return {
      entity,
      candidatesFound: 0,
      candidatesRejected: [],
      selected: [],
      notes: ['rumor without confirmed model — NO IMAGE'],
      imageMatchLevel: 'none',
    };
  }

  const mined = await minePhotoCandidates({
    sourceUrl: opts.sourceUrl,
    title: opts.title,
    text: opts.text,
    entity,
    fallbackUrl: opts.fallbackUrl,
    html: opts.html,
    maxFollowPages: researchMode ? opts.maxResearchPages ?? 2 : 5,
  });
  notes.push(...mined.notes);

  // Soft cap note for research budget.
  if (researchMode) {
    notes.push(`research budget: maxPages≈${opts.maxResearchPages ?? 2}`);
  }

  let edited = await editPhotoSelection({
    entity,
    title: opts.title,
    candidates: mined.candidates,
  });
  notes.push(edited.reason);

  // SP-A-065F: if AI editor rejected everything but URL tokens clearly match (tactahand…), recover.
  if (!edited.picks.length && mined.candidates.length) {
    const recovered = researchTokenMatchedPicks(entity, mined.candidates);
    if (recovered.length) {
      edited = {
        picks: recovered,
        rejected: edited.rejected,
        reason: 'research token-match fallback after AI empty',
      };
      notes.push(edited.reason);
      researchMode = true;
    } else if (researchMode) {
      // Trusted source og:image as category/research illustration (topic-relevant, not screenshot).
      const og = mined.candidates.find((c) => {
        const isOg = /^og |\bog /.test(c.context) || c.context.includes('og ');
        if (!isOg) return false;
        if (!looksLikeRasterPhoto(c.url) || IGNORE_SRC_RE.test(c.url)) return false;
        if (/screenshot|screen%20shot|screen_shot|ui.?capture/i.test(c.url + c.context)) return false;
        // Same-host source article og:image is OK for research stories.
        try {
          return new URL(c.pageUrl).hostname === new URL(opts.sourceUrl).hostname;
        } catch {
          return softEntityContextOk(c, entity);
        }
      });
      if (og) {
        edited = {
          picks: [{ url: og.url, role: 'hero' }],
          rejected: edited.rejected,
          reason: 'research og:image fallback',
        };
        notes.push(edited.reason);
      }
    }
  }

  // Drop screenshot / UI leftovers and weak logo tiles even if an editor picked them.
  edited = {
    ...edited,
    picks: edited.picks.filter(
      (p) =>
        !/screenshot|screen%20shot|screen_shot|ui.?capture|comments?/i.test(p.url) &&
        !isWeakIllustrationUrl(p.url),
    ),
  };
  if (!edited.picks.length && mined.candidates.length) {
    notes.push('photo desk post-filter removed weak logo/UI picks');
  }

  const selected = edited.picks.length
    ? await downloadImagesLocally(opts.slug, edited.picks)
    : [];
  notes.push(`downloaded=${selected.length}`);

  let imageMatchLevel: ScoutImage['matchLevel'] = selected.length
    ? researchMode
      ? 'research'
      : 'exact'
    : 'none';
  let imageLabel: string | undefined;
  if (selected.length && researchMode) {
    imageMatchLevel = entity.model || /tacta|bot/i.test(entity.brand || '') ? 'category' : 'research';
    imageLabel =
      imageMatchLevel === 'research'
        ? 'Иллюстрация исследования'
        : 'Фото прототипа / демонстрации';
    for (const s of selected) {
      s.matchLevel = imageMatchLevel;
      s.label = imageLabel;
    }
  }

  return {
    entity,
    candidatesFound: mined.candidates.length,
    candidatesRejected: [...mined.rejected, ...edited.rejected].slice(0, 40),
    selected,
    notes,
    imageMatchLevel,
    imageLabel,
    researchMode,
  };
}

/**
 * V1-compatible wrapper kept for any residual callers — delegates to V2 miner
 * on a single HTML blob without AI editor (fast path). Prefer resolveArticlePhotos.
 */
export async function scoutImages(opts: {
  html: string;
  pageUrl: string;
  title: string;
  text: string;
  fallbackUrl?: string;
}): Promise<{ url: string; role: ScoutImage['role'] }[]> {
  const entity = extractPhotoEntityHeuristic(opts.title, opts.text);
  const mined = await minePhotoCandidates({
    sourceUrl: opts.pageUrl,
    title: opts.title,
    text: opts.text,
    entity,
    fallbackUrl: opts.fallbackUrl,
    html: opts.html,
  });
  return mined.candidates.slice(0, 3).map((c, i) => ({
    url: c.url,
    role: (['hero', 'secondary', 'detail'] as ScoutImage['role'][])[i],
  }));
}
