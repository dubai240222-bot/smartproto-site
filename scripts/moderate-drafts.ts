import 'dotenv/config';

import chalk from 'chalk';
import prompts from 'prompts';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Article } from '../src/data/articles';

type DraftAction = 'approve' | 'delete' | 'skip';

interface RawRecord {
  [key: string]: unknown;
}

interface DraftPreview {
  title: string;
  scoutScore: number;
  reason: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const draftsDir = path.resolve(__dirname, '..', 'drafts');
const articlesPath = path.resolve(__dirname, '..', 'src', 'data', 'articles.json');

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function slugify(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : `article-${Date.now()}`;
}

function estimateReadTime(content: string): string {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeContent(content: string): string {
  const plainText = stripMarkdown(content);
  if (plainText.length <= 240) {
    return plainText;
  }

  return `${plainText.slice(0, 237).trimEnd()}...`;
}

function buildSourceUrl(source: RawRecord, articleId?: string): string {
  const fromDraft = asString(source.sourceUrl);
  if (fromDraft) {
    return fromDraft;
  }

  const article = isRecord(source.article) ? source.article : undefined;
  const articleUrl = asString(article?.url);
  if (articleUrl) {
    return articleUrl;
  }

  const hnId = asNumber(article?.id);
  if (typeof hnId === 'number') {
    return `https://news.ycombinator.com/item?id=${hnId}`;
  }

  return `https://news.ycombinator.com/item?id=${articleId ?? '0'}`;
}

function buildArticle(raw: RawRecord, fileName: string): Article {
  const article = isRecord(raw.article) ? raw.article : undefined;
  const draft = isRecord(raw.draft) ? raw.draft : undefined;
  const generatedAt = asString(raw.generatedAt) ?? new Date().toISOString();

  const title = asString(draft?.title)
    ?? asString(raw.title)
    ?? asString(article?.title)
    ?? path.basename(fileName, '.json');

  const content = asString(draft?.content)
    ?? asString(draft?.text)
    ?? asString(raw.content)
    ?? asString(article?.text)
    ?? '';

  const id = asString(draft?.id) ?? asString(raw.id) ?? slugify(title);
  const slug = asString(draft?.slug) ?? asString(raw.slug) ?? slugify(title);
  const category = asString(draft?.category) ?? asString(raw.category) ?? 'General';
  const summary = asString(draft?.summary) ?? asString(raw.summary) ?? summarizeContent(content || title);
  const sourceUrl = buildSourceUrl(raw, id);
  const readTime = asString(draft?.readTime) ?? asString(raw.readTime) ?? estimateReadTime(content || summary || title);
  const imageUrl = asString(draft?.imageUrl) ?? asString(raw.imageUrl) ?? asString(article?.imageUrl);

  return {
    id,
    slug,
    title,
    category,
    summary,
    content,
    sourceUrl,
    publishedAt: generatedAt,
    readTime,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function getPreview(raw: RawRecord, fileName: string): DraftPreview {
  const article = isRecord(raw.article) ? raw.article : undefined;
  const draft = isRecord(raw.draft) ? raw.draft : undefined;

  const title = asString(draft?.title)
    ?? asString(raw.title)
    ?? asString(article?.title)
    ?? path.basename(fileName, '.json');

  const scout = isRecord(raw.scout) ? raw.scout : undefined;
  const score = asNumber(scout?.score) ?? asNumber(raw.scoutScore) ?? 0;
  const reason = asString(scout?.reason) ?? asString(raw.reason) ?? 'No scout reason provided.';

  return { title, scoutScore: score, reason };
}

async function readArticles(): Promise<Article[]> {
  const content = await readFile(articlesPath, 'utf8');
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error('articles.json must contain an array.');
  }

  return parsed.filter((item): item is Article => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.slug === 'string'
    && typeof item.title === 'string'
    && typeof item.category === 'string'
    && typeof item.summary === 'string'
    && typeof item.content === 'string'
    && typeof item.sourceUrl === 'string'
    && typeof item.publishedAt === 'string'
    && typeof item.readTime === 'string');
}

async function saveArticles(nextArticles: Article[]): Promise<void> {
  await writeFile(articlesPath, `${JSON.stringify(nextArticles, null, 2)}\n`, 'utf8');
}

async function loadDraftFiles(): Promise<string[]> {
  try {
    const entries = await readdir(draftsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function askForAction(): Promise<DraftAction | undefined> {
  const response = await prompts<'action'>({
    type: 'select',
    name: 'action',
    message: 'Choose action',
    choices: [
      { title: 'Approve', value: 'approve' },
      { title: 'Delete', value: 'delete' },
      { title: 'Skip', value: 'skip' },
    ],
  });

  return response.action as DraftAction | undefined;
}

async function processDraft(fileName: string): Promise<void> {
  const filePath = path.join(draftsDir, fileName);
  const content = await readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(content);

  if (!isRecord(parsed)) {
    console.log(chalk.yellow(`Skipping ${fileName}: draft JSON must be an object.`));
    return;
  }

  const preview = getPreview(parsed, fileName);
  console.log(chalk.cyan(`\n${preview.title}`));
  console.log(chalk.gray(`Scout score: ${preview.scoutScore}`));
  console.log(chalk.gray(`Reason: ${preview.reason}`));

  const action = await askForAction();
  if (!action) {
    console.log(chalk.gray('No action selected, skipping.'));
    return;
  }

  if (action === 'skip') {
    console.log(chalk.gray('Skipped.'));
    return;
  }

  if (action === 'delete') {
    await unlink(filePath);
    console.log(chalk.green(`Deleted ${fileName}`));
    return;
  }

  const article = buildArticle(parsed, fileName);
  const currentArticles = await readArticles();
  const nextArticles = [...currentArticles.filter((item) => item.slug !== article.slug), article];

  await saveArticles(nextArticles);
  await unlink(filePath);
  console.log(chalk.green(`Approved ${article.slug} and removed ${fileName}`));
}

export async function main(): Promise<void> {
  const draftFiles = await loadDraftFiles();

  if (draftFiles.length === 0) {
    console.log(chalk.gray('No draft JSON files found in drafts/.'));
    return;
  }

  for (const fileName of draftFiles) {
    try {
      await processDraft(fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to process ${fileName}: ${message}`));
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Moderation run failed: ${message}`));
  process.exitCode = 1;
});
