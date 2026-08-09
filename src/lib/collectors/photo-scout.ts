/**
 * SP-A-064 — Photo Intelligence V2 (Photo Correspondent).
 *
 * Pipeline:
 *  1) Extract visual entity (company/brand/model/object)
 *  2) Mine 10–20 candidates from source + official/newsroom/lab/trusted pages
 *     (NO paid search API; NO invented search results)
 *  3) AI Photo Editor picks ≤3 (hero/secondary/detail) or NONE
 *  4) Download locally — hotlink never required
 *
 * WRONG IMAGE is worse than NO IMAGE. Rumors / ambiguous models → reject.
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
import {
  extractIthomeImageCandidates,
  isIthomePageUrl,
} from './ithome-image-adapter';
import {
  categoryIllustrationUrl,
  labelForMatchLevel,
  resolveCategoryKey,
  type ImageMatchLevel,
} from './image-match';
import { getOpenRouterClient, parseJsonObject, clampText } from '../ai/shared';

export interface ScoutImage {
  url: string;
  role: 'hero' | 'secondary' | 'detail';
  sourceUrl: string;
  matchLevel?: ImageMatchLevel;
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
}

const IGNORE_SRC_RE =
  /avatar|logo|icon|qrcode|1x1|pixel|spinner|badge|sprite|placeholder|emoji|gravatar|wp-includes|favicon/i;

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
    // srcset → largest candidate (comma-separated list only)
    if (rawSrc.includes(',') && /srcset=/i.test(attrs) && !/data-original=/i.test(attrs)) {
      const parts = rawSrc.split(',').map((p) => p.trim().split(/\s+/)[0]);
      rawSrc = parts[parts.length - 1] || rawSrc;
    } else if (/\s+\d+[wx]$/i.test(rawSrc) || /\s+\d+(\.\d+)?x$/i.test(rawSrc)) {
      rawSrc = rawSrc.trim().split(/\s+/)[0];
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
  const pageHay = `${c.pageUrl} ${c.context} ${c.url}`.toLowerCase();

  // Same-article China tech CDN uploads (ITHome / JD): the page is already about this
  // entity, but lazy-load alts often lack brand text — allow raster product uploads.
  // Still block unconfirmed rumors (no model) and obvious wrong-SKU tokens in URL.
  if (
    c.tier === 'source_article' &&
    /newsuploadfiles|360buyimg\.com/i.test(c.url) &&
    looksLikeRasterPhoto(c.url)
  ) {
    if (entity.status === 'rumor' && !entity.model) return false;
    if (entity.model) {
      const modelCompact = entity.model.toLowerCase().replace(/\s+/g, '');
      // If URL itself names a different clear SKU (e.g. 15T vs T), reject.
      const conflicting = /iqoo\s*15t|iqoo\s*13|redmi\s*k\d{2}/i.test(c.url + c.context);
      if (conflicting && !pageHay.includes(modelCompact) && !c.context.includes(entity.model.toLowerCase())) {
        return false;
      }
    }
    return true;
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
  notes.push(`follow links: ${follow.length}`);
  for (const url of follow) {
    if (pages.length >= 6) break;
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
    if (isIthomePageUrl(p.url)) {
      // ITHome-specific URL harvest — no product decisions here.
      const adapted = extractIthomeImageCandidates(p.html, p.url);
      notes.push(`ithome-adapter ${p.url}: ${adapted.length} normalized`);
      for (const a of adapted) {
        raw.push({
          url: a.url,
          context: a.context || opts.title,
          pageUrl: p.url,
          tier: p.tier,
        });
      }
    } else {
      raw.push(...mineImagesFromHtml(p.html, p.url, p.tier));
    }
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
 * AI Photo Editor — selects ≤3 URLs from mined candidates. May return none.
 */
export async function editPhotoSelection(opts: {
  entity: PhotoEntity;
  title: string;
  candidates: PhotoCandidate[];
}): Promise<{ picks: { url: string; role: ScoutImage['role'] }[]; rejected: { url: string; reason: string }[]; reason: string }> {
  if (!opts.candidates.length) {
    return { picks: [], rejected: [], reason: 'no candidates' };
  }
  if (opts.entity.status === 'rumor' && !opts.entity.model) {
    return {
      picks: [],
      rejected: opts.candidates.map((c) => ({ url: c.url, reason: 'rumor without confirmed model' })),
      reason: 'rumor strict NO IMAGE',
    };
  }

  const catalog = opts.candidates.slice(0, 20).map((c, i) => ({
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
            'You are the SmartProto Photo Editor. Pick at most 3 product photos.',
            'WRONG IMAGE is worse than NO IMAGE. If unsure the photo shows THIS exact product, reject all (hero/secondary/detail = null).',
            'Return ONLY compact JSON: {"hero":url|null,"secondary":url|null,"detail":url|null,"rejected":[{"url":"...","reason":"..."}],"reason":"..."}',
            'hero = best clear full view; secondary = other angle/use; detail = meaningful close-up only.',
            'Reject: UI/social screenshots, SVG, banners, price tables, overlays, watermarks, wrong generation/model, near-duplicates.',
            'Prefer official/newsroom/lab tiers. URLs MUST be copied exactly from candidates. Do not invent URLs.',
            'Keep rejected list short (max 6 items) to avoid truncation.',
          ].join(' '),
        },
        {
          role: 'user',
          content: clampText(
            JSON.stringify({
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
    const allowed = new Set(opts.candidates.map((c) => c.url));
    const roles: ScoutImage['role'][] = ['hero', 'secondary', 'detail'];
    const picks: { url: string; role: ScoutImage['role'] }[] = [];
    for (const role of roles) {
      const u = parsed[role];
      if (typeof u === 'string' && allowed.has(u) && looksLikeRasterPhoto(u) && !picks.some((p) => p.url === u)) {
        picks.push({ url: u, role });
      }
    }
    const rejected = Array.isArray(parsed.rejected)
      ? parsed.rejected
          .map((r) => ({ url: String(r.url || ''), reason: String(r.reason || 'rejected') }))
          .filter((r) => r.url)
          .slice(0, 10)
      : [];
    // Explicit AI NO IMAGE (all null) must win — do not heuristic-fill.
    if (!picks.length) {
      return {
        picks: [],
        rejected:
          rejected.length > 0
            ? rejected
            : opts.candidates.map((c) => ({ url: c.url, reason: parsed.reason || 'ai editor: no safe pick' })),
        reason: parsed.reason || 'ai editor returned no safe images',
      };
    }
    return { picks, rejected, reason: parsed.reason || 'ai editor' };
  } catch (err) {
    console.log(
      `[photo-editor] AI failed, conservative heuristic: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Conservative: only top-tier raster URLs that look like product shots, max 2.
    const safe = opts.candidates.filter(
      (c) =>
        looksLikeRasterPhoto(c.url) &&
        (c.tier === 'official' ||
          c.tier === 'newsroom' ||
          c.tier === 'trusted_media' ||
          c.tier === 'source_article') &&
        /product|upload|wp-content|brightspot|neuromotor|wristband|keyboard|bassinet|irrigation|rainpoint|altar|aero/i.test(
          c.url + c.context,
        ),
    );
    const picks = (safe.length ? safe : opts.candidates.filter((c) => looksLikeRasterPhoto(c.url)))
      .slice(0, 2)
      .map((c, i) => ({
        url: c.url,
        role: (['hero', 'secondary'] as ScoutImage['role'][])[i],
      }));
    return { picks, rejected: [], reason: 'conservative heuristic after AI error' };
  }
}

/** Cap oversized downloads (keep format; no WebP — Docker stability). */
function maybeDownscaleNote(buf: Buffer): { buf: Buffer; ext: string } {
  // Without sharp/native codecs we keep original bytes; only enforce size cap.
  return { buf, ext: '' };
}

export async function downloadImagesLocally(
  slug: string,
  candidates: { url: string; role: ScoutImage['role']; matchLevel?: ImageMatchLevel; label?: string }[],
  mediaRoot = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media'),
): Promise<ScoutImage[]> {
  const dir = path.join(mediaRoot, slug);
  const out: ScoutImage[] = [];
  for (const c of candidates) {
    try {
      // Local category illustrations — copy/reference without remote fetch.
      if (c.url.startsWith('/api/media/_category/')) {
        const file = c.url.replace(/^\/api\/media\//, '');
        const srcPath = path.join(mediaRoot, file);
        const ext = path.extname(srcPath) || '.svg';
        await mkdir(dir, { recursive: true });
        const filename = `${c.role}${ext}`;
        const { copyFile, access } = await import('node:fs/promises');
        await access(srcPath);
        await copyFile(srcPath, path.join(dir, filename));
        out.push({
          url: `/api/media/${slug}/${filename}`,
          role: c.role,
          sourceUrl: c.url,
          matchLevel: c.matchLevel || 'category',
          label: c.label || labelForMatchLevel('category') || undefined,
        });
        continue;
      }

      const res = await fetch(c.url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': UA },
      });
      if (!res.ok) continue;
      let buf = Buffer.from(await res.arrayBuffer());
      // Soft size budget: skip tiny/huge; prefer ≤ 2.5MB for web.
      if (buf.length < 2500) continue;
      if (buf.length > 8 * 1024 * 1024) continue;
      // Reject SVG / HTML mistaken as remote product images (category SVGs handled above)
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
      const level = c.matchLevel || 'exact';
      out.push({
        url: `/api/media/${slug}/${filename}`,
        role: c.role,
        sourceUrl: c.url,
        matchLevel: level,
        label: c.label || labelForMatchLevel(level) || undefined,
      });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Full V2 entry — used by newsroom tick and backfill.
 * Policy: exact → series/brand (honest label) → category illustration → none.
 * Never labels a non-exact photo as exact.
 */
export async function resolveArticlePhotos(opts: {
  slug: string;
  title: string;
  text: string;
  sourceUrl: string;
  fallbackUrl?: string;
  html?: string;
  category?: string;
}): Promise<PhotoPipelineReport> {
  const entity = await extractPhotoEntity({
    title: opts.title,
    text: opts.text,
    sourceUrl: opts.sourceUrl,
  });

  const notes: string[] = [];
  const canAttemptExact = Boolean(entity.brand || entity.company || entity.matchTokens.length);
  // Rumors without a confirmed model: skip EXACT, allow brand/category only.
  const allowExact = canAttemptExact && !(entity.status === 'rumor' && !entity.model);

  let selected: ScoutImage[] = [];
  let candidatesFound = 0;
  let candidatesRejected: { url: string; reason: string }[] = [];

  if (allowExact) {
    const mined = await minePhotoCandidates({
      sourceUrl: opts.sourceUrl,
      title: opts.title,
      text: opts.text,
      entity,
      fallbackUrl: opts.fallbackUrl,
      html: opts.html,
    });
    candidatesFound = mined.candidates.length;
    candidatesRejected = mined.rejected;
    notes.push(...mined.notes);

    const edited = await editPhotoSelection({
      entity,
      title: opts.title,
      candidates: mined.candidates,
    });
    notes.push(edited.reason);
    candidatesRejected = [...candidatesRejected, ...edited.rejected].slice(0, 40);

    if (edited.picks.length) {
      const downloaded = await downloadImagesLocally(
        opts.slug,
        edited.picks.map((p) => ({ ...p, matchLevel: 'exact' as const, label: undefined })),
      );
      selected = downloaded.map((s) => ({ ...s, matchLevel: 'exact', label: undefined }));
      notes.push(`exact downloaded=${selected.length}`);
    }
  } else {
    notes.push(
      entity.status === 'rumor' && !entity.model
        ? 'rumor without confirmed model — skip EXACT'
        : 'weak entity — skip EXACT',
    );
  }

  // Brand / series fallback — same page & official sources, NEVER labeled exact.
  if (!selected.length && (entity.brand || entity.company)) {
    const looksRoundup = /анонс|обзор новинок|this week|round.?up|лучшие|подборк/i.test(
      `${opts.title}\n${opts.text.slice(0, 400)}`,
    );
    if (looksRoundup) {
      notes.push('roundup/multi-topic — skip brand/series, prefer category');
    } else {
    const brandEntity = {
      ...entity,
      status: 'product' as const,
      // Loosen model requirement for brand-level harvest only
      model: entity.status === 'rumor' ? null : entity.model,
    };
    const mined = await minePhotoCandidates({
      sourceUrl: opts.sourceUrl,
      title: opts.title,
      text: opts.text,
      entity: brandEntity,
      fallbackUrl: opts.fallbackUrl,
      html: opts.html,
    });
    candidatesFound = Math.max(candidatesFound, mined.candidates.length);
    notes.push(`brand-fallback candidates=${mined.candidates.length}`);

    // Prefer official/newsroom; require brand token in URL/context; forbid claiming exact model.
    const brand = (entity.brand || entity.company || '').toLowerCase();
    const seriesHints = entity.aliases
      .concat(entity.matchTokens)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3 && t !== brand && !/^(pro|max|plus|ai|5g|4g)$/i.test(t));

    const brandSafe = mined.candidates.filter((c) => {
      if (!looksLikeRasterPhoto(c.url)) return false;
      // Homepage marketing tiles are not safe brand product illustrations.
      if (/\/v\/home\/|promo_|banner|masthead|hero_back|at_work|trade.in/i.test(c.url)) return false;
      if (!['official', 'newsroom', 'presskit', 'lab', 'source_article', 'trusted_media'].includes(c.tier)) {
        return false;
      }
      const hay = `${c.url} ${c.context} ${c.pageUrl}`.toLowerCase();
      if (!brand || !hay.includes(brand.split(/\s+/)[0])) return false;
      // Reject clear other-model conflict markers when we have a known model
      if (entity.model && /15t|14t|13t|k90|k80/i.test(hay) && !hay.includes(entity.model.toLowerCase())) {
        return false;
      }
      return true;
    });

    let level: ImageMatchLevel = 'brand';
    if (
      seriesHints.some((h) =>
        brandSafe.some((c) => `${c.url} ${c.context}`.toLowerCase().includes(h)),
      )
    ) {
      level = 'series';
    }
    const label = labelForMatchLevel(level) || undefined;
    const picks = brandSafe.slice(0, 2).map((c, i) => ({
      url: c.url,
      role: (['hero', 'secondary'] as ScoutImage['role'][])[i],
      matchLevel: level,
      label,
    }));
    if (picks.length) {
      selected = await downloadImagesLocally(opts.slug, picks);
      notes.push(`${level} downloaded=${selected.length}`);
    }
    }
  }

  // Category thematic illustration — honest abstract art, never a fake product.
  if (!selected.length) {
    const key = resolveCategoryKey({
      category: opts.category,
      objectType: entity.objectType,
      object: entity.object,
      title: opts.title,
    });
    const catUrl = categoryIllustrationUrl(key);
    const label = labelForMatchLevel('category') || undefined;
    selected = await downloadImagesLocally(opts.slug, [
      { url: catUrl, role: 'hero', matchLevel: 'category', label },
    ]);
    notes.push(selected.length ? `category=${key}` : `category missing asset=${key}`);
  }

  return {
    entity,
    candidatesFound,
    candidatesRejected: candidatesRejected.slice(0, 40),
    selected,
    notes: [...notes, `finalLevel=${selected[0]?.matchLevel || 'none'}`],
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
