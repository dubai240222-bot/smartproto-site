/**
 * SP-A-064 — ITHome image adapter (URL normalizer only).
 *
 * ITHome HTML → absolute raster CDN candidates.
 * Does NOT decide product identity, roles, rumor/entity, quality, or download.
 * Downstream Photo Intelligence V2 owns all of that.
 */
export interface IthomeNormalizedImage {
  /** Absolute https URL suitable as a fetchable raster candidate. */
  url: string;
  /** Nearby alt/title text only — not a product verdict. */
  context: string;
}

const PLACEHOLDER_RE = /\/images\/v2\/t\.png(?:\?|$)|\/t\.png(?:\?|$)/i;
/** Broken relative fragments accidentally resolved against article path. */
const BROKEN_FRAGMENT_RE =
  /\/(?:f_auto|h_\d+|o_\d+|w_\d+)(?:\?|$)|\/0\/\d+\/(?:f_auto|h_\d+|o_\d+)(?:\?|$)/i;

export function isIthomePageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'ithome.com' || host.endsWith('.ithome.com');
  } catch {
    return false;
  }
}

/**
 * Normalize a single raw ITHome image reference into an absolute CDN URL, or null.
 */
export function normalizeIthomeImageUrl(raw: string, pageUrl: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim().replace(/&amp;/gi, '&');
  if (!s || s.startsWith('data:')) return null;

  // Protocol-relative CDN
  if (s.startsWith('//')) s = `https:${s}`;

  // srcset descriptor: "url 2x" / "url 820w" — keep URL only
  if (/\s+\d+[wx]$/i.test(s) || /\s+\d+(\.\d+)?x$/i.test(s)) {
    s = s.trim().split(/\s+/)[0];
  }
  // Multi-entry srcset already split by caller; defensive:
  if (s.includes(',') && /newsuploadfiles|\.(jpe?g|png|webp)/i.test(s)) {
    // Prefer the first absolute/http segment, never split inside @s_2,w_820
    const atIdx = s.indexOf('@');
    const beforeAt = atIdx >= 0 ? s.slice(0, atIdx) : s;
    if (!beforeAt.includes(',')) {
      /* keep s — comma only in @suffix */
    } else {
      s = s
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0])
        .filter((p) => /newsuploadfiles|\.(jpe?g|png|webp)/i.test(p))
        .pop() || s.split(',')[0].trim().split(/\s+/)[0];
    }
  }

  // Strip ITHome resize suffix: ...jpg@s_2,w_820,h_1066
  s = s.replace(/@[a-z0-9_,.]+$/i, '');

  // Drop Baidu CDN process query — keep clean file URL (still fetchable).
  try {
    const u = new URL(s, pageUrl);
    if (/x-bce-process/i.test(u.search)) {
      u.search = '';
    }
    s = u.href;
  } catch {
    return null;
  }

  if (!/^https?:\/\//i.test(s)) return null;
  if (PLACEHOLDER_RE.test(s)) return null;
  if (BROKEN_FRAGMENT_RE.test(s)) return null;

  // Must look like a real image path (CDN upload or extension).
  const pathOnly = s.split('?')[0];
  const hasUpload = /newsuploadfiles\//i.test(pathOnly);
  const hasExt = /\.(jpe?g|png|webp|gif)$/i.test(pathOnly);
  if (!hasUpload && !hasExt) return null;

  // Reject article-page paths mistaken for images
  if (/ithome\.com\/0\/\d+/i.test(pathOnly) && !hasUpload) return null;

  return s;
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = attrs.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * Parse ITHome article HTML and return de-duplicated absolute image candidates.
 */
export function extractIthomeImageCandidates(
  html: string,
  pageUrl: string,
): IthomeNormalizedImage[] {
  const out: IthomeNormalizedImage[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined, context: string) => {
    if (!raw) return;
    const url = normalizeIthomeImageUrl(raw, pageUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, context: context.replace(/\s+/g, ' ').trim().slice(0, 400) });
  };

  // og / twitter (sometimes points at newsuploadfiles)
  for (const re of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) push(m[1], 'og');
  }

  // Prefer scanning raw newsuploadfiles URLs in HTML (covers truncated attrs / odd quoting)
  const bareRe =
    /https?:\/\/img\.ithome\.com\/newsuploadfiles\/[^\s"'<>]+|\/\/img\.ithome\.com\/newsuploadfiles\/[^\s"'<>]+/gi;
  let bare: RegExpExecArray | null;
  while ((bare = bareRe.exec(html)) !== null) {
    push(bare[0], 'newsuploadfiles');
  }

  // <img> attributes: data-original > srcset > data-src > src
  const imgRe = /<img\s+([^>]+)>/gi;
  let img: RegExpExecArray | null;
  while ((img = imgRe.exec(html)) !== null) {
    const attrs = img[1];
    const context = [attr(attrs, 'alt'), attr(attrs, 'title')].filter(Boolean).join(' ');
    const original = attr(attrs, 'data-original');
    const srcset = attr(attrs, 'srcset');
    const dataSrc = attr(attrs, 'data-src') || attr(attrs, 'data-lazy-src');
    const src = attr(attrs, 'src');

    if (original) push(original, context);
    if (srcset) {
      // Take each candidate URL from srcset (split on comma only between entries)
      for (const part of srcset.split(',')) {
        const urlPart = part.trim().split(/\s+/)[0];
        if (urlPart) push(urlPart, context);
      }
    }
    if (dataSrc) push(dataSrc, context);
    if (src) push(src, context);
  }

  return out;
}
