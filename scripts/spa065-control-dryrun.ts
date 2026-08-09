/**
 * SP-A-065 — control dry-run: collect candidates from expanded sources, score TOP pool, no publish.
 *
 *   npx tsx scripts/spa065-control-dryrun.ts
 */
import 'dotenv/config';
import { fetchRssFeed } from '../src/lib/collectors/rss';
import { enabledRssSources, SKIPPED_STARTER_SOURCES } from '../src/lib/collectors/source-registry';
import { looksBuyableGadget } from '../src/lib/ai/hard-reject';
import { scoutArticle } from '../src/lib/ai/scout';
import {
  looksCommodityRoutine,
  looksSmartHomeRoutine,
} from '../src/lib/ai/scout-recalibrate';

async function main() {
  const floor = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
  const sources = enabledRssSources();
  console.log(`SP-A-065 control dry-run | sources=${sources.length} | floor=${floor} | NO PUBLISH\n`);
  console.log('Skipped starter sources:');
  for (const s of SKIPPED_STARTER_SOURCES) console.log(`  - ${s.name}: ${s.reason}`);

  const perSource: Record<string, { raw: number; candidates: number }> = {};
  const candidates: { title: string; text: string; url: string; sourceName: string }[] = [];

  for (const src of sources) {
    try {
      const items = await fetchRssFeed(src.feedUrl, {
        limit: src.limit ?? 30,
        sourceName: src.name,
        maxRawBytes: src.maxRawBytes,
        skipPageImageFetch: true,
      });
      let kept = 0;
      for (const it of items) {
        if (!it.title || !it.url) continue;
        if (!looksBuyableGadget(it.title, it.text || '', src.name)) continue;
        kept += 1;
        candidates.push({
          title: it.title,
          text: it.text || it.title,
          url: it.url,
          sourceName: src.name,
        });
      }
      perSource[src.name] = { raw: items.length, candidates: kept };
      console.log(`  ${src.name}: raw=${items.length} candidates=${kept} tier=${src.tier}`);
    } catch (err) {
      perSource[src.name] = { raw: 0, candidates: 0 };
      console.log(`  ${src.name}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nTotal gadget candidates after filters: ${candidates.length}`);
  // Score first 24 unique-ish titles (time budget)
  const scored: {
    title: string;
    source: string;
    score: number;
    status?: string;
    reason: string;
    commodity: boolean;
  }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    if (scored.length >= 24) break;
    try {
      const scout = await scoutArticle(c.title, c.text);
      scored.push({
        title: c.title,
        source: c.sourceName,
        score: scout.score,
        status: scout.status,
        reason: scout.reason,
        commodity:
          looksCommodityRoutine(c.title, c.text) || looksSmartHomeRoutine(c.title, c.text),
      });
      console.log(
        `scout ${String(scout.score).padStart(3)} [${c.sourceName}] ${c.title.slice(0, 70)} | ${scout.status} | ${scout.reason.slice(0, 50)}`,
      );
    } catch (err) {
      console.log(`scout ERR [${c.sourceName}] ${c.title.slice(0, 50)}: ${err}`);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  console.log('\n=== TOP-10 by new score ===');
  for (const row of scored.slice(0, 10)) {
    console.log(
      `${row.score} ${row.score >= floor ? 'PASS' : 'fail'} [${row.source}] ${row.title.slice(0, 70)} (${row.status})`,
    );
  }
  const would = scored.filter((s) => s.score >= floor);
  const commodityDown = scored.filter((s) => s.commodity);
  const focusHits = scored.filter((s) =>
    /robot|ai|research|mit|ieee|wyss|csail|eth|technode|xplore/i.test(
      `${s.title} ${s.source} ${s.reason}`,
    ),
  );
  console.log('\n=== CONTROL SUMMARY ===');
  console.log(JSON.stringify(perSource, null, 2));
  console.log(`scored: ${scored.length}`);
  console.log(`would publish @${floor}: ${would.length}`);
  console.log(`commodity-flagged among scored: ${commodityDown.length}`);
  console.log(`robotics/AI/research-ish among scored: ${focusHits.length}`);
  console.log('Recommendation: do NOT flip long AUTO until editorial reviews TOP-10.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
