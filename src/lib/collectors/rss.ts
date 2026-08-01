import Parser from 'rss-parser';

export interface RssItem {
  id: string;
  title: string;
  url: string;
  text: string;
  publishedAt: string;
  sourceName: string;
  imageUrl?: string;
}

// Alias for backwards compatibility if needed
export type RssFeedItem = RssItem;

export interface FetchRssOptions {
  limit?: number;
  sourceName?: string;
}

interface CustomItem {
  id?: string;
  'content:encoded'?: string;
  summary?: string;
  description?: string;
  'media:content'?: unknown;
  'media:thumbnail'?: unknown;
  mediaContent?: unknown;
  mediaThumbnail?: unknown;
}

/**
 * Strips HTML tags and unescapes common HTML entities from raw string, returning plain text.
 */
function cleanHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*>(?:[\s\S]*?<\/script>)/gi, '')
    .replace(/<style\b[^<]*>(?:[\s\S]*?<\/style>)/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Parses pubDate or isoDate string into an ISO 8601 string or returns current time ISO string as fallback.
 */
function toIsoDate(pubDate?: string, isoDate?: string): string {
  if (isoDate) {
    const date = new Date(isoDate);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  if (pubDate) {
    const date = new Date(pubDate);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Extracts domain name from a feed URL as fallback for sourceName.
 */
function getDomainName(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

function cleanUrl(urlStr: string): string {
  return urlStr
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x26;/gi, '&');
}

/**
 * Extracts image URL from feed item in priority order:
 * a) item.enclosure?.url (if type is image or url ends with image extension)
 * b) item['media:content']?.$.url / item.mediaContent?.url
 * c) item['media:thumbnail']?.$.url / item.mediaThumbnail?.url
 * d) First <img src="..."> tag in item.content or item.description if valid absolute HTTP(S) URL
 */
function extractImageUrl(item: Record<string, any>): string | undefined {
  if (item.enclosure && typeof item.enclosure.url === 'string') {
    const encUrl = cleanUrl(item.enclosure.url);
    const encType = typeof item.enclosure.type === 'string' ? item.enclosure.type : '';
    const isImage = encType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(encUrl);
    if (isImage && /^https?:\/\//i.test(encUrl)) {
      return encUrl;
    }
  }

  const getMediaUrl = (media: any): string | undefined => {
    if (!media) return undefined;
    const target = Array.isArray(media) ? media[0] : media;
    if (!target) return undefined;
    const url = target.$?.url || target.url || target.href;
    if (typeof url === 'string' && /^https?:\/\//i.test(cleanUrl(url))) {
      return cleanUrl(url);
    }
    return undefined;
  };

  const mediaContentUrl = getMediaUrl(item['media:content']) || getMediaUrl(item.mediaContent);
  if (mediaContentUrl) return mediaContentUrl;

  const mediaThumbUrl = getMediaUrl(item['media:thumbnail']) || getMediaUrl(item.mediaThumbnail);
  if (mediaThumbUrl) return mediaThumbUrl;

  const htmlSources = [
    item['content:encoded'],
    item.content,
    item.description,
    item.summary,
  ];
  for (const src of htmlSources) {
    if (typeof src === 'string' && src) {
      const match = src.match(/<img\s+[^>]*src=["'](https?:\/\/[^"']+)["']/i);
      if (match && match[1]) {
        return cleanUrl(match[1]);
      }
    }
  }

  return undefined;
}

/**
 * Fetches and parses an RSS or Atom feed, mapping feed items to standard RssItem shape.
 * Accepts limit & sourceName via options object or positional arguments.
 */
export async function fetchRssFeed(
  feedUrl: string,
  optionsOrLimit?: FetchRssOptions | number,
  sourceNameArg?: string
): Promise<RssItem[]> {
  let limit = 10;
  let sourceName = sourceNameArg;

  if (typeof optionsOrLimit === 'number') {
    limit = optionsOrLimit;
  } else if (optionsOrLimit && typeof optionsOrLimit === 'object') {
    if (typeof optionsOrLimit.limit === 'number') {
      limit = optionsOrLimit.limit;
    }
    if (optionsOrLimit.sourceName) {
      sourceName = optionsOrLimit.sourceName;
    }
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 10;
  if (safeLimit === 0 || !feedUrl || typeof feedUrl !== 'string') {
    return [];
  }

  try {
    const parser: Parser<Record<string, unknown>, CustomItem> = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SmartProtoNewsroom/1.0',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      customFields: {
        item: ['content:encoded', 'summary', 'id', 'description', 'media:content', 'media:thumbnail'] as any,
      },
    });

    const feed = await parser.parseURL(feedUrl);
    if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) {
      return [];
    }

    const fallbackSource = sourceName?.trim() || feed.title?.trim() || getDomainName(feedUrl);

    const itemsToProcess = feed.items.slice(0, safeLimit);
    const result: RssItem[] = [];

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];

      let rawGuid = '';
      if (typeof item.guid === 'string') {
        rawGuid = item.guid;
      } else if (item.guid && typeof item.guid === 'object') {
        rawGuid = String((item.guid as unknown as Record<string, unknown>)._ || '');
      }
      const itemId = typeof item.id === 'string' ? item.id : '';

      const id = rawGuid.trim() || itemId.trim() || item.link?.trim() || `rss-item-${Date.now()}-${i}`;

      const title = cleanHtml(item.title || '').trim();
      const url = item.link?.trim() || '';

      const rawContent =
        item['content:encoded'] ||
        item.content ||
        item.summary ||
        item.description ||
        item.contentSnippet ||
        '';

      const cleanedText = cleanHtml(typeof rawContent === 'string' ? rawContent : '');
      const text = cleanedText.slice(0, 6000);

      const publishedAt = toIsoDate(item.pubDate, item.isoDate);
      const imageUrl = extractImageUrl(item as Record<string, any>);

      result.push({
        id,
        title,
        url,
        text,
        publishedAt,
        sourceName: fallbackSource,
        ...(imageUrl ? { imageUrl } : {}),
      });
    }

    return result;
  } catch {
    return [];
  }
}
