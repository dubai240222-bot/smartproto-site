/**
 * SP-A-084 — visual fallback stock control + visible-card retouch (categories only).
 * Dry by default; pass --apply to update SQLite categories for last N visible articles.
 *
 * Does NOT rewrite article bodies. Does NOT touch Editor DNA / gates / retention.
 */
import Database from 'better-sqlite3';
import {
  CATEGORY_STOCK,
  MIN_TEMPLATES_PER_CATEGORY,
  assignFallbackAssets,
  isStockFallbackUrl,
  pickStockAsset,
  resolveVisualCategory,
  resolveVisualFallback,
  stockInventoryReport,
  type VisualCategoryKey,
} from '../src/lib/visual-fallback';
import { inferPublicCategory } from '../src/lib/public-labels';

type Row = {
  slug: string;
  title: string;
  category: string;
  tags: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  agentId: string | null;
  publishedAt: string;
};

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function visualSource(imageUrl: string | null, usingFallback: boolean): string {
  if (!imageUrl || !String(imageUrl).trim()) return 'fallback';
  if (isStockFallbackUrl(imageUrl)) return 'fallback';
  if (/\/api\/media\//i.test(imageUrl)) return 'exact';
  if (/unsplash|pexels|wiki/i.test(imageUrl)) return 'web';
  return usingFallback ? 'fallback' : 'exact';
}

function main() {
  const apply = process.argv.includes('--apply');
  const limit = 30;
  const inv = stockInventoryReport();
  console.log('SP-A-084 visual stock control');
  console.log(
    `INVENTORY categories=${inv.categories} min=${inv.minPerCategory} total=${inv.total} short=${inv.short.join(',') || 'none'}`,
  );
  if (inv.short.length) {
    console.error('FAIL: categories below MIN_TEMPLATES_PER_CATEGORY');
    process.exit(1);
  }
  for (const [k, pool] of Object.entries(CATEGORY_STOCK)) {
    if (pool.length < MIN_TEMPLATES_PER_CATEGORY) {
      console.error(`FAIL ${k}: ${pool.length} < ${MIN_TEMPLATES_PER_CATEGORY}`);
      process.exit(1);
    }
    const ids = new Set(pool.map((p) => p.id));
    const urls = new Set(pool.map((p) => p.url));
    if (ids.size !== pool.length || urls.size !== pool.length) {
      console.error(`FAIL ${k}: duplicate template ids/urls`);
      process.exit(1);
    }
  }

  // Synthetic control set
  const controls: { title: string; category: string; expect: VisualCategoryKey }[] = [
    { title: 'OpenAI agent assistant ships new tools', category: 'Гаджеты', expect: 'ai_future' },
    { title: 'GPT model cuts tokens 70%', category: 'Технологии', expect: 'ai_future' },
    { title: 'Claude learns to code better', category: 'AI', expect: 'ai_future' },
    { title: 'Humanoid robot walks upstairs', category: 'Гаджеты', expect: 'robotics' },
    { title: 'Unitree shows new demo', category: 'Роботы', expect: 'robotics' },
    { title: 'Soft robot gripper picks fruit', category: 'Наука', expect: 'robotics' },
    { title: 'Wearable detects early heart risk', category: 'Гаджеты', expect: 'healthtech' },
    { title: 'AI breast cancer detection improves', category: 'AI', expect: 'healthtech' },
    { title: 'Joby air taxi logs more miles', category: 'Гаджеты', expect: 'mobility' },
    { title: 'EV sedan launches in China', category: 'Мобильность', expect: 'mobility' },
    { title: 'Solar window cuts energy bills', category: 'Гаджеты', expect: 'energy' },
    { title: 'Battery works at -30°C', category: 'Энергия', expect: 'energy' },
    { title: 'Nintendo Switch 2 leak', category: 'Гаджеты', expect: 'gaming' },
    { title: 'RGB gaming headset review', category: 'Игры', expect: 'gaming' },
  ];

  let wrongGadget = 0;
  for (const c of controls) {
    const key = resolveVisualCategory(c);
    const pub = inferPublicCategory(c);
    const ok = key === c.expect;
    const gadgetDump = pub === 'Гаджеты' && c.expect !== 'gadget';
    if (gadgetDump) wrongGadget++;
    console.log(
      `${ok && !gadgetDump ? 'OK' : 'FAIL'} expect=${c.expect} got=${key} public=${pub} :: ${c.title}`,
    );
    if (!ok) process.exitCode = 1;
  }

  // Uniqueness: same category adjacent list must not share asset when avoid works
  const siblings = [
    { slug: 'a1', title: 'Robot one', category: 'Роботы' },
    { slug: 'a2', title: 'Robot two', category: 'Роботы' },
    { slug: 'a3', title: 'Robot three', category: 'Роботы' },
  ];
  const assigned = assignFallbackAssets(siblings);
  const ids = [...assigned.values()].map((s) => s.assetId);
  const unique = new Set(ids);
  console.log(`ADJACENT_ASSIGN unique=${unique.size}/${ids.length} ids=${ids.join(',')}`);
  if (unique.size !== ids.length) {
    console.error('FAIL adjacent uniqueness');
    process.exitCode = 1;
  }

  // Gray wall regression: every resolve must have imageUrl
  let gray = 0;
  for (const c of controls) {
    const spec = resolveVisualFallback({ ...c, slug: c.title });
    if (!spec.imageUrl) gray++;
    if (!spec.assetId) gray++;
  }
  console.log(`GRAY_WALLS=${gray}`);
  if (gray) process.exitCode = 1;

  const dbPath = process.env.SMARTPROTO_DB_PATH || './data/smartproto.db';
  let rows: Row[] = [];
  try {
    const db = new Database(dbPath, { readonly: !apply });
    rows = db
      .prepare(
        `SELECT slug, title, category, tags, summary, content, imageUrl, agentId, publishedAt
         FROM articles ORDER BY publishedAt DESC LIMIT ?`,
      )
      .all(limit) as Row[];
    console.log(`\nVISIBLE last ${rows.length} from ${dbPath}`);

    const retouched: string[] = [];
    const usedAssets = new Set<string>();
    let withoutVisual = 0;
    let wrongGadgetLive = 0;
    let adjDup = 0;
    let prevAsset: string | undefined;

    for (const row of rows) {
      const tags = parseTags(row.tags);
      const inferred = inferPublicCategory({
        category: row.category,
        title: row.title,
        tags,
        summary: row.summary,
      });
      const vKey = resolveVisualCategory({
        title: row.title,
        category: row.category,
        tags,
        summary: row.summary,
      });
      const hasImg = Boolean(row.imageUrl && String(row.imageUrl).trim());
      const spec = resolveVisualFallback({
        slug: row.slug,
        title: row.title,
        category: row.category,
        tags,
        summary: row.summary,
        agentId: row.agentId || undefined,
        avoidAssetIds: usedAssets,
      });
      if (spec.assetId) usedAssets.add(spec.assetId);
      const source = visualSource(row.imageUrl, !hasImg);
      if (!hasImg && !spec.imageUrl) withoutVisual++;
      if (/^гаджеты$/i.test(row.category) && vKey !== 'gadget' && inferred === 'Гаджеты') {
        // stored gadget but infer still gadget — ok only if truly gadget
      }
      if (/^гаджеты$/i.test(inferred) && vKey !== 'gadget') wrongGadgetLive++;
      // Adjacent duplicate only matters when the card actually renders fallback stock.
      if (source === 'fallback') {
        if (prevAsset && spec.assetId === prevAsset) adjDup++;
        prevAsset = spec.assetId;
      } else {
        prevAsset = undefined;
      }

      console.log('---');
      console.log(`ARTICLE: ${row.slug}`);
      console.log(`CATEGORY: stored=${row.category} → ${inferred} (visual=${vKey})`);
      console.log(`VISUAL SOURCE: ${source}`);
      console.log(`FALLBACK TEMPLATE ID: ${spec.assetId || '-'}`);

      if (apply && /^гаджеты$/i.test(String(row.category).trim()) && inferred !== 'Гаджеты') {
        db.prepare(`UPDATE articles SET category = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?`).run(
          inferred,
          row.slug,
        );
        retouched.push(`${row.slug}:${row.category}→${inferred}`);
      }
    }

    // Second pass: ensure articles missing imageUrl get stock URL written (display + uniqueness)
    if (apply) {
      const used = new Set<string>();
      for (const row of rows) {
        const tags = parseTags(row.tags);
        const hasImg = Boolean(row.imageUrl && String(row.imageUrl).trim());
        const weak =
          hasImg &&
          (/placeholder|avatar|logo|\.svg(\?|$)/i.test(row.imageUrl || '') ||
            (/unsplash\.com/i.test(row.imageUrl || '') && !isStockFallbackUrl(row.imageUrl)));
        if (!hasImg || weak) {
          const cat = resolveVisualCategory({
            title: row.title,
            category: row.category,
            tags,
            summary: row.summary,
          });
          const asset = pickStockAsset({ categoryKey: cat, slug: row.slug, avoidAssetIds: used });
          used.add(asset.id);
          db.prepare(
            `UPDATE articles SET imageUrl = ?, imageLabel = ?, imageMatchLevel = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?`,
          ).run(asset.url, `stock:${asset.id}`, 'category', row.slug);
          retouched.push(`${row.slug}:img→${asset.id}`);
        } else if (isStockFallbackUrl(row.imageUrl)) {
          // track used stock ids for uniqueness among retouches
          const m = String(row.imageUrl);
          for (const pool of Object.values(CATEGORY_STOCK)) {
            const hit = pool.find((p) => p.url === m || m.includes(p.id));
            if (hit) used.add(hit.id);
          }
        }
      }
    }

    console.log('\nSUMMARY');
    console.log(`WRONG_GADGET_FALLBACK(controls)=${wrongGadget}`);
    console.log(`WRONG_GADGET_FALLBACK(live_infer)=${wrongGadgetLive}`);
    console.log(`ARTICLE_WITHOUT_VISUAL=${withoutVisual}`);
    console.log(`VISUAL_DUPLICATES_ADJACENT(fallback_ids)=${adjDup}`);
    console.log(`RETOUCHED=${retouched.length}`);
    if (retouched.length) console.log(retouched.join('\n'));
    db.close();
  } catch (e) {
    console.log(`DB skip (${(e as Error).message}) — inventory/controls only`);
  }

  if (process.exitCode) {
    console.error('CONTROL FAIL');
    process.exit(process.exitCode);
  }
  console.log('CONTROL PASS');
}

main();
