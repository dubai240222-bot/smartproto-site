/**
 * SP-A-088 — assign unique local thematic photos + Editor rewrite for ~18 non-Chief AUTO articles.
 *
 *   ARTICLES_STORE=sqlite SMARTPROTO_DB_PATH=... npx tsx scripts/spa088-fix-visuals-rewrite.ts
 *   npx tsx scripts/spa088-fix-visuals-rewrite.ts --dry-run
 *   npx tsx scripts/spa088-fix-visuals-rewrite.ts --photos-only
 *   npx tsx scripts/spa088-fix-visuals-rewrite.ts --rewrite-only
 */
import 'dotenv/config';
import { writeDraft } from '../src/lib/ai/editor';
import { getThematicFallback } from '../src/lib/collectors/image-extractor';
import { downloadImagesLocally } from '../src/lib/collectors/photo-scout';
import {
  getArticleBySlugFromDb,
  upsertArticle,
  type StoredArticle,
} from '../src/lib/data-store/articles-repo';

/** Prefer empty-image + thin AUTO pieces. Never rewrite Chief. */
const REWRITE_SLUGS = [
  'china-5g-5g',
  'mit-simulator-lets-users-design-wide-range-of-functional-soft-robots',
  'china-9-5-6',
  'optical-tech-would-update-a-robot-s-ai-on-the-fly',
  'tacta-systems-takes-aim-at-high-skilled-manufacturing-work-with-tactabot',
  'giving-robots-a-better-feel-for-object-manipulation',
  'china-id-era-5s',
  'china-pixel-11-pro',
  'using-artificial-intelligence-to-improve-early-breast-cancer-detection',
  'detecting-walking-speed-with-wireless-signals',
  'teaching-ai-to-create-visuals-with-more-common-sense',
  'china-tt-8-13',
  'narwal-freo-20-robot-vacuum-and-mop',
  'anycubic-photon-p1-max-3d-printer',
  'china-g27q3',
  'china-matepad-edge',
  'china-elite-mini-m2-air-304',
  'casio-just-turned-its-wild-ring-watch-into-an-actual-smart-ring-with-health-trac',
];

/** Photo-only (Chief or extra empty) — do not rewrite text. */
const PHOTO_ONLY_SLUGS = ['ai-openai-gpt-5-6-cyber'];

function isChief(a: StoredArticle): boolean {
  const aid = a.agentId || '';
  const slug = a.slug || '';
  return aid.startsWith('chief') || slug.startsWith('chief-');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(text: string): string {
  const minutes = Math.max(1, Math.ceil(wordCount(text) / 150));
  return `${minutes} мин`;
}

function makeSummary(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 220) return clean;
  const cut = clean.slice(0, 220);
  const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (last > 80) return cut.slice(0, last + 1).trim();
  return `${cut.trim()}…`;
}

function parseArgs(argv: string[]) {
  const slugsArg = argv.find((a) => a.startsWith('--slugs='));
  const slugs = slugsArg
    ? slugsArg
        .slice('--slugs='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return {
    dryRun: argv.includes('--dry-run'),
    photosOnly: argv.includes('--photos-only'),
    rewriteOnly: argv.includes('--rewrite-only'),
    slugs,
  };
}

async function fetchSourceSnippet(url?: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SmartProtoBot/1.0; +https://smartproto.net)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 6000);
  } catch {
    return '';
  }
}

async function assignThematicPhoto(article: StoredArticle, force = false): Promise<StoredArticle> {
  const hasLocal = (article.imageUrl || '').startsWith('/api/media/');
  if (hasLocal && !force) {
    console.log(`  PHOTO keep local ${article.imageUrl}`);
    return article;
  }
  const thematic = getThematicFallback(
    `${article.title} ${article.summary || ''}`,
    article.category,
    article.slug,
  );
  if (!thematic) {
    console.log('  PHOTO no thematic');
    return article;
  }
  const downloaded = await downloadImagesLocally(article.slug, [{ url: thematic, role: 'hero' }]);
  if (!downloaded.length) {
    console.log(`  PHOTO download failed url=${thematic.slice(0, 80)}`);
    return article;
  }
  const next: StoredArticle = {
    ...article,
    imageUrl: downloaded[0].url,
    images: downloaded,
  };
  console.log(`  PHOTO ${downloaded[0].url} ← ${thematic.slice(0, 70)}`);
  return next;
}

async function rewriteArticle(article: StoredArticle): Promise<StoredArticle | null> {
  if (isChief(article)) {
    console.log('  REWRITE skip chief');
    return null;
  }
  const mode =
    /robot|ai|ии|research|лаборатор|симулятор|оптич|манипул|рак|diagnos|ganpaint|wi.?gait|walking/i.test(
      `${article.title}\n${article.content}`,
    )
      ? ('ai_radar' as const)
      : ('gadget' as const);

  const sourceExtra = await fetchSourceSnippet(article.sourceUrl);
  const draft = await writeDraft(
    {
      format: 'article',
      mode,
      title: article.title,
      sourceName: article.sourceUrl || 'source',
      text: [article.title, article.summary, article.content, sourceExtra]
        .filter(Boolean)
        .join('\n\n'),
    },
    { technicalVerdict: 'PASS: existing published AUTO article — deepen to editorial standard' },
  );

  if (draft.title === 'REJECT') {
    console.log('  REWRITE REJECT — left unchanged');
    return null;
  }
  const words = wordCount(draft.text);
  console.log(`  REWRITE words=${words} title=${draft.title.slice(0, 70)}`);
  if (words < 120) {
    console.log('  REWRITE too thin — left unchanged');
    return null;
  }
  return {
    ...article,
    title: draft.title.slice(0, 120),
    content: draft.text,
    summary: makeSummary(draft.text),
    tags: draft.tags?.length ? draft.tags : article.tags,
    readTime: estimateReadTime(draft.text),
    // Preserve pipeline identity — do not stamp as Chief.
    agentId: article.agentId,
    author: article.author,
    authorDesk: article.authorDesk,
  };
}

async function main() {
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('Set ARTICLES_STORE=sqlite and SMARTPROTO_DB_PATH');
    process.exit(1);
  }

  const { dryRun, photosOnly, rewriteOnly, slugs } = parseArgs(process.argv.slice(2));
  console.log('SP-A-088 fix visuals + rewrite', { dryRun, photosOnly, rewriteOnly, slugs: slugs.length });

  const rewriteList = slugs.length ? slugs : REWRITE_SLUGS;
  const photoTargets = [...new Set([...rewriteList, ...(slugs.length ? [] : PHOTO_ONLY_SLUGS)])];
  let photoOk = 0;
  let rewriteOk = 0;
  let rewriteSkip = 0;

  for (const slug of photoTargets) {
    console.log(`\n=== ${slug} ===`);
    const article = getArticleBySlugFromDb(slug);
    if (!article) {
      console.log('  MISSING');
      continue;
    }
    console.log(`  agent=${article.agentId || 'none'} wc=${wordCount(article.content)} img=${article.imageUrl || 'EMPTY'}`);

    let next = article;
    const empty = !(article.imageUrl || '').trim();
    const needsPhoto =
      !rewriteOnly && (empty || PHOTO_ONLY_SLUGS.includes(slug) || slug.startsWith('casio-'));

    if (needsPhoto) {
      next = await assignThematicPhoto(next, true);
      if (next.imageUrl !== article.imageUrl) photoOk += 1;
    }

    const shouldRewrite = !photosOnly && rewriteList.includes(slug) && !isChief(next);
    if (shouldRewrite) {
      try {
        const rewritten = await rewriteArticle(next);
        if (rewritten) {
          next = rewritten;
          rewriteOk += 1;
        } else {
          rewriteSkip += 1;
        }
      } catch (err) {
        rewriteSkip += 1;
        console.log('  REWRITE ERROR', err instanceof Error ? err.message : String(err));
      }
    }

    if (!dryRun && next !== article) {
      upsertArticle(next);
      console.log('  SAVED');
    } else if (dryRun) {
      console.log('  DRY — not saved');
    }
  }

  console.log('\nDONE', { photoOk, rewriteOk, rewriteSkip, dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
