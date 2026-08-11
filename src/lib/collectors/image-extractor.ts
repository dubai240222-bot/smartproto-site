/**
 * Shared helper to extract primary article image URL from original article HTML,
 * with smart context-based fallback according to strict editorial guidelines.
 *
 * IMAGE SELECTION POLICY:
 * 1. Primary Choice: Always try to extract authentic original image from sourceUrl page (og:image, twitter:image, lead img).
 * 2. Famous Person / Entity Exception: If original HTML is not available and title mentions a well-known figure/company (e.g. Musk, Trump, Altman, OpenAI, Apple), use a clean authentic photo of that person/company.
 * 3. New Inventions / Devices: NEVER show a photo of a different wrong physical gadget/device.
 * 4. Thematic / Action Conceptual Fallback: Bright, vivid, editorial atmospheric images matching the domain/action
 *    (robotics in well-lit labs, colorful shipping/deploy metaphors, immersive projection for optics/displays,
 *    collaborative engineering for software). Avoid gloomy gray tech stock, empty dark rooms, muddy circuits.
 */

/**
 * SP-A-060 — Image quality gate.
 *
 * We have no vision model in this pipeline, so this is a heuristic gate based
 * on real pixel dimensions (not just the URL/host):
 *  - reject banner/strip aspect ratios (>2.3:1 or <0.42:1) — this is exactly
 *    the shape of reposted Weibo/forum screenshots (a header bar + a long
 *    caption, or a thin wide status-post capture), never a real product photo.
 *  - reject anything too small to be a usable hero/rail image.
 * A URL that fails or can't be measured in time is treated as PASS (fail-open)
 * so a slow/odd host never silently kills a perfectly fine photo — better to
 * occasionally let a border case through than to strip good photos.
 */
const BAD_IMAGE_HOST_RE =
  /weibocdn\.com|weibo\.com|sinaimg\.cn|(^|\.)x\.com|twimg\.com|(^|\.)reddit\.com|redditmedia\.com|redd\.it|discourse-cdn|forumcdn|imgur\.com\/a\//i;

function readUint16BE(buf: Buffer, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

/** Minimal PNG (IHDR) / JPEG (SOFn) dimension sniffing — no extra dependency. */
function sniffImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR chunk with width/height at fixed offsets.
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: readUint32BE(buf, 16), height: readUint32BE(buf, 20) };
  }
  // JPEG: walk markers looking for a Start-Of-Frame segment.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = readUint16BE(buf, offset + 5);
        const width = readUint16BE(buf, offset + 7);
        if (width > 0 && height > 0) return { width, height };
      }
      const segmentLength = readUint16BE(buf, offset + 2);
      offset += 2 + segmentLength;
    }
  }
  return null;
}

/**
 * Fetches only the first bytes of the image (enough for PNG/JPEG headers) and
 * checks that its shape/size looks like a real product photo, not a reposted
 * social-media screenshot or UI capture.
 */
export async function passesImageQualityGate(url: string): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return true;
  if (BAD_IMAGE_HOST_RE.test(url)) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Range: 'bytes=0-65535',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok && response.status !== 206) return true; // fail-open

    const buf = Buffer.from(await response.arrayBuffer());
    const dims = sniffImageDimensions(buf);
    if (!dims) return true; // couldn't measure (e.g. WebP/AVIF) — fail-open

    const { width, height } = dims;
    if (width < 240 || height < 240) return false; // too small to be a real hero/rail photo
    const ratio = width / height;
    if (ratio > 2.3 || ratio < 0.42) return false; // banner/strip shape == reposted screenshot

    // SP-A-064: do NOT reject merely for having an Exif APP1 segment —
    // almost every real product JPEG carries one. Screenshot heuristics
    // stay in photo-scout context markers + BAD_IMAGE_HOST_RE instead.

    return true;
  } catch {
    return true; // network/timeout — fail-open, never block publish on a flaky fetch
  }
}

function sanitizeUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') return '';
  return urlStr
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x26;/gi, '&');
}

/**
 * Extracts property/name meta content and link href tags into a key-value Map.
 */
function parseMetaAndLinkTags(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Match <meta ...> tags
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const keyMatch = attrs.match(/(?:property|name)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const contentMatch = attrs.match(/content=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);

    if (keyMatch && contentMatch) {
      const key = (keyMatch[1] || keyMatch[2] || keyMatch[3] || '').trim().toLowerCase();
      const val = (contentMatch[1] || contentMatch[2] || contentMatch[3] || '').trim();
      if (key && val && !map.has(key)) {
        map.set(key, val);
      }
    }
  }

  // Match <link ...> tags
  const linkRegex = /<link\s+([^>]+)>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1];
    const relMatch = attrs.match(/rel=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const hrefMatch = attrs.match(/href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);

    if (relMatch && hrefMatch) {
      const rel = (relMatch[1] || relMatch[2] || relMatch[3] || '').trim().toLowerCase();
      const href = (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '').trim();
      const key = `link:${rel}`;
      if (key && href && !map.has(key)) {
        map.set(key, href);
      }
    }
  }

  return map;
}

/**
 * Fallback: Finds the first significant <img> tag in the article body HTML.
 * Filters out header/nav/footer, tiny icons, tracking pixels, avatars, thumbnails, and SVGs.
 */
function findFirstSignificantImg(html: string, baseUrl: string): string | null {
  const mainHtml = html
    .replace(/<header\b[^<]*>(?:[\s\S]*?<\/header>)/gi, '')
    .replace(/<nav\b[^<]*>(?:[\s\S]*?<\/nav>)/gi, '')
    .replace(/<footer\b[^<]*>(?:[\s\S]*?<\/footer>)/gi, '');

  const imgRegex = /<img\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(mainHtml)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!srcMatch) continue;

    const rawSrc = srcMatch[1] || srcMatch[2] || srcMatch[3] || '';
    const src = sanitizeUrl(rawSrc);
    if (!src || src.startsWith('data:')) continue;

    // Skip small dimensions if explicit width/height attributes are present
    const widthMatch = attrs.match(/width=["']?(\d+)["']?/i);
    const heightMatch = attrs.match(/height=["']?(\d+)["']?/i);
    if (widthMatch && parseInt(widthMatch[1], 10) <= 150) continue;
    if (heightMatch && parseInt(heightMatch[1], 10) <= 150) continue;

    const lowerSrc = src.toLowerCase();
    if (
      lowerSrc.includes('avatar') ||
      lowerSrc.includes('pixel') ||
      lowerSrc.includes('spinner') ||
      lowerSrc.includes('tracker') ||
      lowerSrc.includes('badge') ||
      lowerSrc.includes('icon') ||
      lowerSrc.includes('logo') ||
      lowerSrc.includes('1x1') ||
      lowerSrc.includes('thumb') ||
      lowerSrc.includes('small') ||
      lowerSrc.includes('100x100') ||
      lowerSrc.includes('150x150') ||
      lowerSrc.endsWith('.svg')
    ) {
      continue;
    }

    try {
      const resolved = new URL(src, baseUrl).href;
      if (/^https?:\/\//i.test(resolved)) {
        return resolved;
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return null;
}

/** Stable pick from a pool so adjacent articles rarely share one stock frame. */
function pickPool(pool: string[], seed?: string): string {
  if (!pool.length) return '';
  if (!seed) return pool[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

function u(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
}

/** Topic pools — bright editorial frames, never one grey wall for every card. */
const THEMATIC_POOLS = {
  people: [u('photo-1570295999919-56ceb5ecca61'), u('photo-1507003211169-0a1dd7228f2d'), u('photo-1472099645785-5658abf4ff4e')],
  openai: [u('photo-1485827404703-89b55fcc595e'), u('photo-1677442136019-21780ecad995'), u('photo-1620712943543-bcc4688e7485')],
  apple: [u('photo-1512941937669-90a1b58e7e9c'), u('photo-1510557880182-3d4d3cba35a5'), u('photo-1592899677977-9c10ca588bbd')],
  robotics: [
    u('photo-1485827404703-89b55fcc595e'),
    u('photo-1535378917041-10a22f510809'),
    u('photo-1581091226825-a6a2a5aee158'),
    u('photo-1581092918056-0c4c3acd3789'),
    u('photo-1561557944-6e7860d1a7eb'),
  ],
  optics: [
    u('photo-1561557944-6e7860d1a7eb'),
    u('photo-1518709268805-4e9042af9f23'),
    u('photo-1451187580459-43490279c0fa'),
    u('photo-1507413245164-6160d8298b31'),
  ],
  mobility: [
    u('photo-1492144534655-ae79c964c9d7'),
    u('photo-1503376780353-7e6692767b70'),
    u('photo-1552519507-da3b142c6e3d'),
    u('photo-1549317661-bd32c8ce0db2'),
  ],
  infra: [u('photo-1605745341112-85968b19335b'), u('photo-1451187580459-43490279c0fa'), u('photo-1558494949-ef010cbdcc31')],
  gadget: [
    u('photo-1558346490-a72e53ae2d4f'),
    u('photo-1518770660439-4636190af475'),
    u('photo-1588508065123-287b28e013da'),
    u('photo-1526170375885-4d8ecf77b99f'),
    u('photo-1505740420928-5e560c06d30e'),
  ],
  security: [u('photo-1531482615713-2afd69097998'), u('photo-1563986768609-322da13575f3'), u('photo-1550751827-4bd374c3f58b')],
  ai: [
    u('photo-1677442136019-21780ecad995'),
    u('photo-1620712943543-bcc4688e7485'),
    u('photo-1485827404703-89b55fcc595e'),
    u('photo-1535378917041-10a22f510809'),
  ],
  code: [u('photo-1512820790803-83ca734da794'), u('photo-1461749280684-dccba630e2f6'), u('photo-1516321318423-f06f85e504b3')],
  planning: [u('photo-1552664730-d307ca884978'), u('photo-1531403009284-440f080d1e12'), u('photo-1454165804606-c3d57bc86b40')],
  weather: [u('photo-1509391366360-2e959784a276'), u('photo-1501594907352-04cda38ebc29'), u('photo-1469474968028-56623f02e42e')],
  health: [u('photo-1576091160399-112ba8d25d1d'), u('photo-1582719478250-c89cae4dc85b'), u('photo-1579684385127-1ef15d508118')],
  phone: [u('photo-1511707171634-5f897ff02aa9'), u('photo-1592899677977-9c10ca588bbd'), u('photo-1510557880182-3d4d3cba35a5')],
  network: [u('photo-1544197150-b99a41b40b3e'), u('photo-1451187580459-43490279c0fa'), u('photo-1558494949-ef010cbdcc31')],
} as const;

/**
 * Returns a contextually fitting atmospheric/thematic photo fallback based on domain/topic,
 * strictly avoiding any wrong physical device images.
 * Exported for Chief Fast Lane required-photo path (SP-A-077) — AUTO still uses extractArticleImage.
 * Optional `seed` (slug) rotates within the topic pool so cards do not share one stock frame.
 */
export function getThematicFallback(title?: string, category?: string, seed?: string): string | null {
  const query = `${title || ''} ${category || ''}`.toLowerCase();
  const s = seed || title || category || 'smartproto';

  if (query.includes('musk') || query.includes('маск')) return pickPool([...THEMATIC_POOLS.people], s);
  if (query.includes('openai') || query.includes('altman') || query.includes('альтман')) {
    return pickPool([...THEMATIC_POOLS.openai], s);
  }
  if (query.includes('apple') || query.includes('mac') || query.includes('iphone')) {
    return pickPool([...THEMATIC_POOLS.apple], s);
  }

  if (
    query.includes('robot') ||
    query.includes('робот') ||
    query.includes('tactile') ||
    query.includes('tacta') ||
    query.includes('рука') ||
    query.includes('сенсор') ||
    query.includes('симулятор') ||
    query.includes('manipulat')
  ) {
    return pickPool([...THEMATIC_POOLS.robotics], s);
  }

  if (
    query.includes('fiber') ||
    query.includes('optic') ||
    query.includes('laser') ||
    query.includes('projector') ||
    query.includes('проектор') ||
    query.includes('квант') ||
    query.includes('свет')
  ) {
    return pickPool([...THEMATIC_POOLS.optics], s);
  }

  if (
    query.includes('volkswagen') ||
    query.includes('id. era') ||
    query.includes('электромобил') ||
    query.includes('ev ') ||
    query.includes('sedan') ||
    query.includes('автомоб') ||
    query.includes('geely') ||
    query.includes('galaxy tt')
  ) {
    return pickPool([...THEMATIC_POOLS.mobility], s);
  }

  if (
    query.includes('5g') ||
    query.includes('huawei') ||
    query.includes('сеть') ||
    query.includes('network') ||
    query.includes('wifi') ||
    query.includes('wi-fi') ||
    query.includes('беспровод')
  ) {
    return pickPool([...THEMATIC_POOLS.network], s);
  }

  if (
    query.includes('health') ||
    query.includes('cancer') ||
    query.includes('медицин') ||
    query.includes('рак') ||
    query.includes('breast') ||
    query.includes('diagnos')
  ) {
    return pickPool([...THEMATIC_POOLS.health], s);
  }

  if (
    query.includes('phone') ||
    query.includes('смартфон') ||
    query.includes('pixel') ||
    query.includes('smartphone') ||
    query.includes('аннонс') ||
    query.includes('анонс')
  ) {
    return pickPool([...THEMATIC_POOLS.phone], s);
  }

  if (
    query.includes('deploy') ||
    query.includes('cloud') ||
    query.includes('server') ||
    query.includes('инфраструктур') ||
    query.includes('докер') ||
    query.includes('docker')
  ) {
    return pickPool([...THEMATIC_POOLS.infra], s);
  }

  if (
    query.includes('gadget') ||
    query.includes('гаджет') ||
    query.includes('hardware') ||
    query.includes('прототип') ||
    query.includes('badge') ||
    query.includes('бейдж') ||
    query.includes('pcb') ||
    query.includes('электрон')
  ) {
    return pickPool([...THEMATIC_POOLS.gadget], s);
  }

  if (
    query.includes('security') ||
    query.includes('hack') ||
    query.includes('крипто') ||
    query.includes('безопасность') ||
    query.includes('cyber') ||
    query.includes('кибер') ||
    query.includes('defcon') ||
    query.includes('сигнал')
  ) {
    return pickPool([...THEMATIC_POOLS.security], s);
  }

  if (
    query.includes('ai') ||
    query.includes('ии') ||
    query.includes('нейро') ||
    query.includes('gpt') ||
    query.includes('llm') ||
    query.includes('модель') ||
    query.includes('ganpaint')
  ) {
    return pickPool([...THEMATIC_POOLS.ai], s);
  }

  if (
    query.includes('code') ||
    query.includes('разработ') ||
    query.includes('разбор') ||
    query.includes('формат') ||
    query.includes('open-source') ||
    query.includes('open source')
  ) {
    return pickPool([...THEMATIC_POOLS.code], s);
  }

  if (query.includes('analy') || query.includes('аналит') || query.includes('dashboard') || query.includes('chart')) {
    return pickPool([...THEMATIC_POOLS.planning], s);
  }

  if (query.includes('rain') || query.includes('weather') || query.includes('дождь') || query.includes('погода')) {
    return pickPool([...THEMATIC_POOLS.weather], s);
  }

  return pickPool([...THEMATIC_POOLS.planning, ...THEMATIC_POOLS.gadget], s);
}

/**
 * Extracts the primary authentic image URL from an original article webpage URL,
 * with contextually fitting atmospheric conceptual fallback.
 */
export async function extractArticleImage(
  url: string,
  title?: string,
  category?: string
): Promise<string | null> {
  if (url && typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
    const cleanArticleUrl = sanitizeUrl(url);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(cleanArticleUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
          const html = await response.text();
          const tagsMap = parseMetaAndLinkTags(html);

          const priorityKeys = [
            'og:image',
            'twitter:image',
            'twitter:image:src',
            'link:image_src',
            'og:image:secure_url',
          ];

          for (const key of priorityKeys) {
            const rawImg = tagsMap.get(key);
            if (rawImg) {
              try {
                const resolved = new URL(sanitizeUrl(rawImg), cleanArticleUrl).href;
                if (/^https?:\/\//i.test(resolved)) {
                  return resolved;
                }
              } catch {
                // Ignore
              }
            }
          }

          const bodyImg = findFirstSignificantImg(html, cleanArticleUrl);
          if (bodyImg) {
            return bodyImg;
          }
        }
      }
    } catch {
      // Ignore network errors/timeouts
    }
  }

  return getThematicFallback(title, category, title);
}
