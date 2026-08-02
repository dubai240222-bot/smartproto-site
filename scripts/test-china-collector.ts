/**
 * SP-A-035 — smoke test China Collector (safe sources). No AI, no writes, no publish.
 */
import { listSafeChinaSources } from '../src/lib/collectors/china-sources';
import { collectAndFilterChina } from '../src/lib/collectors/china-collector';

async function main() {
  const safe = listSafeChinaSources();
  console.log('=== China Collector v1 (SP-A-035) ===');
  console.log(`Safe sources: ${safe.length}`);
  for (const s of safe) console.log(`  - ${s.id} | ${s.type} | ${s.name} | ${s.url}`);

  const filtered = await collectAndFilterChina({ limitPerSource: 6 });
  const consider = filtered
    .filter((x) => x.decision === 'CONSIDER')
    .sort((a, b) => b.candidate.rawSignals.length - a.candidate.rawSignals.length)
    .slice(0, 10);

  console.log('\n--- Top CONSIDER (max 10) ---');
  if (!consider.length) console.log('(none)');
  for (const { candidate: c, decision, reason } of consider) {
    console.log('---');
    console.log(`sourceName: ${c.sourceName}`);
    console.log(`title: ${c.title}`);
    console.log(`sourceUrl: ${c.sourceUrl}`);
    console.log(`rawSignals: ${c.rawSignals.join(', ') || '(none)'}`);
    console.log(`decision: ${decision}`);
    console.log(`reason: ${reason}`);
  }

  const bySource = new Map(safe.map((s) => [s.id, 0]));
  for (const x of filtered) bySource.set(x.candidate.sourceId, (bySource.get(x.candidate.sourceId) || 0) + 1);
  const empty = [...bySource.entries()].filter(([, n]) => n === 0).map(([id]) => id);

  console.log('\n=== Summary ===');
  console.log(`collected+filtered: ${filtered.length}`);
  console.log(`CONSIDER: ${filtered.filter((x) => x.decision === 'CONSIDER').length}`);
  console.log(`REJECT: ${filtered.filter((x) => x.decision === 'REJECT').length}`);
  console.log(`empty sources (OK): ${empty.length ? empty.join(', ') : '(none)'}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
