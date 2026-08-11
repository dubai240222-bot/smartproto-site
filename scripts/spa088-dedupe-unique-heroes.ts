/**
 * SP-A-088b — force unique local heroes: no shared stock frames, no SVG templates.
 *
 *   npx tsx scripts/spa088-dedupe-unique-heroes.ts
 *   npx tsx scripts/spa088-dedupe-unique-heroes.ts --dry-run
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  getAllArticlesFromDb,
  getArticleBySlugFromDb,
  upsertArticle,
  type StoredArticle,
} from '../src/lib/data-store/articles-repo';
import { downloadImagesLocally } from '../src/lib/collectors/photo-scout';

/** Large bright Unsplash pool — each article gets a distinct frame. */
const STOCK_POOL: string[] = [
  'photo-1485827404703-89b55fcc595e',
  'photo-1535378917041-10a22f510809',
  'photo-1581091226825-a6a2a5aee158',
  'photo-1581092918056-0c4c3acd3789',
  'photo-1561557944-6e7860d1a7eb',
  'photo-1518709268805-4e9042af9f23',
  'photo-1451187580459-43490279c0fa',
  'photo-1507413245164-6160d8298b31',
  'photo-1492144534655-ae79c964c9d7',
  'photo-1503376780353-7e6692767b70',
  'photo-1552519507-da3b142c6e3d',
  'photo-1549317661-bd32c8ce0db2',
  'photo-1605745341112-85968b19335b',
  'photo-1558494949-ef010cbdcc31',
  'photo-1558346490-a72e53ae2d4f',
  'photo-1518770660439-4636190af475',
  'photo-1588508065123-287b28e013da',
  'photo-1526170375885-4d8ecf77b99f',
  'photo-1505740420928-5e560c06d30e',
  'photo-1531482615713-2afd69097998',
  'photo-1563986768609-322da13575f3',
  'photo-1550751827-4bd374c3f58b',
  'photo-1677442136019-21780ecad995',
  'photo-1620712943543-bcc4688e7485',
  'photo-1512820790803-83ca734da794',
  'photo-1461749280684-dccba630e2f6',
  'photo-1516321318423-f06f85e504b3',
  'photo-1552664730-d307ca884978',
  'photo-1531403009284-440f080d1e12',
  'photo-1454165804606-c3d57bc86b40',
  'photo-1509391366360-2e959784a276',
  'photo-1501594907352-04cda38ebc29',
  'photo-1469474968028-56623f02e42e',
  'photo-1576091160399-112ba8d25d1d',
  'photo-1582719478250-c89cae4dc85b',
  'photo-1579684385127-1ef15d508118',
  'photo-1511707171634-5f897ff02aa9',
  'photo-1592899677977-9c10ca588bbd',
  'photo-1510557880182-3d4d3cba35a5',
  'photo-1544197150-b99a41b40b3e',
  'photo-1512941937669-90a1b58e7e9c',
  'photo-1570295999919-56ceb5ecca61',
  'photo-1507003211169-0a1dd7228f2d',
  'photo-1472099645785-5658abf4ff4e',
  'photo-1519389950473-47ba0277781c',
  'photo-1550751827-4bd374c3f58b',
  'photo-1555949963-aa79dcee981c',
  'photo-1555066931-4365d14bab8c',
  'photo-1526374965328-7f61d4dc18c5',
  'photo-1550751827-4bd374c3f58b',
  'photo-1488590528505-98d2b5aba04b',
  'photo-1498050108023-c5249f4df085',
  'photo-1517694712202-14dd9538aa97',
  'photo-1531297484001-80022131f5a1',
  'photo-1487058792275-0ad4aaf24ca7',
  'photo-1460925895917-afdab827c52f',
  'photo-1504639725590-34d0984388bd',
  'photo-1517430816045-df4b7de11d1d',
  'photo-1581092160562-40aa08e78837',
  'photo-1581092335397-9583eb92d232',
  'photo-1581092795360-fd1ca04f0952',
  'photo-1581092916484-2f0b0a0a0a0a', // may fail — filtered
  'photo-1618005182384-a83a8bd57fbe',
  'photo-1633356122544-f134324a6cee',
  'photo-1614850523459-c2f4c699c52e',
  'photo-1639322537228-f710d846310a',
  'photo-1642104704074-907c0698cbd9',
  'photo-1655720828018-edd2daec9349',
  'photo-1675271591211-126ad94e495d',
  'photo-1686191128892-3b66a8a0e0a0', // may fail
  'photo-1704636795760-0d0a0a0a0a0a', // may fail
  'photo-1593642632823-8f785ba67e45',
  'photo-1593642634367-d91a06494cbd',
  'photo-1593642634315-48d23b2aa2c3',
  'photo-1496171367470-9ed9a91ea931',
  'photo-1484704849700-f032a568e944',
  'photo-1486312338219-ce68d2c6f44d',
  'photo-1432888498266-38ffec3eaf0a',
  'photo-1423666639041-f56000c27a9a',
  'photo-1416339306562-f3d12fefd36f',
].map((id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`);

const KNOWN_SAME = new Set([
  'photo-1485827404703-89b55fcc595e', // pepper robot stock
]);

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

function parseArgs(argv: string[]) {
  return { dryRun: argv.includes('--dry-run') };
}

async function fileMd5(filePath: string): Promise<string | null> {
  try {
    const buf = await readFile(filePath);
    if (buf.length < 2500) return `tiny:${buf.length}`;
    return md5(buf);
  } catch {
    return null;
  }
}

function mediaRoot(): string {
  return process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media');
}

async function localPathFor(article: StoredArticle): Promise<string | null> {
  const u = (article.imageUrl || '').trim();
  if (!u.startsWith('/api/media/')) return null;
  return path.join(mediaRoot(), u.slice('/api/media/'.length));
}

async function downloadUnique(
  slug: string,
  preferredUrls: string[],
  usedHashes: Set<string>,
): Promise<{ url: string; sourceUrl: string; hash: string } | null> {
  for (const sourceUrl of preferredUrls) {
    const downloaded = await downloadImagesLocally(slug, [{ url: sourceUrl, role: 'hero' }]);
    if (!downloaded.length) continue;
    const local = path.join(mediaRoot(), downloaded[0].url.slice('/api/media/'.length));
    const hash = await fileMd5(local);
    if (!hash || hash.startsWith('tiny:')) continue;
    if (usedHashes.has(hash)) {
      // collision — try next
      continue;
    }
    usedHashes.add(hash);
    return { url: downloaded[0].url, sourceUrl, hash };
  }
  return null;
}

function topicUrls(title: string, category: string, slug: string): string[] {
  const q = `${title} ${category} ${slug}`.toLowerCase();
  const scored = STOCK_POOL.map((url, i) => {
    let score = (i + slug.length * 7) % STOCK_POOL.length;
    if (/robot|робот|tacta|pepper|ai|ии|gpt|grok/.test(q) && /1485827404703|1535378917041|158109|167744/.test(url)) {
      score -= 3;
    }
    if (/auto|car|volkswagen|geely|mobil|дрон|drone/.test(q) && /149214|150337|155251|154931/.test(url)) {
      score -= 3;
    }
    if (/phone|pixel|смартфон|5g|huawei/.test(q) && /151170|159289|151055|154419/.test(url)) {
      score -= 3;
    }
    return { url, score };
  });
  // Rotate by slug hash so order differs per article.
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 33 + slug.charCodeAt(i)) >>> 0;
  const rot = h % STOCK_POOL.length;
  const rotated = [...STOCK_POOL.slice(rot), ...STOCK_POOL.slice(0, rot)];
  // Prefer topic-ish first half of scored
  const preferred = scored.sort((a, b) => a.score - b.score).map((s) => s.url);
  return [...new Set([...preferred.slice(0, 12), ...rotated])];
}

async function main() {
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('Need ARTICLES_STORE=sqlite');
    process.exit(1);
  }
  const { dryRun } = parseArgs(process.argv.slice(2));
  const articles = getAllArticlesFromDb();
  console.log('SP-A-088b unique heroes', { total: articles.length, dryRun });

  const root = mediaRoot();
  const hashToSlugs = new Map<string, string[]>();
  const slugHash = new Map<string, string>();
  const usedHashes = new Set<string>();

  for (const a of articles) {
    const lp = await localPathFor(a);
    if (!lp) continue;
    const h = await fileMd5(lp);
    if (!h) continue;
    slugHash.set(a.slug, h);
    const list = hashToSlugs.get(h) || [];
    list.push(a.slug);
    hashToSlugs.set(h, list);
    if (!h.startsWith('tiny:')) usedHashes.add(h);
  }

  const dupGroups = [...hashToSlugs.entries()].filter(([, slugs]) => slugs.length > 1);
  console.log('identical local groups', dupGroups.length);
  for (const [h, slugs] of dupGroups) {
    console.log(' ', slugs.length, h.slice(0, 10), slugs.join(', '));
  }

  // Targets: share hash with others OR tiny OR svg path OR pepper stock source OR missing local
  const mustFix = new Set<string>();
  for (const [, slugs] of dupGroups) {
    // keep first, fix rest
    for (const s of slugs.slice(1)) mustFix.add(s);
  }
  for (const a of articles) {
    const u = (a.imageUrl || '').trim();
    if (!u) {
      mustFix.add(a.slug);
      continue;
    }
    if (u.toLowerCase().endsWith('.svg') || u.includes('_category/')) {
      mustFix.add(a.slug);
      continue;
    }
    const imagesJson = JSON.stringify(a.images || []);
    for (const id of KNOWN_SAME) {
      if (imagesJson.includes(id) || u.includes(id)) mustFix.add(a.slug);
    }
    // broken hotlinks to replace
    if (u.startsWith('http')) {
      // only force if known bad host patterns later; skip bulk here
    }
  }

  // Always force unique across pepper trio even first kept member if ALL are pepper —
  // reassign ALL but one in group: already keeping first. For pepper, reassign ALL three
  // to unique non-pepper frames so homepage doesn't keep one pepper + two new.
  const pepperSlugs = articles
    .filter((a) => JSON.stringify(a.images || []).includes('photo-1485827404703') || (a.imageUrl || '').includes('1485827404703'))
    .map((a) => a.slug);
  for (const s of pepperSlugs) mustFix.add(s);

  // Also fix tiny locals
  for (const [h, slugs] of hashToSlugs) {
    if (h.startsWith('tiny:')) for (const s of slugs) mustFix.add(s);
  }

  console.log('mustFix', mustFix.size, [...mustFix].join(', '));

  let fixed = 0;
  let failed = 0;
  for (const slug of mustFix) {
    const article = getArticleBySlugFromDb(slug);
    if (!article) continue;
    console.log(`\n=== ${slug} ===`);
    const urls = topicUrls(article.title, article.category, slug).filter(
      (u) => !KNOWN_SAME.some((id) => u.includes(id)),
    );
    if (dryRun) {
      console.log(' DRY would assign from', urls[0]?.slice(0, 70));
      continue;
    }
    const result = await downloadUnique(slug, urls, usedHashes);
    if (!result) {
      console.log(' FAIL no unique download');
      failed += 1;
      continue;
    }
    const next: StoredArticle = {
      ...article,
      imageUrl: result.url,
      images: [{ url: result.url, role: 'hero', sourceUrl: result.sourceUrl }],
    };
    upsertArticle(next);
    fixed += 1;
    console.log(' OK', result.url, 'hash', result.hash.slice(0, 8));
  }

  // Replace _category SVGs with JPG stock copies for future fallbacks
  const catDir = path.join(root, '_category');
  await mkdir(catDir, { recursive: true });
  const catNames = [
    'robot',
    'gadget',
    'smartphone',
    'vehicle',
    'camera',
    'wearable',
    'tablet',
    'keyboard',
    'printer',
    'storage',
    'irrigation',
    'bassinet',
    'mouse',
    'ai',
    'research',
    'network',
  ];
  if (!dryRun) {
    for (let i = 0; i < catNames.length; i++) {
      const name = catNames[i];
      const url = STOCK_POOL[(i * 5 + 3) % STOCK_POOL.length];
      if (KNOWN_SAME.some((id) => url.includes(id))) continue;
      const tmpSlug = `_category-build-${name}`;
      const dl = await downloadImagesLocally(tmpSlug, [{ url, role: 'hero' }]);
      if (!dl.length) continue;
      const src = path.join(root, dl[0].url.slice('/api/media/'.length));
      const dest = path.join(catDir, `${name}.jpg`);
      await writeFile(dest, await readFile(src));
      console.log('CATEGORY', dest);
    }
  }

  console.log('\nDONE', { fixed, failed, dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
