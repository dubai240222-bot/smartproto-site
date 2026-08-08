import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { scoutArticle, ScoutResult, SCOUT_SCORE_THRESHOLD } from '../src/lib/ai/scout';
import { reviewArticle, ReviewResult } from '../src/lib/ai/reviewer';
import { writeDraft, DraftResult } from '../src/lib/ai/editor';
import { hardRejectTopic } from '../src/lib/ai/hard-reject';
import { filterRemovedArticles, isRemovedSlug } from '../src/lib/removed-slugs';
import { stampAuthorForPipeline } from '../src/lib/authors';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

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
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
  author?: string;
  authorDesk?: string;
  agentId?: string;
}

const SOURCES = [
  'https://hackaday.com/feed/',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://techcrunch.com/feed/',
];

const SCOUT_THRESHOLD = SCOUT_SCORE_THRESHOLD;

function parseArgs(argv: string[]) {
  let hours = 3;
  let intervalMin = 20;
  let maxAiRuns = 10;
  let maxPublished = 5;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--force') force = true;
    else if (arg.startsWith('--hours=')) hours = parseFloat(arg.split('=')[1]) || 3;
    else if (arg === '--hours' && argv[i + 1]) hours = parseFloat(argv[++i]) || 3;
    else if (arg.startsWith('--interval-min=')) intervalMin = parseFloat(arg.split('=')[1]) || 20;
    else if (arg === '--interval-min' && argv[i + 1]) intervalMin = parseFloat(argv[++i]) || 20;
    else if (arg.startsWith('--max-ai-runs=')) maxAiRuns = parseInt(arg.split('=')[1], 10) || 10;
    else if (arg === '--max-ai-runs' && argv[i + 1]) maxAiRuns = parseInt(argv[++i], 10) || 10;
    else if (arg.startsWith('--max-published=')) maxPublished = parseInt(arg.split('=')[1], 10) || 5;
    else if (arg === '--max-published' && argv[i + 1]) maxPublished = parseInt(argv[++i], 10) || 5;
  }

  return { hours, intervalMin, maxAiRuns, maxPublished, dryRun, force };
}

function isTestOrDemo(item: { id: string; url: string; title?: string }): boolean {
  const lowerId = (item.id || '').toLowerCase();
  const lowerUrl = (item.url || '').toLowerCase();
  if (lowerId === 'demo-good' || lowerUrl.includes('example.com')) return true;
  if (lowerId.includes('test') || lowerId.includes('demo') || lowerId.includes('mock')) return true;
  if (lowerUrl.includes('test') || lowerUrl.includes('demo') || lowerUrl.includes('mock')) return true;
  return false;
}

function transliterateCyrillic(text: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return text.toLowerCase().split('').map((c) => map[c] || c).join('');
}

function generateSlug(title: string, englishTitle?: string): string {
  const source = englishTitle || transliterateCyrillic(title);
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || `article-${Date.now()}`;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 150));
  return `${minutes} мин`;
}

function generateSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 200) return trimmed;
  const periodIndex = trimmed.indexOf('.', 50);
  if (periodIndex > 0 && periodIndex <= 200) {
    return trimmed.slice(0, periodIndex + 1);
  }
  return `${trimmed.slice(0, 197)}...`;
}

async function loadExistingUrlsAndIds(journalPath: string, articlesPath: string) {
  const urls = new Set<string>();
  const ids = new Set<string>();
  let journal: JournalData = { processedUrls: [], processedIds: [], entries: [] };

  try {
    const articlesRaw = await readFile(articlesPath, 'utf8');
    const articles = JSON.parse(articlesRaw);
    if (Array.isArray(articles)) {
      for (const a of articles) {
        if (a.sourceUrl) urls.add(a.sourceUrl);
        if (a.url) urls.add(a.url);
        if (a.id) ids.add(String(a.id));
        if (a.slug) ids.add(String(a.slug));
      }
    }
  } catch {}

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
  } catch {}

  return { urls, ids, journal };
}

async function main(): Promise<void> {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';
  if (!factoryEnabled && !options.force) {
    console.log('Factory switch: OFF. SMARTPROTO_FACTORY_ENABLED is not set to true. Quiet stop.');
    return;
  }

  const root = process.cwd();
  const journalPath = path.resolve(root, 'data', 'factory-journal.json');
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');

  const { urls: existingUrls, ids: existingIds, journal } = await loadExistingUrlsAndIds(journalPath, articlesPath);

  console.log(chalk.bold('=== Factory Shift Runner ==='));
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log(`Config: hours=${options.hours}, intervalMin=${options.intervalMin}, maxAiRuns=${options.maxAiRuns}, maxPublished=${options.maxPublished}`);
  console.log(`Mode: dryRun=${options.dryRun ? 'YES' : 'NO'}, force=${options.force ? 'YES' : 'NO'}`);
  console.log(`Safety Switch: ${factoryEnabled ? 'ON' : 'OFF'}`);

  let aiRuns = 0;
  let publishedCount = 0;
  let rejectedCount = 0;
  let consecutiveErrors = 0;
  const startTime = Date.now();
  const maxDurationMs = options.hours * 3600 * 1000;

  console.log(`\nFetching RSS feeds from ${SOURCES.length} sources...`);
  const candidates: RssItem[] = [];

  for (const src of SOURCES) {
    try {
      const items = await fetchRssFeed(src, { limit: 10 });
      for (const item of items) {
        if (!existingUrls.has(item.url) && !existingIds.has(item.id) && !isTestOrDemo(item)) {
          candidates.push(item);
        }
      }
    } catch (err) {
      console.error(chalk.yellow(`Failed to fetch ${src}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  console.log(`Found ${candidates.length} new candidate items matching criteria.\n`);

  if (options.dryRun) {
    console.log(chalk.cyan.bold('--- Candidate List (Dry-Run) ---'));
    if (candidates.length === 0) {
      console.log('No new candidates found.');
    } else {
      candidates.forEach((item, index) => {
        console.log(`${index + 1}. [${item.sourceName}] ${item.title}`);
        console.log(`   URL: ${item.url}`);
        console.log(`   Published: ${item.publishedAt}`);
      });
    }

    console.log('\n' + chalk.bold('=== Shift Summary ==='));
    console.log(`Time elapsed: ${((Date.now() - startTime) / 1000).toFixed(2)}s / ${options.hours}h`);
    console.log(`Candidates evaluated: ${candidates.length}`);
    console.log(`AI calls made: 0 (dry-run mode)`);
    console.log(`Drafts written: 0`);
    console.log(`Articles published: 0`);
    console.log(`Journal updated: NO (dry-run)`);
    console.log(`Stop reason: dry-run complete`);
    return;
  }

  const articlesContent = await readFile(articlesPath, 'utf8').catch(() => '[]');
  const articles: Article[] = JSON.parse(articlesContent.replace(/^\uFEFF/, ''));

  for (const item of candidates) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxDurationMs) {
      console.log(chalk.yellow(`Stop condition met: shift time limit reached (${options.hours}h).`));
      break;
    }
    if (aiRuns >= options.maxAiRuns) {
      console.log(chalk.yellow(`Stop condition met: max AI runs reached (${options.maxAiRuns}).`));
      break;
    }
    if (publishedCount >= options.maxPublished) {
      console.log(chalk.yellow(`Stop condition met: max published articles reached (${options.maxPublished}).`));
      break;
    }
    if (consecutiveErrors >= 3) {
      console.log(chalk.red('Stop condition met: 3 consecutive errors occurred.'));
      break;
    }

    console.log(chalk.cyan(`\n--- Candidate: [${item.sourceName}] ${item.title} ---`));
    console.log(`URL: ${item.url}`);

    try {
      const topicGate = hardRejectTopic(item.title, item.text);
      if (topicGate.reject) {
        console.log(chalk.yellow(`Hard reject (non-buyable): ${topicGate.reason}`));
        rejectedCount++;
        journal.processedUrls.push(item.url);
        journal.processedIds.push(item.id);
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          scoutScore: 0,
          reason: topicGate.reason,
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        continue;
      }

      // 1. Scout
      console.log(chalk.gray('Running Scout agent...'));
      const scout: ScoutResult = await scoutArticle(item.title, item.text);
      aiRuns++;
      console.log(`Scout Score: ${scout.score} / 100 (Threshold: ${SCOUT_THRESHOLD})`);
      console.log(`Scout Reason: ${scout.reason}`);

      journal.processedUrls.push(item.url);
      journal.processedIds.push(item.id);

      if (!scout.interesting || scout.score < SCOUT_THRESHOLD) {
        console.log(chalk.yellow(`Candidate rejected by Scout (score ${scout.score} < ${SCOUT_THRESHOLD}).`));
        rejectedCount++;
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          scoutScore: scout.score,
          reason: scout.reason,
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        continue;
      }

      // Candidate passed Scout!
      console.log(chalk.green.bold(`Candidate passed Scout threshold! Running Reviewer & Editor...`));

      // 2. Reviewer
      console.log(chalk.gray('Running Reviewer agent...'));
      const review: ReviewResult = await reviewArticle(item);
      aiRuns++;

      if (/^REJECT\b/i.test(review.technicalVerdict)) {
        console.log(chalk.yellow(`Reviewer hard-reject: ${review.technicalVerdict}`));
        rejectedCount++;
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          scoutScore: scout.score,
          reason: review.technicalVerdict,
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        continue;
      }

      // 3. Editor
      console.log(chalk.gray('Running Editor agent...'));
      const draft: DraftResult = await writeDraft(item, review);
      aiRuns++;

      if (
        draft.title.trim().toUpperCase() === 'REJECT' ||
        draft.tags.some((t) => t.toLowerCase() === '#reject') ||
        draft.text.trim().toLowerCase() === 'off-topic'
      ) {
        console.log(chalk.yellow('Editor hard-reject: non-buyable / off-topic'));
        rejectedCount++;
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          scoutScore: scout.score,
          reason: 'editor hard-reject: non-buyable',
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        continue;
      }

      // 4. Image Extraction
      console.log(chalk.gray('Extracting original lead image...'));
      const imageUrl = (await extractArticleImage(item.url, draft.title)) || item.imageUrl;

      // 5. Generate Article Object
      const slug = generateSlug(draft.title, item.title);
      if (isRemovedSlug(slug)) {
        console.log(chalk.yellow(`Skipped denylisted slug: ${slug}`));
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          scoutScore: scout.score,
          reason: 'denylisted slug',
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        continue;
      }
      const category = draft.tags.slice(0, 2).map((t) => t.toUpperCase()).join(' / ');
      const summary = generateSummary(draft.text);
      const readTime = estimateReadTime(draft.text);
      const publishedAt = new Date().toISOString();

      const newArticle: Article = {
        id: slug,
        slug,
        title: draft.title,
        category,
        summary,
        content: draft.text,
        sourceUrl: item.url,
        publishedAt,
        readTime,
        ...(imageUrl ? { imageUrl } : {}),
        ...stampAuthorForPipeline('factory-shift', { sourceUrl: item.url, slug: slug }),
      };

      // Save Draft Payload
      await mkdir(draftsDir, { recursive: true });
      const draftPath = path.join(draftsDir, `${Date.now()}-${slug}.json`);
      await writeFile(
        draftPath,
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
          2
        ),
        'utf8'
      );

      // Append to articles.json (strip any denylisted leftovers first)
      const cleaned = filterRemovedArticles(
        articles.filter(
          (a) => a.id !== newArticle.id && a.slug !== newArticle.slug && a.sourceUrl !== newArticle.sourceUrl,
        ),
      );
      cleaned.push(newArticle);
      articles.length = 0;
      articles.push(...cleaned);
      await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');

      // Update Journal
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

      publishedCount++;
      consecutiveErrors = 0;

      console.log(chalk.green.bold(`Successfully published: "${draft.title}" (slug: ${slug})`));

      // Auto-commit & push to git main
      try {
        console.log(chalk.blue('Executing git commit & push...'));
        execSync('git add src/data/articles.json data/factory-journal.json drafts/', { stdio: 'inherit' });
        execSync(`git commit -m "feat(newsroom): auto-publish ${draft.title}"`, { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log(chalk.green('Git commit and push succeeded!'));
      } catch (gitErr) {
        console.error(
          chalk.red(`Git push failed during auto-publish: ${gitErr instanceof Error ? gitErr.message : String(gitErr)}`)
        );
      }
    } catch (err) {
      consecutiveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error processing candidate ${item.title}: ${msg}`));
      journal.entries.push({
        id: item.id,
        url: item.url,
        title: item.title,
        processedAt: new Date().toISOString(),
        status: 'error',
        reason: msg,
      });
      await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
    }
  }

  console.log('\n' + chalk.bold('=== Factory Shift Summary ==='));
  console.log(`End Time: ${new Date().toISOString()}`);
  console.log(`Time elapsed: ${((Date.now() - startTime) / 1000).toFixed(2)}s / ${options.hours}h`);
  console.log(`Candidates evaluated: ${candidates.length}`);
  console.log(`AI calls made: ${aiRuns}`);
  console.log(`Articles published: ${publishedCount}`);
  console.log(`Candidates rejected: ${rejectedCount}`);
  console.log(`Consecutive errors: ${consecutiveErrors}`);
}

main().catch((err) => {
  console.error(chalk.red(`Shift runner failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 1;
});
