import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { stampAuthorForPipeline } from '../src/lib/authors';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const draftsDir = path.resolve(__dirname, '..', 'drafts');
const articlesPath = path.resolve(__dirname, '..', 'src', 'data', 'articles.json');

interface DraftFile {
  article?: {
    id?: string | number;
    title?: string;
    url?: string;
    text?: string;
    imageUrl?: string;
  };
  draft?: {
    title?: string;
    text?: string;
    tags?: string[];
    category?: string;
    summary?: string;
    imageUrl?: string;
  };
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

async function publishLatest(): Promise<void> {
  loadEnvFiles();
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

  const entries = await readdir(draftsDir);
  const jsonFiles = entries.filter((e) => e.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.error('No draft files found in drafts/');
    process.exit(1);
  }

  const filesWithTime = await Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = path.join(draftsDir, file);
      const fileStat = await stat(filePath);
      return { file, filePath, mtime: fileStat.mtimeMs };
    })
  );

  filesWithTime.sort((a, b) => b.file.localeCompare(a.file) || b.mtime - a.mtime);
  const newest = filesWithTime[0];

  const content = await readFile(newest.filePath, 'utf8');
  const cleanContent = content.replace(/^\uFEFF/, '');
  const data: DraftFile = JSON.parse(cleanContent);

  const draft = data.draft;
  if (!draft || !draft.title || !draft.text || !Array.isArray(draft.tags) || draft.tags.length === 0) {
    console.error(`Invalid draft in ${newest.file}: draft.title, draft.text, and draft.tags are required.`);
    process.exit(1);
  }

  const title = draft.title.trim();
  const text = draft.text.trim();
  const tags = draft.tags;

  const englishTitle = data.article?.title;
  const sourceUrl = data.article?.url || '';
  const slug = generateSlug(title, englishTitle);

  const articlesContent = await readFile(articlesPath, 'utf8');
  const cleanArticlesContent = articlesContent.replace(/^\uFEFF/, '');
  const articles: Article[] = JSON.parse(cleanArticlesContent);

  const duplicate = articles.find(
    (a) => (sourceUrl && a.sourceUrl === sourceUrl) || a.slug === slug
  );

  if (duplicate) {
    console.log(`Article already published (duplicate found: slug="${duplicate.slug}")`);
    console.log(`Title: ${duplicate.title}`);
    console.log(`Slug: ${duplicate.slug}`);
    console.log(`Category: ${duplicate.category}`);
    console.log(`Path: ${articlesPath}`);
    console.log(`Source URL: ${duplicate.sourceUrl}`);
    console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
    console.log(`Force run: ${force ? 'yes' : 'no'}`);
    console.log('Collectors started: no');
    console.log('AI started: no');
    console.log('Publisher started: yes');
    return;
  }

  const category = tags.slice(0, 2).map((t) => t.toUpperCase()).join(' / ');
  const publishedAt = new Date().toISOString();
  const id = slug;
  const summary = draft.summary || generateSummary(text);
  const readTime = estimateReadTime(text);
  const imageUrl = draft.imageUrl || data.article?.imageUrl;

  const newArticle: Article = {
    id,
    slug,
    title,
    category,
    summary,
    content: text,
    sourceUrl,
    publishedAt,
    readTime,
    ...(imageUrl ? { imageUrl } : {}),
    ...stampAuthorForPipeline('publish-latest', { sourceUrl, slug }),
  };

  articles.push(newArticle);
  await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');

  console.log('Successfully published latest draft!');
  console.log(`Title: ${newArticle.title}`);
  console.log(`Slug: ${newArticle.slug}`);
  console.log(`Category: ${newArticle.category}`);
  console.log(`Path: ${articlesPath}`);
  console.log(`Source URL: ${newArticle.sourceUrl}`);
  console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
  console.log(`Force run: ${force ? 'yes' : 'no'}`);
  console.log('Collectors started: no');
  console.log('AI started: no');
  console.log('Publisher started: yes');
}

publishLatest().catch((err) => {
  console.error('Failed to publish draft:', err);
  process.exit(1);
});
