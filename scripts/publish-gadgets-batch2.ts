/**
 * Cleanup weak batch + publish only clear buyable gadgets from Yanko/New Atlas.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { getOpenRouterClient, clampText, parseJsonObject } from '../src/lib/ai/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';
const TARGET = 7;

const REMOVE_SLUGS = new Set([
  'stewart-platform-walker-gains-feeling-in-legs-from-resistors',
  'should-you-still-buy-your-next-smartphone-or-subscribe-to-it-instead',
  'browser-based-3d-editor-covers-the-basics-while-staying-local',
  'commercialization-and-innovation',
  // keep keyboard, stream deck, mini fan only if they pass; stream deck DIY ok-ish; fan ok; keyboard ok
]);

const MANUAL_SEEDS: Array<{ title: string; url: string; sourceName: string; imageUrl: string; text: string }> = [
  {
    title: 'This Iron Frying Plate Sears Food on Bare Steel & Goes Straight From the Stove to Your Table',
    url: 'https://www.yankodesign.com/2026/08/01/this-iron-frying-plate-sears-food-on-bare-steel-goes-straight-from-the-stove-to-your-table/',
    sourceName: 'Yanko Design',
    imageUrl: 'https://www.yankodesign.com/images/design_news/2026/07/iron-frying-plate/iron_frying_plate_yanko_design_01.jpg',
    text: 'Iron Frying Plate / JIU: 1.6mm mill scale steel cook-and-serve plate, detachable wooden handle, $69 buy now. Uncoated steel sears food and goes straight to the table.',
  },
  {
    title: 'A Chess Set So Well-Designed It Doubles as Desk Art',
    url: 'https://www.yankodesign.com/2026/08/01/a-chess-set-so-well-designed-it-doubles-as-desk-art/',
    sourceName: 'Yanko Design',
    imageUrl: 'https://www.yankodesign.com/images/design_news/2026/07/a-chess-set-so-well-designed-it-doubles-as-desk-art/chekt-00.jpg',
    text: 'CHEKT chess set by Jess Wiseman: sculptural magnetic pieces, stacking storage, desk-art packaging. Buyable design chess set.',
  },
  {
    title: "Gen Z Is Buying Old iPods to Quit Spotify. Fiio's $50 Hi-Fi MP3 Player Does It Better.",
    url: 'https://www.yankodesign.com/2026/07/31/gen-z-is-buying-old-ipods-to-quit-spotify-fiios-50-hi-fi-mp3-player-does-it-bet/',
    sourceName: 'Yanko Design',
    imageUrl: 'https://www.yankodesign.com/images/design_news/2026/07/this-50-music-player-is-cheaper-than-the-beat-up-ipod-gen-z-is-buying-instead-of-it/fiio_snowsky_echo_nano_1.jpeg',
    text: 'FiiO Snowsky Echo Nano portable Hi-Fi MP3 player $49.99 with CS43131 DAC, microSD to 256GB, 3.5mm jack, USB-C, physical dial. Buyable music gadget.',
  },
  {
    title: 'The Fridge Screen Your Family Can Update From Anywhere Without Texting',
    url: 'https://www.yankodesign.com/2026/08/01/the-fridge-screen-your-family-can-update-from-anywhere-without-texting/',
    sourceName: 'Yanko Design',
    imageUrl: 'https://www.yankodesign.com/images/design_news/2026/07/the-fridge-screen-your-family-can-update-from-anywhere-without-texting/reterminal-sticky-04.jpg',
    text: 'reTerminal Sticky by Seeed Studio: 3.97-inch E-Ink fridge magnet display, voice notes, Seeedash app, week-long battery. Buyable smart home gadget.',
  },
];

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || `gadget-${Date.now()}`
  );
}

function summaryOf(text: string): string {
  const t = text.trim();
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const OPENERS = [
  'вопрос к читателю про бытовую боль',
  'сразу название продукта и главная фича',
  'цена как крючок в первой фразе',
  'сценарий утра/кухни/стола',
  'совет «бери, если устал от…»',
  'деталь дизайна первой строкой',
  'сравнение со старым способом',
];

const STRICT_BUYABLE =
  /\b(buy now|for \$\d|priced|preorder|pre-order|kickstarter|available|\$\d+|amazon|keyboard|player|mp3|e-?ink|display|chess|skillet|frying|fan|stream deck|gadget|device|toothbrush|earbuds?|headphones?|charger|dock|tablet|camera|projector|wearable)\b/i;

const HARD_NO =
  /\b(opinion|subscribe instead|browser-based|commercialization|researchers|museum|skyscraper|wildlife|trump|election|suv|memoir|singer|album|how to watch)\b/i;

async function rewriteBlogger(
  item: { title: string; url: string; sourceName: string; text: string },
  openerHint: string,
): Promise<{ title: string; text: string; tags: string[] }> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.5,
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: [
          'Ты уверенный product-блогер SmartProto только про покупаемые полезные гаджеты/товары.',
          '150–200 слов, спокойная уверенность, buy/learn-more; без мелодрамы.',
          'ЗАПРЕЩЕНО: клише «будущее уже здесь» / «вчера это была фантастика».',
          'Только реальные фичи. JSON без markdown.',
          'Reject если это не товар для покупки: title=REJECT, tags=["#reject"].',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'JSON: {"title":string,"text":string,"tags":string[]}',
          'title <=90. text 150–200 слов. tags 5–8 с #новинка #полезно #гаджет.',
          `Хук: ${openerHint}`,
          'Конец: Источник: <имя>.',
          '',
          `Источник: ${item.sourceName}`,
          `URL: ${item.url}`,
          `Title EN: ${item.title}`,
          clampText(item.text, 5000),
        ].join('\n'),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('empty rewrite');
  const parsed = parseJsonObject<{ title: string; text: string; tags: string[] }>(raw);
  return {
    title: parsed.title.trim(),
    text: parsed.text.trim(),
    tags: parsed.tags.map((t) => String(t).trim()).filter(Boolean),
  };
}

async function main() {
  const root = process.cwd();
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  await mkdir(draftsDir, { recursive: true });

  let articles: Article[] = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const before = articles.length;
  articles = articles.filter((a) => !REMOVE_SLUGS.has(a.slug));
  console.log(chalk.yellow(`Removed weak: ${before - articles.length}`));

  const seen = new Set<string>(
    articles.flatMap((a) => [a.id, a.slug, a.sourceUrl, a.sourceUrl.replace(/\?.*$/, '')].filter(Boolean) as string[]),
  );

  const pool: Array<{ title: string; url: string; sourceName: string; imageUrl?: string; text: string }> = [
    ...MANUAL_SEEDS,
  ];

  for (const [name, url] of [
    ['Yanko Design', 'https://www.yankodesign.com/feed/'],
    ['New Atlas', 'https://newatlas.com/index.rss'],
  ] as const) {
    try {
      const items = await fetchRssFeed(url, { limit: 25, sourceName: name });
      for (const item of items) {
        const hay = `${item.title}\n${item.text || ''}`;
        if (HARD_NO.test(hay)) continue;
        if (!STRICT_BUYABLE.test(hay)) continue;
        pool.push({
          title: item.title,
          url: item.url,
          sourceName: item.sourceName,
          imageUrl: item.imageUrl,
          text: item.text || item.title,
        });
      }
      console.log(chalk.gray(`${name} scanned`));
    } catch (e) {
      console.log(chalk.yellow(`${name}: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  const published: string[] = [];
  // Prefer keeping previous good ones in live set already (keyboard/fan/stream)
  for (let i = 0; i < pool.length && published.length < TARGET; i++) {
    const item = pool[i];
    const cleanUrl = item.url.replace(/\?.*$/, '');
    const slug = slugify(item.title);
    if (seen.has(item.url) || seen.has(cleanUrl) || seen.has(slug)) {
      console.log(chalk.gray(`skip dup ${slug}`));
      continue;
    }
    // skip fridge if already published under similar slug
    if (articles.some((a) => a.sourceUrl.replace(/\?.*$/, '') === cleanUrl || a.slug === slug)) {
      console.log(chalk.gray(`skip existing ${slug}`));
      continue;
    }

    console.log(chalk.bold(`\n[${published.length + 1}/${TARGET}] ${item.title}`));
    try {
      const draft = await rewriteBlogger(item, OPENERS[i % OPENERS.length]);
      if (draft.title.toUpperCase() === 'REJECT' || draft.tags.includes('#reject')) {
        console.log(chalk.yellow('reject'));
        continue;
      }
      if (/дожил(?:и|а|о)?|вчера казалось фантастикой|вчера фантастика/i.test(draft.title + draft.text)) {
        console.log(chalk.yellow('banned cliché'));
        continue;
      }
      let wc = wordCount(draft.text);
      if (wc < 140) {
        console.log(chalk.yellow(`short ${wc}, retry expand`));
        const expanded = await rewriteBlogger(
          { ...item, text: `${item.text}\n\nPlease expand to 160-190 Russian words with concrete product features.` },
          OPENERS[(i + 3) % OPENERS.length],
        );
        if (/дожил(?:и|а|о)?|вчера казалось фантастикой|вчера фантастика/i.test(expanded.title + expanded.text)) continue;
        draft.title = expanded.title;
        draft.text = expanded.text;
        draft.tags = expanded.tags;
        wc = wordCount(draft.text);
      }
      if (wc < 140 || wc > 230) {
        console.log(chalk.yellow(`wordcount ${wc} out of range`));
        continue;
      }

      let imageUrl = item.imageUrl;
      if (!imageUrl) {
        try {
          imageUrl = (await extractArticleImage(item.url)) || undefined;
        } catch {
          /* */
        }
      }
      if (!imageUrl) {
        console.log(chalk.yellow('no image'));
        continue;
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
        sourceUrl: cleanUrl,
        publishedAt,
        readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
        imageUrl,
      };

      articles = [article, ...articles];
      seen.add(slug);
      seen.add(cleanUrl);
      published.push(slug);
      await writeFile(
        path.join(draftsDir, `${Date.now()}-${slug}.json`),
        JSON.stringify({ generatedAt: publishedAt, source: item, draft: article }, null, 2),
        'utf8',
      );
      console.log(chalk.green(`OK ${slug} (${wc}w)`));
    } catch (e) {
      console.error(chalk.red(e instanceof Error ? e.message : String(e)));
    }
  }

  await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');
  console.log(chalk.bold.green(`\nDONE new=${published.length} totalArticles=${articles.length}`));
  for (const s of published) console.log(`https://www.smartproto.net/articles/${s}`);
  if (published.length < 5) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
