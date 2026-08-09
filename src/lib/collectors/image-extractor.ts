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

/**
 * Returns a contextually fitting atmospheric/thematic photo fallback based on domain/topic,
 * strictly avoiding any wrong physical device images.
 */
function getThematicFallback(title?: string, category?: string): string | null {
  const query = `${title || ''} ${category || ''}`.toLowerCase();

  // Public Figures / Famous Entities
  if (query.includes('musk') || query.includes('маск')) {
    return 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=1200&q=80';
  }
  if (query.includes('openai') || query.includes('altman') || query.includes('альтман')) {
    return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80';
  }
  if (query.includes('apple') || query.includes('mac') || query.includes('iphone')) {
    return 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80';
  }

  // Robotics / Tactile / Cybernetics — bright studio robot (never gloomy circuit boards)
  if (query.includes('robot') || query.includes('робот') || query.includes('tactile') || query.includes('рука') || query.includes('сенсор')) {
    return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80';
  }

  // Optics / Fiber / Quantum / Projector / Light — immersive colorful projection, not dark cinema
  if (
    query.includes('fiber') ||
    query.includes('optic') ||
    query.includes('laser') ||
    query.includes('projector') ||
    query.includes('проектор') ||
    query.includes('квант') ||
    query.includes('свет')
  ) {
    return 'https://images.unsplash.com/photo-1561557944-6e7860d1a7eb?auto=format&fit=crop&w=1200&q=80';
  }

  // Infrastructure / Deploy / Cloud — vivid shipping/containers metaphor, not gray racks
  if (query.includes('deploy') || query.includes('cloud') || query.includes('server') || query.includes('инфраструктур') || query.includes('докер') || query.includes('docker')) {
    return 'https://images.unsplash.com/photo-1605745341112-85968b19335b?auto=format&fit=crop&w=1200&q=80';
  }

  // Gadgets / Hardware / Prototyping — bright bench with colorful jumper wires
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
    return 'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?auto=format&fit=crop&w=1200&q=80';
  }

  // Cybersecurity / Hacking / Signal analysis — bright collaborative engineering, not green matrix gloom
  if (
    query.includes('security') ||
    query.includes('hack') ||
    query.includes('крипто') ||
    query.includes('безопасность') ||
    query.includes('defcon') ||
    query.includes('hn') ||
    query.includes('сигнал')
  ) {
    return 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80';
  }

  // AI / LLM / Machine Learning — friendly bright robotics, not abstract blue blobs
  if (query.includes('ai') || query.includes('ии') || query.includes('нейро') || query.includes('gpt') || query.includes('llm') || query.includes('модель')) {
    return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80';
  }

  // Software / Code / Open Source / Dev / Briefs — colorful editorial books
  if (
    query.includes('code') ||
    query.includes('разработ') ||
    query.includes('разбор') ||
    query.includes('формат') ||
    query.includes('open-source') ||
    query.includes('open source')
  ) {
    return 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80';
  }

  // Analytics / Dashboard — sticky-note planning energy (avoid sterile laptop-dashboard clichés)
  if (query.includes('analy') || query.includes('аналит') || query.includes('dashboard') || query.includes('chart')) {
    return 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80';
  }

  // Weather / Atmospheric — bright solar daylight
  if (query.includes('rain') || query.includes('weather') || query.includes('дождь') || query.includes('погода')) {
    return 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1200&q=80';
  }

  // General Innovation / Editorial — bright sticky-note planning session
  return 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80';
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

  return getThematicFallback(title, category);
}
