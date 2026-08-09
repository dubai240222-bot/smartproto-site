/**
 * SP-A-056 — Direct Publisher CLI.
 *
 *   npx tsx scripts/direct-publish.ts --file=article.json
 *   npx tsx scripts/direct-publish.ts --delete=<slug>
 *
 * Writes straight to SQLite (atomic transaction, slug UNIQUE) — no git,
 * no GitHub Actions, no Vercel. The site reads this table at request time,
 * so the article is live the moment this command returns.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { upsertArticle, deleteArticleBySlug, getArticleBySlugFromDb } from '../src/lib/data-store/articles-repo';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const file = arg('file');
  const del = arg('delete');

  if (del) {
    deleteArticleBySlug(del);
    console.log(`Deleted slug: ${del}`);
    return;
  }

  if (!file) {
    console.error('Usage: direct-publish --file=article.json  OR  --delete=<slug>');
    process.exit(1);
  }

  const raw = readFileSync(file, 'utf8');
  const article = JSON.parse(raw);

  if (!article.slug || !article.title) {
    console.error('Article JSON must include at least slug and title.');
    process.exit(1);
  }

  const now = new Date().toISOString();
  upsertArticle({
    id: article.id || article.slug,
    slug: article.slug,
    title: article.title,
    category: article.category || 'Гаджеты',
    tags: article.tags || [],
    summary: article.summary || '',
    content: article.content || '',
    sourceUrl: article.sourceUrl || '',
    publishedAt: article.publishedAt || now,
    readTime: article.readTime || '1 мин',
    imageUrl: article.imageUrl,
    author: article.author,
    authorDesk: article.authorDesk,
    agentId: article.agentId,
  });

  const stored = getArticleBySlugFromDb(article.slug);
  console.log('Published:', JSON.stringify(stored, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
