import { fetchRssFeed } from '../src/lib/collectors/rss';
import { readFile } from 'node:fs/promises';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function main() {
  const articles = JSON.parse(await readFile('src/data/articles.json', 'utf8'));
  const seen = new Set(
    articles.flatMap((a: { slug: string; sourceUrl: string; id: string }) => [
      a.slug,
      a.sourceUrl,
      (a.sourceUrl || '').replace(/\?.*$/, ''),
      a.id,
    ]),
  );

  for (const [name, url] of [
    ['Yanko', 'https://www.yankodesign.com/feed/'],
    ['NewAtlas', 'https://newatlas.com/index.rss'],
    ['Verge', 'https://www.theverge.com/rss/index.xml'],
  ] as const) {
    const items = await fetchRssFeed(url, { limit: 22, sourceName: name });
    console.log(`\n== ${name}`);
    for (const it of items) {
      const s = slugify(it.title);
      const dup = seen.has(it.url) || seen.has(it.url.replace(/\?.*$/, '')) || seen.has(s);
      console.log(`${dup ? 'DUP' : 'NEW'} | ${it.title.slice(0, 100)}`);
      if (!dup) console.log(`     ${it.url}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
