/**
 * SP-A-031-R1 — One newsroom tick (no multi-hour loops).
 *
 * RSS → hardReject (novelty / buyable) → Scout → Reviewer → Editor →
 * append articles.json + update factory-journal.json → exit.
 *
 * Git commit/push is intentionally left to GitHub Actions (or the operator).
 * Interim autonomy: GHA cron every 10m. Stage B (Vercel Cron → Postgres) remains planned.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, type RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { scoutArticle, SCOUT_SCORE_THRESHOLD } from '../src/lib/ai/scout';
import { reviewArticle } from '../src/lib/ai/reviewer';
import { writeDraft } from '../src/lib/ai/editor';
import { hardRejectTopic, looksBuyableGadget } from '../src/lib/ai/hard-reject';
import { filterRemovedArticles, isRemovedSlug } from '../src/lib/removed-slugs';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

const SOURCES: [string, string][] = [
  ['Yanko Design', 'https://www.yankodesign.com/feed/'],
  ['New Atlas', 'https://newatlas.com/index.rss'],
  ['Hackaday', 'https://hackaday.com/blog/feed/'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Engadget', 'https://www.engadget.com/rss.xml'],
  ['9to5Google', 'https://9to5google.com/feed/'],
  ['Android Authority', 'https://www.androidauthority.com/feed'],
];

interface JournalEntry {
  id: string;
  url: string;
  title: string;
  processedAt: string;
  status: 'published' | 'rejected' | 'error';
  scoutScore?: number;
  reason?: string;
  slug?: string;
}

interface JournalData {
  processedUrls: string[];
  processedIds: string[];
  entries: JournalEntry[];
}

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags?: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
}

function parseArgs(argv: string[]) {
  return { force: argv.includes('--force'), dryRun: argv.includes('--dry-run') };
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || `article-${Date.now()}`
  );
}

function summaryOf(text: string): string {
  const t = text.trim();
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 150))} мин`;
}

async function loadState(journalPath: string, articlesPath: string) {
  const urls = new Set<string>();
  const ids = new Set<string>();
  let journal: JournalData = { processedUrls: [], processedIds: [], entries: [] };
  let articles: Article[] = [];

  try {
    const raw = await readFile(articlesPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (Array.isArray(parsed)) {
      articles = parsed as Article[];
      for (const a of articles) {
        if (a.sourceUrl) urls.add(a.sourceUrl);
        if (a.id) ids.add(String(a.id));
        if (a.slug) ids.add(String(a.slug));
      }
    }
  } catch {
    /* empty */
  }

  try {
    const journalRaw = await readFile(journalPath, 'utf8');
    const parsed = JSON.parse(journalRaw);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.processedUrls)) {
        parsed.processedUrls.forEach((u: string) => urls.add(u));
        journal.processedUrls = parsed.processedUrls;
      }
      if (Array.isArray(parsed.processedIds)) {
        parsed.processedIds.forEach((i: string) => ids.add(i));
        journal.processedIds = parsed.processedIds;
      }
      if (Array.isArray(parsed.entries)) journal.entries = parsed.entries;
    }
  } catch {
    /* empty */
  }

  return { urls, ids, journal, articles };
}

async function markRejected(
  journal: JournalData,
  journalPath: string,
  item: RssItem,
  reason: string,
  scoutScore?: number,
): Promise<void> {
  if (!journal.processedUrls.includes(item.url)) journal.processedUrls.push(item.url);
  if (!journal.processedIds.includes(item.id)) journal.processedIds.push(item.id);
  journal.entries.push({
    id: item.id,
    url: item.url,
    title: item.title,
    processedAt: new Date().toISOString(),
    status: 'rejected',
    scoutScore,
    reason,
  });
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';
  if (!factoryEnabled && !options.force) {
    console.log('Factory switch: OFF. SMARTPROTO_FACTORY_ENABLED is not set to true. Quiet stop.');
    return;
  }

  if (!process.env.OPENROUTER_API_KEY?.trim() && !options.dryRun) {
    console.error('OPENROUTER_API_KEY is missing. Abort.');
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const journalPath = path.resolve(root, 'data', 'factory-journal.json');
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');

  const { urls, ids, journal, articles } = await loadState(journalPath, articlesPath);

  console.log(chalk.bold('=== Newsroom Tick (SP-A-031) ==='));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Factory: ${factoryEnabled ? 'ON' : 'OFF (forced)'}`);
  console.log(`Mode: dryRun=${options.dryRun ? 'YES' : 'NO'}`);

  const candidates: RssItem[] = [];
  for (const [name, feedUrl] of SOURCES) {
    try {
      const items = await fetchRssFeed(feedUrl, { limit: 12, sourceName: name });
      for (const item of items) {
        if (!item.url || !item.title) continue;
        if (urls.has(item.url) || ids.has(item.id)) continue;
        const slug = slugify(item.title);
        if (ids.has(slug) || isRemovedSlug(slug)) continue;
        if (!looksBuyableGadget(item.title, item.text || '', name)) continue;
        const gate = hardRejectTopic(item.title, item.text || '');
        if (gate.reject) continue;
        candidates.push(item);
      }
      console.log(chalk.gray(`  ${name}: ok`));
    } catch (err) {
      console.log(
        chalk.yellow(`  ${name}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }

  candidates.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  console.log(`New gadget candidates after filters: ${candidates.length}`);

  const item = candidates[0];
  if (!item) {
    console.log('No new candidate — tick idle exit 0.');
    return;
  }

  console.log(chalk.cyan(`Pick: [${item.sourceName}] ${item.title}`));
  console.log(chalk.gray(item.url));

  if (options.dryRun) {
    console.log(chalk.cyan('Dry-run: would process this candidate. Stop.'));
    return;
  }

  try {
    console.log(chalk.gray('Scout...'));
    const scout = await scoutArticle(item.title, item.text || item.title);
    console.log(`Scout: score=${scout.score} interesting=${scout.interesting} — ${scout.reason}`);

    if (!scout.interesting || scout.score < SCOUT_SCORE_THRESHOLD) {
      console.log(chalk.yellow(`Scout reject (score ${scout.score} < ${SCOUT_SCORE_THRESHOLD}).`));
      await markRejected(journal, journalPath, item, scout.reason, scout.score);
      return;
    }

    const sourcePayload = {
      title: item.title,
      text: item.text || item.title,
      url: item.url,
      sourceName: item.sourceName,
    };

    console.log(chalk.gray('Reviewer...'));
    const review = await reviewArticle(sourcePayload);
    if (/^REJECT\b/i.test(review.technicalVerdict)) {
      console.log(chalk.yellow(`Reviewer reject: ${review.technicalVerdict}`));
      await markRejected(journal, journalPath, item, review.technicalVerdict, scout.score);
      return;
    }

    console.log(chalk.gray('Editor...'));
    const draft = await writeDraft(sourcePayload, review);
    if (
      draft.title.trim().toUpperCase() === 'REJECT' ||
      draft.tags.some((t) => t.toLowerCase() === '#reject') ||
      draft.text.trim().toLowerCase() === 'off-topic'
    ) {
      console.log(chalk.yellow('Editor hard-reject'));
      await markRejected(journal, journalPath, item, 'editor hard-reject', scout.score);
      return;
    }

    let imageUrl = item.imageUrl;
    try {
      if (!imageUrl) imageUrl = (await extractArticleImage(item.url, draft.title)) || undefined;
    } catch {
      /* optional */
    }

    const slug = slugify(item.title);
    if (isRemovedSlug(slug) || ids.has(slug)) {
      console.log(chalk.yellow(`Skipped denylisted/seen slug: ${slug}`));
      await markRejected(journal, journalPath, item, `slug blocked: ${slug}`, scout.score);
      return;
    }

    const publishedAt = new Date().toISOString();
    const article: Article = {
      id: slug,
      slug,
      title: draft.title,
      category: 'ГАДЖЕТ / ПОЛЕЗНО',
      tags: draft.tags,
      summary: summaryOf(draft.text),
      content: draft.text,
      sourceUrl: item.url,
      publishedAt,
      readTime: estimateReadTime(draft.text),
      ...(imageUrl ? { imageUrl } : {}),
    };

    const deduped = filterRemovedArticles(
      articles.filter(
        (a) => a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
      ),
    );
    deduped.unshift(article);
    await writeFile(articlesPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');

    await mkdir(draftsDir, { recursive: true });
    await writeFile(
      path.join(draftsDir, `${Date.now()}-${slug}.json`),
      JSON.stringify(
        {
          generatedAt: publishedAt,
          source: item.sourceName,
          article: item,
          scout,
          review,
          draft: { ...draft, imageUrl },
        },
        null,
        2,
      ),
      'utf8',
    );

    if (!journal.processedUrls.includes(item.url)) journal.processedUrls.push(item.url);
    if (!journal.processedIds.includes(item.id)) journal.processedIds.push(item.id);
    journal.entries.push({
      id: item.id,
      url: item.url,
      title: draft.title,
      processedAt: publishedAt,
      status: 'published',
      scoutScore: scout.score,
      reason: scout.reason,
      slug,
    });
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');

    console.log(chalk.green.bold(`Published: "${draft.title}" (slug: ${slug})`));
    console.log(`Live path: /articles/${slug}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Tick error: ${msg}`));
    journal.entries.push({
      id: item.id,
      url: item.url,
      title: item.title,
      processedAt: new Date().toISOString(),
      status: 'error',
      reason: msg,
    });
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(chalk.red(`Newsroom tick failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 1;
});
