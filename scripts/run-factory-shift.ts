import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

interface JournalData {
  processedUrls: string[];
  processedIds: string[];
  entries: Array<{ id: string; url: string; title: string; processedAt: string; status: string }>;
}

const SOURCES = [
  'https://hackaday.com/feed/',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://techcrunch.com/feed/',
];

function parseArgs(argv: string[]) {
  let hours = 3;
  let intervalMin = 20;
  let maxAiRuns = 8;
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
    else if (arg.startsWith('--max-ai-runs=')) maxAiRuns = parseInt(arg.split('=')[1], 10) || 8;
    else if (arg === '--max-ai-runs' && argv[i + 1]) maxAiRuns = parseInt(argv[++i], 10) || 8;
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

  const { urls: existingUrls, ids: existingIds, journal } = await loadExistingUrlsAndIds(journalPath, articlesPath);

  console.log(chalk.bold('=== Factory Shift Runner ==='));
  console.log(`Config: hours=${options.hours}, intervalMin=${options.intervalMin}, maxAiRuns=${options.maxAiRuns}, maxPublished=${options.maxPublished}`);
  console.log(`Mode: dryRun=${options.dryRun ? 'YES' : 'NO'}, force=${options.force ? 'YES' : 'NO'}`);
  console.log(`Safety Switch: ${factoryEnabled ? 'ON' : 'OFF'}`);

  let aiRuns = 0;
  let publishedCount = 0;
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

  console.log(`Found ${candidates.length} candidate items matching criteria.\n`);

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
    console.log(`AI calls made: 0 (dry-run mode)`);
    console.log(`Drafts written: 0`);
    console.log(`Articles published: 0`);
    console.log(`Journal updated: NO (dry-run)`);
    console.log(`Stop reason: dry-run complete`);
    return;
  }

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

    journal.processedUrls.push(item.url);
    journal.processedIds.push(item.id);
    journal.entries.push({
      id: item.id,
      url: item.url,
      title: item.title,
      processedAt: new Date().toISOString(),
      status: 'processed'
    });
  }

  if (!options.dryRun) {
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
  }

  console.log('\n' + chalk.bold('=== Shift Summary ==='));
  console.log(`Time elapsed: ${((Date.now() - startTime) / 1000).toFixed(2)}s / ${options.hours}h`);
  console.log(`AI calls made: ${aiRuns}`);
  console.log(`Articles published: ${publishedCount}`);
  console.log(`Consecutive errors: ${consecutiveErrors}`);
}

main().catch((err) => {
  console.error(chalk.red(`Shift runner failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 1;
});
