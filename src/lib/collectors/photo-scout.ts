/**
 * SP-A-061 — Photo Intelligence V1 (safe, no search API, no AI vision).
 *
 * Safety-first: an unconfirmed/wrong-product photo is worse than no photo.
 * We only ever pull candidates from the article's own source page, and each
 * candidate MUST textually match the article's brand/model before it can be
 * used — this is exactly what prevents the iQOO T / iQOO 15T mix-up (an
 * "iQOO T" rumor page also embeds official iQOO 15T marketing slides; those
 * must be rejected because "T" alone never matches "15T").
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { passesImageQualityGate } from './image-extractor';

export interface ScoutImage {
  url: string;
  role: 'hero' | 'secondary' | 'detail';
  sourceUrl: string;
}

interface RawCandidate {
  url: string;
  context: string; // alt text + nearby text, lowercased
}

const IGNORE_SRC_RE =
  /avatar|logo|icon|qrcode|1x1|pixel|spinner|badge|sprite|placeholder|^\/\/img\.ithome\.com\/images\/v2\/t\.png/i;

/** Extract brand + a strict model token (e.g. "15T", "K90", "S25") from a title. */
function extractEntity(title: string): { brand: string | null; model: string | null } {
  const brandMatch = title.match(
    /\b(iQOO|Redmi|Xiaomi|Huawei|Honor|OPPO|vivo|OnePlus|Samsung|Apple|Google|Sony|Lenovo|ASUS|Nothing|Realme|Motorola|Insta360|DJI|Anker|Casio|GoPro)\b/i,
  );
  const brand = brandMatch ? brandMatch[1] : null;
  // Model token: brand followed by an alphanumeric code (digits + optional letters), e.g. "15T", "K90 Pro".
  const modelMatch = brand
    ? title.slice(brandMatch!.index! + brand.length).match(/^\s*([A-Za-z]?\d{1,3}[A-Za-z]{0,4}(?:\s+Pro|\s+Max|\s+Ultra)?)/)
    : null;
  const model = modelMatch ? modelMatch[1].trim() : null;
  return { brand, model };
}

/** Article hints at an unconfirmed/rumored model (e.g. "iQOO T" possibly "16T"). */
function looksRumored(title: string, text: string): boolean {
  return /предположительно|возможно|слух|rumor|leak|тестирован|testing/i.test(`${title}\n${text}`);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function findRawCandidates(html: string, baseUrl: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  const imgRegex = /<img\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch =
      attrs.match(/data-original=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/data-src=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/src=(?:"([^"]+)"|'([^']+)')/i);
    if (!srcMatch) continue;
    const rawSrc = (srcMatch[1] || srcMatch[2] || '').trim();
    if (!rawSrc || rawSrc.startsWith('data:') || IGNORE_SRC_RE.test(rawSrc)) continue;

    // Only `alt` — many CMS templates (incl. this source) stamp the same
    // generic page headline into every image's `title` attribute, which
    // would make every picture on the page falsely "match" the entity.
    const altMatch = attrs.match(/alt=(?:"([^"]*)"|'([^']*)')/i);
    const alt = (altMatch?.[1] || altMatch?.[2] || '').toLowerCase();
    // Narrow, localized window: wide enough for this image's own caption,
    // tight enough not to bleed into a neighbouring paragraph about a
    // different (comparison/related) SKU further down the same article.
    const before = stripTags(html.slice(Math.max(0, match.index - 260), match.index)).toLowerCase();
    const after = stripTags(html.slice(match.index + match[0].length, match.index + match[0].length + 120)).toLowerCase();

    try {
      const resolved = new URL(rawSrc.replace(/^\/\//, 'https://'), baseUrl).href.split('@')[0];
      if (/^https?:\/\//i.test(resolved)) {
        out.push({ url: resolved, context: `${alt} ${before} ${after}` });
      }
    } catch {
      /* skip invalid URL */
    }
  }
  return out;
}

/**
 * Repost/UI/benchmark-screenshot signatures — these mention the right brand
 * and model too (that's exactly why context-matching alone isn't enough),
 * so any hit here disqualifies the candidate outright.
 */
const SCREENSHOT_MARKER_RE =
  /小时前|分钟前|微博正文|跑分|转发|评论|点赞|geekbench|antutu|benchmark score|single-core|multi-core|截图|screenshot/i;

function contextMatchesEntity(context: string, brand: string | null, model: string | null, strictModel: boolean): boolean {
  if (!brand) return false;
  if (SCREENSHOT_MARKER_RE.test(context)) return false;
  const hay = context.toLowerCase();
  const brandHit = new RegExp(`\\b${brand.toLowerCase()}\\b`).test(hay);
  if (!brandHit) return false;
  if (!model) return !strictModel; // no model to confirm — only safe when not a rumored/ambiguous case
  // Whole-token match so "Z11" text elsewhere never satisfies a "Z11S"
  // requirement (and vice versa) — exact variant only.
  return new RegExp(`\\b${model.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);
}

/**
 * Scan the source page for candidate photos, keep only ones that (a) pass
 * the existing quality gate and (b) textually match the article's brand and
 * (when the model is unconfirmed/rumored) its exact model token. Returns up
 * to 3 remote URLs tagged hero/secondary/detail — caller downloads them.
 */
export async function scoutImages(opts: {
  html: string;
  pageUrl: string;
  title: string;
  text: string;
  fallbackUrl?: string;
}): Promise<{ url: string; role: ScoutImage['role'] }[]> {
  const { brand, model } = extractEntity(opts.title);
  if (!brand) return []; // can't confirm anything without at least a brand — no guessing.

  const strictModel = looksRumored(opts.title, opts.text);
  const raw = findRawCandidates(opts.html, opts.pageUrl);
  if (opts.fallbackUrl) raw.unshift({ url: opts.fallbackUrl, context: `${opts.title} ${brand} ${model || ''}` });

  const seen = new Set<string>();
  const matched: string[] = [];
  for (const c of raw) {
    if (seen.has(c.url) || matched.includes(c.url)) continue;
    seen.add(c.url);
    if (!contextMatchesEntity(c.context, brand, model, strictModel)) continue;
    // eslint-disable-next-line no-await-in-loop
    if (!(await passesImageQualityGate(c.url))) continue;
    matched.push(c.url);
    // V1 safety cap: this heuristic page-scan has repeatedly produced
    // false positives past the first candidate on busy comparison/ad-heavy
    // pages (wrong SKU, unrelated promo). One confirmed hero only for now —
    // secondary/detail are a V2 item once a stronger signal exists.
    if (matched.length >= 1) break;
  }

  const roles: ScoutImage['role'][] = ['hero', 'secondary', 'detail'];
  return matched.map((url, i) => ({ url, role: roles[i] }));
}

/**
 * Downloads confirmed candidates to local storage — production never depends
 * on an external hotlink. V1 keeps the original format (no WebP transcode
 * yet, avoids adding a native image-processing dependency to the container).
 * A candidate that fails to download is simply skipped (never blocks the
 * others), matching the "next candidate on failure" requirement.
 */
export async function downloadImagesLocally(
  slug: string,
  candidates: { url: string; role: ScoutImage['role'] }[],
  mediaRoot = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media'),
): Promise<ScoutImage[]> {
  const dir = path.join(mediaRoot, slug);
  const out: ScoutImage[] = [];
  for (const c of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(c.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000 || buf.length > 8 * 1024 * 1024) continue;
      const ext = /\.png(\?|$)/i.test(c.url) ? 'png' : 'jpg';
      // eslint-disable-next-line no-await-in-loop
      await mkdir(dir, { recursive: true });
      const filename = `${c.role}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      await writeFile(path.join(dir, filename), buf);
      out.push({ url: `/api/media/${slug}/${filename}`, role: c.role, sourceUrl: c.url });
    } catch {
      continue; // move on to the next candidate
    }
  }
  return out;
}
