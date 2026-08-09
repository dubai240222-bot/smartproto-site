/**
 * One-shot: measure ITHome adapter harvest vs general path for given slugs.
 * Does not change entity/rumor policy — then optionally runs full V2 backfill.
 */
import 'dotenv/config';
import { extractIthomeImageCandidates, isIthomePageUrl } from '../src/lib/collectors/ithome-image-adapter';
import { resolveArticlePhotos } from '../src/lib/collectors/photo-scout';
import { getArticleBySlugFromDb, upsertArticle } from '../src/lib/data-store/articles-repo';

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Crude pre-adapter candidate count (same broken patterns we used to collect). */
function countRawBrokenStyle(html: string, pageUrl: string): { raw: number; broken: number } {
  const imgRe = /<img\s+([^>]+)>/gi;
  let m: RegExpExecArray | null;
  let raw = 0;
  let broken = 0;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const picked =
      attrs.match(/data-original=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/srcset=(?:"([^"]+)"|'([^']+)')/i) ||
      attrs.match(/src=(?:"([^"]+)"|'([^']+)')/i);
    if (!picked) continue;
    let s = (picked[1] || picked[2] || '').trim();
    // Old bug simulation: split on any comma (destroys @s_2,w_820)
    if (s.includes(',')) {
      const parts = s.split(',').map((p) => p.trim().split(/\s+/)[0]);
      s = parts[parts.length - 1] || s;
    }
    raw += 1;
    try {
      const abs = new URL(s.replace(/^\/\//, 'https://'), pageUrl).href;
      if (/\/(?:f_auto|h_\d+|o_\d+|w_\d+)(?:\?|$)/i.test(abs) || /\/images\/v2\/t\.png/i.test(abs)) {
        broken += 1;
      }
    } catch {
      broken += 1;
    }
  }
  return { raw, broken };
}

async function main() {
  const slugs = (process.argv.find((a) => a.startsWith('--slugs=')) || '')
    .slice('--slugs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!slugs.length) {
    console.error('Usage: --slugs=a,b,c');
    process.exit(1);
  }
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('ARTICLES_STORE=sqlite required');
    process.exit(1);
  }

  for (const slug of slugs) {
    const article = getArticleBySlugFromDb(slug);
    if (!article) {
      console.log(`SKIP missing ${slug}`);
      continue;
    }
    console.log(`\n=== ${slug} ===`);
    console.log(article.title);
    console.log(article.sourceUrl);
    if (!isIthomePageUrl(article.sourceUrl)) {
      console.log('NOT ITHome — skip adapter measure');
      continue;
    }
    const html = await fetchHtml(article.sourceUrl);
    const before = countRawBrokenStyle(html, article.sourceUrl);
    const adapted = extractIthomeImageCandidates(html, article.sourceUrl);
    const validCdn = adapted.filter((a) => /newsuploadfiles\//i.test(a.url)).length;
    console.log(`BEFORE(adapter): raw_img_attrs=${before.raw} broken_or_placeholder=${before.broken}`);
    console.log(`AFTER(adapter): normalized=${adapted.length} valid_newsupload_cdn=${validCdn}`);
    for (const a of adapted.slice(0, 6)) console.log('  CDN', a.url);

    const report = await resolveArticlePhotos({
      slug: article.slug,
      title: article.title,
      text: `${article.summary}\n\n${article.content}`,
      sourceUrl: article.sourceUrl,
    });
    console.log(
      `V2: candidatesFound=${report.candidatesFound} selected=${report.selected.length} status=${report.entity.status} model=${report.entity.model}`,
    );
    console.log('notes:', report.notes.join(' | '));
    if (report.selected.length) {
      upsertArticle({
        ...article,
        imageUrl: report.selected[0].url,
        images: report.selected,
      });
      console.log(
        'RESULT:',
        report.selected.map((s) => `${s.role}=${s.url}`).join(', '),
      );
    } else {
      console.log('RESULT: NO IMAGE (normal if unconfirmed product photo)');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
