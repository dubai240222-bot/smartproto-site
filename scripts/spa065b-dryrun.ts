/**
 * SP-A-065B — dry-run: pre-rank → Scout ≥30 diversified candidates. NO PUBLISH.
 *
 *   npx tsx scripts/spa065b-dryrun.ts
 */
import 'dotenv/config';
import { fetchRssFeed } from '../src/lib/collectors/rss';
import { enabledRssSources } from '../src/lib/collectors/source-registry';
import { looksBuyableGadget } from '../src/lib/ai/hard-reject';
import { scoutArticle } from '../src/lib/ai/scout';
import { buildScoutPool, cheapPreRankScore } from '../src/lib/ai/candidate-prerank';
import {
  looksCommodityRoutine,
  looksSmartHomeRoutine,
} from '../src/lib/ai/scout-recalibrate';

const ETALONS = [
  {
    key: 'Meta',
    title: 'Meta wants to replace your mouse and keyboard with this bracelet',
    text: 'Meta gesture wristband reads neuromuscular signals for handwriting and computer control without touching a keyboard or mouse.',
    oldScore: 86,
  },
  {
    key: 'RainPoint',
    title: "RainPoint's connected watering system puts a gateway, two zones, and a soil sensor",
    text: 'Smart irrigation kit with soil moisture sensor, rain sensor, gateway and two watering zones controlled by app.',
    oldScore: 83,
  },
  {
    key: 'Altar',
    title: 'Altar II Mechanical Keyboard',
    text: 'Ultra-thin mechanical keyboard 4.75mm with tactile feedback and unique low-profile switches. Crowdfunding mechanical board.',
    oldScore: 82,
  },
  {
    key: 'Delta',
    title: 'Delta Children Aero Smart Auto-Glide Bassinet',
    text: 'Smart bassinet that automatically responds to baby cry with gliding motion and soothing. Auto-detects fussing and starts motion without parent app tap.',
    oldScore: 78,
  },
];

async function main() {
  const floor = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
  console.log(`SP-A-065B dry-run | floor=${floor} | NO PUBLISH\n`);

  const sources = enabledRssSources();
  const cands: {
    title: string;
    text: string;
    url: string;
    sourceName: string;
  }[] = [];

  for (const src of sources) {
    const items = await fetchRssFeed(src.feedUrl, {
      limit: src.limit ?? 25,
      sourceName: src.name,
      maxRawBytes: src.maxRawBytes,
      skipPageImageFetch: true,
    });
    let kept = 0;
    for (const it of items) {
      if (!it.title || !it.url) continue;
      if (!looksBuyableGadget(it.title, it.text || '', src.name)) continue;
      kept += 1;
      cands.push({
        title: it.title,
        text: it.text || it.title,
        url: it.url,
        sourceName: src.name,
      });
    }
    console.log(`  ${src.name}: raw=${items.length} cand=${kept}`);
  }

  const pool = buildScoutPool(cands, { limit: 16, maxPerSource: 3 });
  console.log(
    `\nraw_candidates=${pool.rawCount} after_dedupe=${pool.afterDedupe} scout_pool=${pool.pool.length}`,
  );
  console.log('pre-rank preview:');
  for (const r of pool.rankedPreview.slice(0, 12)) {
    console.log(`  cheap=${r.cheap} [${r.sourceName}] ${r.title.slice(0, 70)}`);
  }

  // Scout: pool (≤16) + etalons + fill to ≥30 from diversified ranked list
  const toScout: { title: string; text: string; sourceName: string; tag?: string }[] = [];
  for (const e of ETALONS) {
    toScout.push({ title: e.title, text: e.text, sourceName: 'etalon', tag: e.key });
  }
  for (const p of pool.pool) {
    toScout.push({ title: p.title, text: p.text || p.title, sourceName: p.sourceName });
  }
  // Fill from ranked preview beyond pool for diversity to reach ≥30
  for (const r of pool.rankedPreview) {
    if (toScout.length >= 34) break;
    if (toScout.some((t) => t.title === r.title)) continue;
    const full = cands.find((c) => c.title === r.title);
    if (!full) continue;
    toScout.push({ title: full.title, text: full.text, sourceName: full.sourceName });
  }
  // Extra diversity: one more from each discovery source if missing
  for (const src of sources.filter((s) => s.tier === 'A_DISCOVERY')) {
    if (toScout.length >= 36) break;
    const hit = cands.find(
      (c) => c.sourceName === src.name && !toScout.some((t) => t.title === c.title),
    );
    if (hit) toScout.push({ title: hit.title, text: hit.text, sourceName: hit.sourceName });
  }

  console.log(`\nScouting ${toScout.length} items...\n`);
  const scored: {
    title: string;
    source: string;
    score: number;
    status?: string;
    reason: string;
    commodity: boolean;
    tag?: string;
    cheap: number;
  }[] = [];

  for (const item of toScout) {
    try {
      const scout = await scoutArticle(item.title, item.text);
      scored.push({
        title: item.title,
        source: item.sourceName,
        score: scout.score,
        status: scout.status,
        reason: scout.reason.slice(0, 90),
        commodity:
          looksCommodityRoutine(item.title, item.text) ||
          looksSmartHomeRoutine(item.title, item.text),
        tag: item.tag,
        cheap: cheapPreRankScore(item),
      });
      console.log(
        `scout ${String(scout.score).padStart(3)} cheap=${String(cheapPreRankScore(item)).padStart(3)} [${item.sourceName}] ${item.title.slice(0, 55)} | ${scout.status}`,
      );
    } catch (err) {
      console.log(
        `scout ERR [${item.sourceName}] ${item.title.slice(0, 50)}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const live = scored.filter((s) => s.source !== 'etalon');
  live.sort((a, b) => b.score - a.score);
  console.log('\n=== TOP-15 Scout (live feeds) ===');
  for (const row of live.slice(0, 15)) {
    console.log(
      `${row.score} ${row.score >= floor ? 'PASS' : 'fail'} [${row.source}] ${row.title.slice(0, 65)} (${row.status})${row.commodity ? ' COMMODITY' : ''}`,
    );
  }

  const top15 = live.slice(0, 15);
  const sourcesInTop = new Set(top15.map((r) => r.source));
  console.log('\n=== SUMMARY ===');
  console.log(`raw_candidates: ${pool.rawCount}`);
  console.log(`after_cheap_prerank_dedupe_pool: ${pool.pool.length} (from ${pool.afterDedupe} deduped)`);
  console.log(`scouted_total: ${scored.length} (live=${live.length}, etalons=${scored.length - live.length})`);
  console.log(`top15_source_diversity: ${sourcesInTop.size} → ${[...sourcesInTop].join(', ')}`);
  console.log(`commodity_in_top15: ${top15.filter((r) => r.commodity).length}`);
  console.log(`would_publish_@${floor}_in_top15: ${top15.filter((r) => r.score >= floor).length}`);

  console.log('\n=== ETALONS old → new ===');
  for (const e of ETALONS) {
    const hit = scored.find((s) => s.tag === e.key);
    console.log(
      `${e.key}: old=${e.oldScore} new=${hit ? hit.score : 'ERR'} ${hit ? hit.reason.slice(0, 70) : ''}`,
    );
  }
  console.log('\nSTOP — no publish.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
