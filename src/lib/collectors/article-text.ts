/**
 * Cheap HTML → plain text for collectors (no AI). Caps length for Qwen/Editor budgets.
 */

function cleanHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*>(?:[\s\S]*?<\/script>)/gi, '')
    .replace(/<style\b[^<]*>(?:[\s\S]*?<\/style>)/gi, '')
    .replace(/<noscript\b[^<]*>(?:[\s\S]*?<\/noscript>)/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    'i',
  );
  return (html.match(re)?.[1] || html.match(re2)?.[1] || '').trim();
}

/** Fetch public article page and return plain text + optional og:image (safe sources only). */
export async function extractArticlePlainText(
  url: string,
  opts: { maxChars?: number; timeoutMs?: number } = {},
): Promise<{ text: string; imageUrl: string }> {
  const maxChars = opts.maxChars ?? 3500;
  const timeoutMs = opts.timeoutMs ?? 8000;
  if (!/^https?:\/\//i.test(url)) return { text: '', imageUrl: '' };

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { text: '', imageUrl: '' };
    const html = await res.text();
    const imageUrl = metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || '';

    const articleMatch =
      html.match(/id=["']paragraph["'][^>]*>([\s\S]*?)<div[^>]+class=["'][^"']*(?:news|related|footer|copyright)/i) ||
      html.match(/id=["']paragraph["'][^>]*>([\s\S]*?)$/i) ||
      html.match(/class=["'][^"']*post_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]+class=["'][^"']*(?:article|post|content|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const chunk = articleMatch?.[1] || html;
    const desc = metaContent(html, 'og:description') || metaContent(html, 'description');
    const body = cleanHtml(chunk).slice(0, maxChars);
    const text = [desc, body].filter(Boolean).join('\n\n').slice(0, maxChars);

    let img = imageUrl.startsWith('http') ? imageUrl : '';
    if (!img) {
      const imgMatch =
        chunk.match(/<img[^>]+(?:data-src|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i) ||
        html.match(/<img[^>]+(?:data-src|src)=["'](https?:\/\/img\.ithome\.com[^"']+)["']/i);
      if (imgMatch?.[1]) img = imgMatch[1];
    }
    return { text, imageUrl: img };
  } catch {
    return { text: '', imageUrl: '' };
  }
}
