/**
 * SP-A-036 — Collector CONSIDER → Qwen China Analyst (max 3). No publish / drafts / articles.json.
 * Qwen analyzes provided candidates only (no web browse).
 */
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(root, '.env'), quiet: true });

const MAX_QWEN = 3;

async function main() {
  console.log('=== China Collector → Qwen Analyst (SP-A-036) ===');

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    console.error('OPENROUTER_API_KEY not set in .env.local — skipping Qwen. No files changed.');
    process.exitCode = 0;
    return;
  }

  process.env.CHINA_DEPARTMENT_ENABLED = 'true';

  const { collectAndFilterChina } = await import('../src/lib/collectors/china-collector');
  const { analyzeChinaCandidate } = await import('../src/lib/ai/china-analyst');

  const filtered = await collectAndFilterChina({ limitPerSource: 6 });
  const consider = filtered
    .filter((x) => x.decision === 'CONSIDER')
    .sort((a, b) => b.candidate.rawSignals.length - a.candidate.rawSignals.length)
    .slice(0, MAX_QWEN)
    .map((x) => x.candidate);

  console.log(`CONSIDER total: ${filtered.filter((x) => x.decision === 'CONSIDER').length}`);
  console.log(`Sending to Qwen: ${consider.length} (max ${MAX_QWEN})`);

  if (!consider.length) {
    console.log('No CONSIDER candidates — nothing to analyze.');
    return;
  }

  let aiCalls = 0;
  const dossiers: Awaited<ReturnType<typeof analyzeChinaCandidate>>[] = [];

  for (const c of consider) {
    console.log('\n--- candidate ---');
    console.log(`title: ${c.title}`);
    console.log(`sourceUrl: ${c.sourceUrl}`);
    console.log(`rawSignals: ${c.rawSignals.join(', ') || '(none)'}`);
    try {
      aiCalls += 1; // OpenRouter attempt (CONSIDER already passed hard-reject)
      const d = await analyzeChinaCandidate(c);
      if (d.unknownFacts.includes('rejected before model')) aiCalls -= 1;
      dossiers.push(d);
      console.log('--- dossier ---');
      console.log(`originalTitle: ${d.originalTitle}`);
      console.log(`translatedTitle: ${d.translatedTitle}`);
      console.log(`productName: ${d.productName}`);
      console.log(`whatItDoes: ${d.whatItDoes}`);
      console.log(`whyItIsNew: ${d.whyItIsNew}`);
      console.log(`consumerUse: ${d.consumerUse}`);
      console.log(`priceOriginal: ${d.priceOriginal}`);
      console.log(`availability: ${d.availability}`);
      console.log(`unknownFacts: ${JSON.stringify(d.unknownFacts)}`);
      console.log(`warningFlags: ${JSON.stringify(d.warningFlags)}`);
      console.log(`recommended: ${d.recommended}`);
      console.log(`sourceSuggestions: ${JSON.stringify(d.sourceSuggestions)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Qwen/OpenRouter failed for candidate (skip): ${msg}`);
      continue;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`dossiers: ${dossiers.length}`);
  console.log(`aiCalls: ${aiCalls}`);
  console.log(`recommended true: ${dossiers.filter((d) => d.recommended).length}`);
  console.log(`recommended false: ${dossiers.filter((d) => !d.recommended).length}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal (graceful): ${msg}`);
  process.exitCode = 0;
});
