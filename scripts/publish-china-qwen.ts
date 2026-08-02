/**
 * China Collector → Qwen Analyst → Editor → articles.json.
 * Bounded AI: max 5 Qwen + Editor only for dossiers that pass editorial gadget bar.
 */
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { stampAuthorForPipeline } from '../src/lib/authors';
import chalk from 'chalk';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const MAX_QWEN = 5;
const TARGET_PUBLISH = 5;
const FORCE = process.argv.includes('--force');

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
  author?: string;
  authorDesk?: string;
  agentId?: string;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || `china-gadget-${Date.now()}`
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

function dossierPublishable(
  d: {
    productName: string;
    whatItDoes: string;
    consumerUse: string;
    whyItIsNew: string;
    recommended: boolean;
    warningFlags: string[];
    unknownFacts: string[];
    prototypeOrSale: string;
    translatedTitle: string;
    originalTitle: string;
  },
  sourceBody: string,
): { ok: boolean; reason: string } {
  if (d.unknownFacts.includes('rejected before model')) {
    return { ok: false, reason: 'hard-rejected before Qwen' };
  }
  const flags = d.warningFlags.join(' ').toLowerCase();
  if (/hiring|personnel|trade.?show|not a product|essay|corporate|sales stats|not.?gadget/.test(flags)) {
    return { ok: false, reason: `warningFlags: ${d.warningFlags.join('; ')}` };
  }
  const proto = d.prototypeOrSale.toLowerCase();
  if (/essay|opinion|hiring|conference.?only/.test(proto)) {
    return { ok: false, reason: `prototypeOrSale=${d.prototypeOrSale}` };
  }
  const name = d.productName.trim() || d.originalTitle.trim();
  const blob = `${d.originalTitle} ${d.translatedTitle} ${name} ${d.whatItDoes}`.toLowerCase();
  // ChinaJoy OK when a named device is present; reject pure show/HR digests.
  if (/入职|裁员|总经理|票房|交付.*万/.test(blob)) {
    return { ok: false, reason: 'non-gadget topic residue' };
  }
  if (/chinajoy|游戏展/.test(blob) && !/(手机|手表|耳机|手柄|平板|phone|watch)/i.test(blob + name)) {
    return { ok: false, reason: 'trade-show fluff without device' };
  }
  if (d.recommended) return { ok: true, reason: 'qwen recommended' };
  const facts = [d.whatItDoes, d.consumerUse, d.whyItIsNew, sourceBody].join('\n').trim();
  if (name.length >= 4 && facts.length >= 80) {
    return { ok: true, reason: 'editorial gadget bar (source-backed)' };
  }
  return { ok: false, reason: 'weak dossier / thin source' };
}

async function main() {
  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';
  if (!factoryEnabled && !FORCE) {
    console.log('Factory is OFF. Pass --force to publish locally.');
    process.exitCode = 0;
    return;
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    console.error('OPENROUTER_API_KEY missing — abort.');
    process.exitCode = 1;
    return;
  }

  process.env.CHINA_DEPARTMENT_ENABLED = 'true';
  process.env.CHINA_ALLOW_RECOMMEND = 'true';
  process.env.SMARTPROTO_FACTORY_ENABLED = 'true';

  const root = process.cwd();
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  await mkdir(draftsDir, { recursive: true });

  let articles: Article[] = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const seen = new Set<string>(
    articles.flatMap((a) => [a.id, a.slug, a.sourceUrl].filter(Boolean) as string[]),
  );

  const { collectAndFilterChina } = await import('../src/lib/collectors/china-collector');
  const { analyzeChinaCandidate, looksChinaConsumerGadget } = await import('../src/lib/ai/china-analyst');
  const { writeDraft } = await import('../src/lib/ai/editor');
  const { extractArticlePlainText } = await import('../src/lib/collectors/article-text');

  console.log(chalk.bold.green('=== China → Qwen → Editor → publish ==='));

  const filtered = await collectAndFilterChina({ limitPerSource: 45 });
  const consider = filtered
    .filter((x) => x.decision === 'CONSIDER')
    .filter((x) => looksChinaConsumerGadget(x.candidate.title, x.candidate.summary))
    .filter((x) => !seen.has(x.candidate.sourceUrl))
    // Prefer phones / wearables / controllers over gift-box collabs & PC commodity.
    .filter((x) => {
      const t = x.candidate.title;
      if (/联名礼盒|礼盒/.test(t) && /键盘|鼠标|耳机/.test(t)) return false;
      if (/风冷散热器|显示器支架|支架臂|全模组电源|长焦镜头/.test(t)) return false;
      return true;
    })
    .sort((a, b) => b.candidate.rawSignals.length - a.candidate.rawSignals.length)
    .slice(0, MAX_QWEN)
    .map((x) => x.candidate);

  console.log(`CONSIDER (gadget): ${consider.length} (max Qwen ${MAX_QWEN})`);
  if (!consider.length) {
    console.log(chalk.yellow('No consumer-gadget CONSIDER candidates — nothing to publish.'));
    process.exitCode = 0;
    return;
  }

  const published: string[] = [];
  let qwenCalls = 0;
  let editorCalls = 0;

  for (const c of consider) {
    if (published.length >= TARGET_PUBLISH) break;
    console.log(chalk.bold(`\n--- ${c.sourceName}: ${c.title.slice(0, 80)}`));
    console.log(chalk.gray(c.sourceUrl));

    // Enrich thin RSS summaries with public page text (no marketplace scrape).
    let sourceBody = c.summary || '';
    let pageImage = c.imageUrl || '';
    try {
      const page = await extractArticlePlainText(c.sourceUrl, { maxChars: 3200 });
      if (page.text.length > sourceBody.length) sourceBody = page.text;
      if (page.imageUrl) pageImage = page.imageUrl;
      console.log(chalk.gray(`  enriched text: ${sourceBody.length} chars, image=${Boolean(pageImage)}`));
    } catch {
      console.log(chalk.gray('  enrich failed — using RSS summary only'));
    }

    const enriched = {
      ...c,
      summary: sourceBody.slice(0, 4000),
      imageUrl: pageImage || c.imageUrl,
    };

    let dossier;
    try {
      qwenCalls += 1;
      dossier = await analyzeChinaCandidate(enriched);
    } catch (err) {
      console.log(chalk.red(`  Qwen fail: ${err instanceof Error ? err.message : String(err)}`));
      continue;
    }

    console.log(
      chalk.cyan(
        `  dossier: product=${dossier.productName || '(none)'} recommended=${dossier.recommended} proto=${dossier.prototypeOrSale || '-'} what=${(dossier.whatItDoes || '').slice(0, 60)}`,
      ),
    );
    const gate = dossierPublishable(dossier, sourceBody);
    if (!gate.ok) {
      console.log(chalk.yellow(`  skip: ${gate.reason}`));
      continue;
    }
    console.log(chalk.green(`  pass: ${gate.reason}`));

    const articleData = {
      title: dossier.translatedTitle || dossier.productName || c.title,
      text: [
        dossier.whatItDoes,
        dossier.whyItIsNew,
        dossier.consumerUse,
        dossier.priceOriginal != null
          ? `Цена (источник): ${dossier.priceOriginal} ${dossier.currency || ''}`.trim()
          : '',
        dossier.availability ? `Доступность: ${dossier.availability}` : '',
        dossier.launchDate ? `Дата: ${dossier.launchDate}` : '',
        dossier.prototypeOrSale ? `Статус: ${dossier.prototypeOrSale}` : '',
        dossier.unknownFacts.length ? `Неизвестно: ${dossier.unknownFacts.join('; ')}` : '',
        dossier.warningFlags.length ? `Оговорки: ${dossier.warningFlags.join('; ')}` : '',
        // Source-backed body for Editor when dossier fields are thin (no invented specs).
        sourceBody.slice(0, 2800),
      ]
        .filter(Boolean)
        .join('\n\n'),
      sourceUrl: dossier.sourceUrl || c.sourceUrl,
      sourceName: c.sourceName,
      imageUrl: dossier.imageUrl || pageImage || c.imageUrl,
    };

    const reviewData = {
      technicalVerdict: 'PASS: China Qwen dossier — buyable consumer gadget candidate',
      productName: dossier.productName,
      manufacturer: dossier.manufacturer,
      evidence: dossier.evidence,
    };

    // Frame for Editor/hard-reject in Russian while keeping Chinese source facts (no invented specs).
    const framed = {
      ...articleData,
      title: dossier.productName || articleData.title,
      text: [
        `Новый гаджет / устройство (источник: ${c.sourceName}).`,
        `Анонс / новая модель. По данным источника можно купить или оформить предзаказ, если указано в тексте.`,
        articleData.text,
      ].join('\n\n'),
    };

    let draft;
    try {
      editorCalls += 1;
      draft = await writeDraft(framed, reviewData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // One retry if toneCheck unsupportedClaims trips on sparse CN sources.
      if (/unsupportedClaims/.test(msg)) {
        try {
          editorCalls += 1;
          draft = await writeDraft(
            {
              ...framed,
              text: `${framed.text}\n\nНе выдумывай характеристики. Нет данных — пиши «не указано в источнике». Независимых тестов нет.`,
            },
            {
              ...reviewData,
              technicalVerdict:
                'PASS with limits: sparse China source — mark unknowns, no unsupported claims',
            },
          );
        } catch (err2) {
          console.log(chalk.red(`  Editor fail: ${err2 instanceof Error ? err2.message : String(err2)}`));
          continue;
        }
      } else {
        console.log(chalk.red(`  Editor fail: ${msg}`));
        continue;
      }
    }

    if (draft.title.toUpperCase() === 'REJECT' || draft.tags.includes('#reject')) {
      console.log(chalk.yellow('  Editor REJECT'));
      continue;
    }
    const wc = wordCount(draft.text);
    if (wc < 100) {
      console.log(chalk.yellow(`  too short (${wc})`));
      continue;
    }

    // Authentic source/og image only — never Unsplash thematic stand-ins for gadgets.
    const imageUrl = (dossier.imageUrl || pageImage || c.imageUrl || '').trim();
    if (!imageUrl || /unsplash\.com/i.test(imageUrl)) {
      console.log(chalk.yellow('  no authentic imageUrl — skip (no wrong device photo)'));
      continue;
    }

    const brandHint =
      dossier.manufacturer ||
      (/(edifier|漫步者|hecate)/i.test(`${dossier.productName} ${c.title}`)
        ? 'edifier'
        : /(oppo)/i.test(`${dossier.productName} ${c.title}`)
          ? 'oppo'
          : /(samsung|galaxy|三星)/i.test(`${dossier.productName} ${c.title}`)
            ? 'samsung'
            : /(xiaomi|redmi|小米|红米)/i.test(`${dossier.productName} ${c.title}`)
              ? 'xiaomi'
              : '');
    const baseSlug = slugify(
      dossier.productName
        ? `${brandHint || 'china'} ${dossier.productName}`
        : draft.title,
    );
    let slug = baseSlug;
    let n = 2;
    while (seen.has(slug) || articles.some((a) => a.slug === slug)) {
      slug = `${baseSlug}-${n++}`;
    }
    if (seen.has(c.sourceUrl)) {
      console.log(chalk.yellow('  duplicate source — skip'));
      continue;
    }

    const publishedAt = new Date().toISOString();
    const article: Article = {
      id: slug,
      slug,
      title: draft.title,
      category: 'КИТАЙ / ГАДЖЕТ',
      tags: Array.from(
        new Set([
          ...draft.tags.map((t) => t.replace(/^#/, '')),
          'Китай',
          'Qwen',
          'новинка',
          dossier.manufacturer,
        ].filter(Boolean)),
      ).slice(0, 10),
      summary: summaryOf(draft.text),
      content: draft.text,
      sourceUrl: c.sourceUrl,
      publishedAt,
      readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
      imageUrl,
      ...stampAuthorForPipeline('china-qwen', { sourceUrl: c.sourceUrl, slug }),
    };

    articles = [article, ...articles.filter((a) => a.id !== slug && a.slug !== slug)];
    await writeFile(articlesPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    await writeFile(
      path.join(draftsDir, `${Date.now()}-${slug}.json`),
      JSON.stringify({ generatedAt: publishedAt, source: c, dossier, draft: article }, null, 2),
      'utf8',
    );

    seen.add(slug);
    seen.add(c.sourceUrl);
    published.push(slug);
    console.log(chalk.green(`  PUBLISHED ${slug} (${wc} words)`));
    console.log(chalk.green(`  https://www.smartproto.net/articles/${slug}`));
  }

  console.log(chalk.bold.green(`\nDONE published=${published.length} qwen=${qwenCalls} editor=${editorCalls}`));
  for (const s of published) console.log(`https://www.smartproto.net/articles/${s}`);
  if (!published.length) process.exitCode = 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
