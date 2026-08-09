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
import { getOpenRouterClient, parseJsonObject, clampText } from '../ai/shared';

export interface ScoutImage {
  url: string;
  role: 'hero' | 'secondary' | 'detail';
  sourceUrl: string;
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
    const href = new URL(cleaned, baseUrl).href.split('#')[0];
    if (!/^https?:\/\//i.test(href)) return null;
    if (IGNORE_SRC_RE.test(href)) return null;
    return href;
  } catch {
    return null;
  }
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
  // Official / newsroom pages: allow if page itself is brand-aligned even when alt is empty.
  if (c.tier === 'official' || c.tier === 'newsroom' || c.tier === 'lab' || c.tier === 'presskit') {
    const pageHay = `${c.pageUrl} ${c.context}`.toLowerCase();
    const tokens = entity.matchTokens.map((t) => t.toLowerCase());
    if (tokens.some((t) => t.length >= 3 && pageHay.includes(t.toLowerCase()))) return true;
    if (entity.brand && pageHay.includes(entity.brand.toLowerCase())) return true;
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
      temperature: 0.1,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: [
            'You are the SmartProto Photo Editor. Pick at most 3 product photos.',
            'WRONG IMAGE is worse than NO IMAGE. If unsure the photo shows THIS exact product, reject it.',
            'Return ONLY JSON: { hero: url|null, secondary: url|null, detail: url|null, rejected: [{url, reason}], reason }',
            'hero = best clear full view of the object; secondary = other angle/use; detail = meaningful close-up only.',
            'Reject: UI/social screenshots, price tables, big overlays, watermarks, wrong generation/model, near-duplicates.',
            'Prefer official/newsroom/lab tiers over random media when quality is equal.',
            'URLs MUST be copied exactly from the candidate list. Do not invent URLs.',
          ].join(' '),
        },
        {
          role: 'user',
          content: clampText(
            JSON.stringify({
              articleTitle: opts.title,
              entity: opts.entity,
              candidates: catalog,
            }),
            9000,
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
      if (typeof u === 'string' && allowed.has(u) && !picks.some((p) => p.url === u)) {
        picks.push({ url: u, role });
      }
    }
    const rejected = Array.isArray(parsed.rejected)
      ? parsed.rejected.map((r) => ({ url: String(r.url || ''), reason: String(r.reason || 'rejected') }))
      : [];
    return { picks, rejected, reason: parsed.reason || 'ai editor' };
  } catch (err) {
    // Deterministic fallback: top-tier unique URLs, max 3 — still entity-filtered.
    console.log(
      `[photo-editor] AI failed, heuristic pick: ${err instanceof Error ? err.message : String(err)}`,
    );
    const picks = opts.candidates.slice(0, 3).map((c, i) => ({
      url: c.url,
      role: (['hero', 'secondary', 'detail'] as ScoutImage['role'][])[i],
    }));
    return { picks, rejected: [], reason: 'heuristic fallback after AI error' };
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
      if (buf.length > 2.5 * 1024 * 1024) {
        // Keep as-is (quality > size on first pass); note only.
        maybeDownscaleNote(buf);
      }
      const ct = res.headers.get('content-type') || '';
      let ext = 'jpg';
      if (/png/i.test(ct) || /\.png(\?|$)/i.test(c.url)) ext = 'png';
      else if (/webp/i.test(ct) || /\.webp(\?|$)/i.test(c.url)) ext = 'webp';
      else if (/jpeg|jpg/i.test(ct) || /\.jpe?g(\?|$)/i.test(c.url)) ext = 'jpg';
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
 * Full V2 entry — used by newsroom tick and backfill.
 */
export async function resolveArticlePhotos(opts: {
  slug: string;
  title: string;
  text: string;
  sourceUrl: string;
  fallbackUrl?: string;
  html?: string;
}): Promise<PhotoPipelineReport> {
  const entity = await extractPhotoEntity({
    title: opts.title,
    text: opts.text,
    sourceUrl: opts.sourceUrl,
  });

  // Absolute hard rule: cannot confirm subject → NO IMAGE
  if (!entity.brand && !entity.company && entity.matchTokens.length === 0) {
    return {
      entity,
      candidatesFound: 0,
      candidatesRejected: [],
      selected: [],
      notes: ['no extractable visual entity — NO IMAGE'],
    };
  }
  if (entity.status === 'rumor' && !entity.model) {
    return {
      entity,
      candidatesFound: 0,
      candidatesRejected: [],
      selected: [],
      notes: ['rumor without confirmed model — NO IMAGE'],
    };
  }

  const mined = await minePhotoCandidates({
    sourceUrl: opts.sourceUrl,
    title: opts.title,
    text: opts.text,
    entity,
    fallbackUrl: opts.fallbackUrl,
    html: opts.html,
  });

  const edited = await editPhotoSelection({
    entity,
    title: opts.title,
    candidates: mined.candidates,
  });

  const selected = edited.picks.length
    ? await downloadImagesLocally(opts.slug, edited.picks)
    : [];

  return {
    entity,
    candidatesFound: mined.candidates.length,
    candidatesRejected: [...mined.rejected, ...edited.rejected].slice(0, 40),
    selected,
    notes: [...mined.notes, edited.reason, `downloaded=${selected.length}`],
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
