import 'dotenv/config';

import chalk from 'chalk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchHackerNewsTopStories } from '../src/lib/collectors/hn';
import { scoutArticle } from '../src/lib/ai/scout';
import { reviewArticle } from '../src/lib/ai/reviewer';
import { writeDraft } from '../src/lib/ai/editor';

interface NewsroomDraftPayload {
  generatedAt: string;
  source: string;
  article: Awaited<ReturnType<typeof fetchHackerNewsTopStories>>[number];
  scout: Awaited<ReturnType<typeof scoutArticle>>;
  review: Awaited<ReturnType<typeof reviewArticle>>;
  draft: Awaited<ReturnType<typeof writeDraft>>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const draftsDir = path.resolve(__dirname, '..', 'drafts');

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

export async function main(): Promise<void> {
  const limit = 12;
  const articles = await fetchHackerNewsTopStories(limit);

  for (const article of articles) {
    try {
      console.log(chalk.cyan(`Scouting... ${article.title}`));
      const scout = await scoutArticle(article.title, article.text ?? '');

      if (scout.score < 70) {
        console.log(chalk.gray(`Skipped ${article.title} (${scout.score})`));
        continue;
      }

      console.log(chalk.yellow(`Reviewing... ${article.title}`));
      const review = await reviewArticle(article);
      const draft = await writeDraft(article, review);
      const generatedAt = new Date().toISOString();

      const outputPath = await saveDraft({
        generatedAt,
        source: 'hacker-news',
        article,
        scout,
        review,
        draft,
      });

      console.log(chalk.green(`Draft saved to ${path.relative(process.cwd(), outputPath)}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`Failed ${article.title}: ${message}`));
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Newsroom run failed: ${message}`));
  process.exitCode = 1;
});
