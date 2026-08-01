/**
 * Shared helper to extract primary article image URL from original article HTML.
 * Checks Open Graph, Twitter Card meta tags, link image_src, and fallback <img> tags.
 */

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
 * Supports single quotes, double quotes, and unquoted attribute values regardless of attribute order.
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
 * Filters out header/nav/footer, tiny icons, tracking pixels, avatars, and SVGs.
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
    if (widthMatch && parseInt(widthMatch[1], 10) <= 30) continue;
    if (heightMatch && parseInt(heightMatch[1], 10) <= 30) continue;

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
 * Extracts the primary authentic image URL from an original article webpage URL.
 * Strictly priority-ordered checks:
 * 1. <meta property="og:image" content="...">
 * 2. <meta name="twitter:image" content="..."> / twitter:image:src
 * 3. <link rel="image_src" href="...">
 * 4. <meta property="og:image:secure_url" content="...">
 * 5. Fallback: First significant <img> tag in article body HTML.
 *
 * Gracefully returns null on timeouts, blocking, network or HTTP errors.
 * Never invents or generates placeholder images.
 */
export async function extractArticleImage(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return null;
  }

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

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

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
          // Ignore invalid URL
        }
      }
    }

    return findFirstSignificantImg(html, cleanArticleUrl);
  } catch {
    return null;
  }
}
