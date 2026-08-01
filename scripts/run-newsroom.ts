import dotenv from 'dotenv';
import chalk from 'chalk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import type { ScoutResult } from '../src/lib/ai/scout';
import type { ReviewResult } from '../src/lib/ai/reviewer';
import type { DraftResult } from '../src/lib/ai/editor';

interface NewsroomCandidate {
  id: string;
  title: string;
  url: string;
  text?: string;
  score?: number;
  by?: string;
  time?: number;
}

interface NewsroomDraftPayload {
  generatedAt: string;
  source: string;
  article: NewsroomCandidate;
  scout: ScoutResult;
  review: ReviewResult;
  draft: DraftResult;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const draftsDir = path.resolve(__dirname, '..', 'drafts');
const DEFAULT_LIMIT = 3;
const SCOUT_SCORE_THRESHOLD = 70;

loadEnvFiles();

function loadEnvFiles(): void {
  const root = process.cwd();
  // Priority: .env.local first (override anything already present, e.g. dotenv/config → .env).
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  // Fallback: fill only missing keys from .env. Without `override` dotenv never clobbers
  // values already present in process.env, so .env.local always wins.
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

function parseLimit(argv: string[]): number {
  const limitFlagIndex = argv.findIndex((arg) => arg === '--limit');
  if (limitFlagIndex >= 0) {
    const raw = argv[limitFlagIndex + 1];
    const parsed = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('Invalid --limit value. Expected a positive integer, e.g. --limit 1');
    }
    return parsed;
  }

  const inline = argv.find((arg) => arg.startsWith('--limit='));
  if (inline) {
    const parsed = Number.parseInt(inline.slice('--limit='.length), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('Invalid --limit value. Expected a positive integer, e.g. --limit=1');
    }
    return parsed;
  }

  return DEFAULT_LIMIT;
}

function parseRssUrl(argv: string[]): string | null {
  const flagIndex = argv.findIndex((arg) => arg === '--rss-url');
  if (flagIndex >= 0 && flagIndex + 1 < argv.length) {
    const val = argv[flagIndex + 1];
    if (val && !val.startsWith('--')) {
      return val;
    }
  }

  const inline = argv.find((arg) => arg.startsWith('--rss-url='));
  if (inline) {
    return inline.slice('--rss-url='.length);
  }

  return null;
}

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) {
    return true;
  }

  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith('your_') ||
    normalized.includes('placeholder') ||
    normalized.includes('changeme') ||
    normalized === 'your-api-key' ||
    normalized === 'your_api_key' ||
    normalized.includes('<your') ||
    normalized.includes('example')
  );
}

interface ApiKeyPresence {
  openRouter: boolean;
}

/** Reports only presence/absence — key values are never read into output. */
function checkApiKeys(): ApiKeyPresence {
  const presence: ApiKeyPresence = {
    openRouter: !isPlaceholderValue(process.env.OPENROUTER_API_KEY),
  };

  console.log(`OPENROUTER_API_KEY: ${presence.openRouter ? 'yes' : 'no'}`);

  return presence;
}

function missingKeyNames(presence: ApiKeyPresence): string[] {
  const missing: string[] = [];
  if (!presence.openRouter) {
    missing.push('OPENROUTER_API_KEY');
  }
  return missing;
}

function createTimestampSlug(date: Date): string {
  return date
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+$/, '')
    .replace('T', '-');
}

function safeSlug(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'hn-story';
}

async function saveDraft(payload: NewsroomDraftPayload): Promise<string> {
  await mkdir(draftsDir, { recursive: true });

  const timestamp = createTimestampSlug(new Date(payload.generatedAt));
  const slug = safeSlug(payload.article.title);
  const filename = `${timestamp}-${slug}.json`;
  const outputPath = path.join(draftsDir, filename);

  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return outputPath;
}

interface PipelineModels {
  scoutModel: string;
  reviewModel: string;
  editorModel: string;
}

interface Pipeline {
  scoutArticle: (title: string, text: string) => Promise<ScoutResult>;
  reviewArticle: (article: NewsroomCandidate) => Promise<ReviewResult>;
  writeDraft: (article: NewsroomCandidate, review: ReviewResult) => Promise<DraftResult>;
}

interface CandidateOutcome {
  title: string;
  score: number | null;
  passed: boolean;
  draftPath: string | null;
  skipReason: string | null;
  error: string | null;
  reviewResult: ReviewResult | null;
}

/** Scout gate first: Reviewer and Editor only run for candidates above the threshold. */
async function processCandidate(
  article: NewsroomCandidate,
  pipeline: Pipeline,
  models: PipelineModels,
  sourceName: string,
): Promise<CandidateOutcome> {
  const outcome: CandidateOutcome = {
    title: article.title,
    score: null,
    passed: false,
    draftPath: null,
    skipReason: null,
    error: null,
    reviewResult: null,
  };

  try {
    console.log(chalk.cyan(`Scouting... ${article.title}`));
    console.log(chalk.gray(`Scout model: ${models.scoutModel}`));
    const scout = await pipeline.scoutArticle(article.title, article.text ?? '');
    outcome.score = scout.score;
    console.log(chalk.gray(`Scout score: ${scout.score}`));
    console.log(chalk.gray(`Scout reason: ${scout.reason}`));

    if (scout.score < SCOUT_SCORE_THRESHOLD) {
      outcome.skipReason = `Scout score ${scout.score} < threshold ${SCOUT_SCORE_THRESHOLD}`;
      console.log(
        chalk.gray(
          `Skipped ${article.title}: ${outcome.skipReason}. Reviewer and Editor not run, no draft created.`,
        ),
      );
      return outcome;
    }

    outcome.passed = true;

    console.log(chalk.yellow(`Reviewing... ${article.title}`));
    console.log(chalk.gray(`Reviewer model: ${models.reviewModel}`));
    const review = await pipeline.reviewArticle(article);
    outcome.reviewResult = review;

    console.log(chalk.magenta(`Writing draft... ${article.title}`));
    console.log(chalk.gray(`Editor model: ${models.editorModel}`));
    const draft = await pipeline.writeDraft(article, review);

    outcome.draftPath = await saveDraft({
      generatedAt: new Date().toISOString(),
      source: sourceName,
      article,
      scout,
      review,
      draft,
    });

    console.log(chalk.green(`Draft saved to ${path.relative(process.cwd(), outcome.draftPath)}`));
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`Failed ${article.title}: ${outcome.error}`));
  }

  return outcome;
}

function printTestSummary(options: {
  outcome: CandidateOutcome;
  models: PipelineModels;
  keys: ApiKeyPresence;
  published: boolean;
  factoryEnabled: boolean;
  force: boolean;
}): void {
  const { outcome, models, keys, published, factoryEnabled, force } = options;

  console.log('');
  console.log(chalk.bold('=== Newsroom test summary ==='));
  console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
  console.log(`Force run: ${force ? 'yes' : 'no'}`);
  console.log('Collectors started: yes');
  console.log('AI started: yes');
  console.log(`Publisher started: ${published ? 'yes' : 'no'}`);
  console.log(`Material: ${outcome.title}`);
  console.log(`OPENROUTER_API_KEY present: ${keys.openRouter ? 'yes' : 'no'}`);
  console.log(`Scout model: ${models.scoutModel}`);
  console.log(`Reviewer model: ${models.reviewModel}`);
  console.log(`Editor model: ${models.editorModel}`);
  console.log(`Score: ${outcome.score ?? 'n/a'} (threshold ${SCOUT_SCORE_THRESHOLD})`);
  console.log(`Passed threshold: ${outcome.passed ? 'yes' : 'no'}`);
  console.log(`Reviewer + Editor run: ${outcome.passed ? 'yes' : 'no'}`);
  console.log(`Skip reason: ${outcome.skipReason ?? 'none'}`);
  console.log(
    `Draft path: ${outcome.draftPath ? path.relative(process.cwd(), outcome.draftPath) : 'none'}`,
  );
  console.log(`Published: ${published ? 'yes' : 'no'}`);
  console.log(`Errors: ${outcome.error ?? 'none'}`);
}

export async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';

  if (!factoryEnabled && !force) {
    console.log('Factory is OFF. No collectors, AI agents or publisher were started.');
    console.log('Factory switch: OFF');
    console.log('Force run: no');
    console.log('Collectors started: no');
    console.log('AI started: no');
    console.log('Publisher started: no');
    process.exitCode = 0;
    return;
  }

  const argv = process.argv.slice(2);
  const limit = parseLimit(argv);
  const rssUrl = parseRssUrl(argv);
  const demoGood = argv.includes('--demo-good');
  const testMode = limit === 1;

  const keys = checkApiKeys();
  const missing = missingKeyNames(keys);
  if (missing.length > 0) {
    console.log('');
    console.log(chalk.bgYellow.black.bold('⚠️ Newsroom остановлен: не хватает ключей API.'));
    console.log(chalk.yellow(`Отсутствуют переменные: ${missing.join(', ')}`));
    console.log(chalk.yellow('Добавь их в .env.local и запусти команду снова.'));
    console.log(
      chalk.gray('Scout / Reviewer / Editor не запускались, драфт не создан, публикации нет.'),
    );
    process.exitCode = 1;
    return;
  }

  // Import AI modules after env load so model constants and key readers see .env.local.
  const { fetchHackerNewsTopStories } = await import('../src/lib/collectors/hn');
  const { scoutArticle } = await import('../src/lib/ai/scout');
  const { reviewArticle } = await import('../src/lib/ai/reviewer');
  const { writeDraft } = await import('../src/lib/ai/editor');

  const models: PipelineModels = {
    scoutModel: process.env.OPENROUTER_SCOUT_MODEL ?? 'deepseek/deepseek-v4-flash:latest',
    reviewModel: process.env.OPENROUTER_REVIEW_MODEL ?? 'google/gemini-2.5-flash-lite',
    editorModel: process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite',
  };
  const pipeline: Pipeline = { scoutArticle, reviewArticle, writeDraft };

  console.log(
    chalk.blue(
      testMode
        ? 'Newsroom test mode: 1 candidate, Scout gate → Reviewer + Editor only if passed'
        : `Newsroom run: up to ${limit} candidates`,
    ),
  );

  if (rssUrl) {
    console.log('Candidate source: RSS');
    console.log(`RSS URL: ${rssUrl}`);
  } else {
    console.log(`Candidate source: ${demoGood ? 'demo-good' : 'Hacker News'}`);
  }

  let articles: NewsroomCandidate[] = [];
  let sourceName = 'hacker-news';

  if (rssUrl) {
    sourceName = 'rss';
    const { fetchRssFeed } = await import('../src/lib/collectors/rss');
    const rssItems = await fetchRssFeed(rssUrl, { limit: 1, sourceName: 'RSS' });
    if (rssItems.length > 0) {
      const item = rssItems[0];
      const time =
        Math.floor(new Date(item.publishedAt).getTime() / 1000) ||
        Math.floor(Date.now() / 1000);
      articles = [
        {
          id: item.id || 'rss-item',
          title: item.title,
          url: item.url,
          text: item.text,
          by: item.sourceName,
          time,
        },
      ];
    }
  } else if (demoGood) {
    sourceName = 'demo-good';
    articles = [
      {
        id: 'demo-good',
        title:
          'Open-source robotic hand learns delicate manipulation using low-cost tactile sensors',
        url: 'https://example.com/open-source-robotic-hand',
        text:
          'Researchers released an open-source robotic hand platform that uses inexpensive tactile sensors and reinforcement learning to perform delicate manipulation tasks. The hardware design, training code, and datasets are publicly available. The project aims to reduce the cost of robotics research and make reproducible experiments possible for small laboratories and independent engineers.',
        by: 'demo-good',
        time: Math.floor(Date.now() / 1000),
        score: 100,
      },
    ];
  } else {
    const hnStories = await fetchHackerNewsTopStories(limit);
    articles = hnStories.map((story) => ({
      id: story.id,
      title: story.title,
      url: story.url,
      text: story.text,
      score: story.score,
    }));
  }

  if (articles.length === 0) {
    console.log(
      chalk.red(
        rssUrl ? 'No RSS items returned.' : 'No Hacker News stories returned.',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const maxDrafts = testMode ? 1 : limit;
  const outcomes: CandidateOutcome[] = [];
  let draftsCreated = 0;

  for (const article of articles) {
    if (draftsCreated >= maxDrafts) {
      break;
    }

    const outcome = await processCandidate(article, pipeline, models, sourceName);
    outcomes.push(outcome);

    if (outcome.draftPath) {
      draftsCreated += 1;
    }
  }

  let published = false;
  if (draftsCreated > 0) {
    console.log(chalk.green('Executing publisher (npm run publish:latest)...'));
    try {
      execSync(force ? 'npm run publish:latest -- --force' : 'npm run publish:latest', { stdio: 'inherit' });
      published = true;
    } catch (err) {
      console.error(
        chalk.red(`Publisher failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      process.exitCode = 1;
    }
  }

  if (testMode) {
    printTestSummary({ outcome: outcomes[0], models, keys, published, factoryEnabled, force });
  } else {
    console.log('');
    console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
    console.log(`Force run: ${force ? 'yes' : 'no'}`);
    console.log('Collectors started: yes');
    console.log('AI started: yes');
    console.log(`Publisher started: ${published ? 'yes' : 'no'}`);
  }

  if (outcomes.some((outcome) => outcome.error !== null)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Newsroom run failed: ${message}`));
  process.exitCode = 1;
});
