/**
 * SP-A-065C — AI Early Warning dry-run.
 * Collect AI radar → event filter → resolve primary → Scout.
 * NO PUBLISH / NO FORCED / NO AUTO.
 *
 *   npx tsx scripts/spa065c-ai-radar-dryrun.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectAiRadarCandidates,
  buildAiScoutPool,
  type AiRadarCandidate,
} from '../src/lib/ai/ai-radar';
import { scoutArticle } from '../src/lib/ai/scout';
import { AI_RADAR_SKIPPED } from '../src/lib/collectors/ai-radar-sources';

const FLOOR = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
const OUT_DIR = path.resolve(process.cwd(), 'data', 'spa065c');
const ASTRA_RE =
  /astra|critical cyber|cyber capabilit|next frontier of (cyber|critical)|preparedness.?framework|responding to the next frontier/i;

function isAstra(c: { title: string; text?: string; url?: string }): boolean {
  return ASTRA_RE.test(`${c.title}\n${c.text || ''}\n${c.url || ''}`);
}

async function main() {
  console.log(`SP-A-065C AI Early Warning dry-run | floor=${FLOOR} | NO PUBLISH\n`);

  const { candidates, perSource, skipped } = await collectAiRadarCandidates({
    limitPerSource: 35,
  });

  console.log('=== Feeds ===');
  for (const [name, st] of Object.entries(perSource)) {
    console.log(`  ${name} (${st.role}): raw=${st.raw} kept=${st.kept}`);
  }
  console.log('\nSkipped (not safely connectable):');
  for (const s of skipped.length ? skipped : AI_RADAR_SKIPPED) {
    console.log(`  - ${s.name}: ${s.reason}`);
  }

  const highMed = candidates.filter((c) => c.priority === 'high' || c.priority === 'medium');
  const resolvedNeed = candidates.filter((c) => c.needsPrimaryResolve);
  const resolvedOk = resolvedNeed.filter((c) => c.primaryResolved);

  console.log(`\ncandidates_total=${candidates.length} high|medium=${highMed.length}`);
  console.log(
    `discovery_needing_primary=${resolvedNeed.length} resolved_to_primary=${resolvedOk.length}`,
  );

  const astraHits = candidates.filter(isAstra);
  console.log(`\nAstra control hits in candidates: ${astraHits.length}`);
  for (const a of astraHits.slice(0, 3)) {
    console.log(
      `  [${a.priority}] ${a.sourceName} primary=${a.primaryResolved} | ${a.title.slice(0, 90)}`,
    );
    console.log(`    url=${a.url}`);
    if (a.primaryUrl && a.primaryUrl !== a.url) console.log(`    primaryUrl=${a.primaryUrl}`);
  }

  // Scout pool: high/medium via shared pre-rank, force Astra into pool for control
  const pool = buildAiScoutPool(candidates, 14);
  const toScout: AiRadarCandidate[] = [];
  const seen = new Set<string>();
  for (const a of astraHits) {
    if (seen.has(a.title)) continue;
    seen.add(a.title);
    toScout.push(a);
  }
  for (const p of pool.pool) {
    if (toScout.length >= 15) break;
    const full = candidates.find((c) => c.title === p.title);
    if (!full || seen.has(full.title)) continue;
    seen.add(full.title);
    toScout.push(full);
  }
  // Fill with remaining high priority
  for (const c of highMed) {
    if (toScout.length >= 15) break;
    if (seen.has(c.title)) continue;
    seen.add(c.title);
    toScout.push(c);
  }

  console.log(`\nScouting ${toScout.length} AI radar items (общий Scout)...\n`);

  const scored: {
    title: string;
    source: string;
    radarRole: string;
    priority: string;
    score: number;
    reason: string;
    primaryResolved: boolean;
    primaryUrl?: string;
    url: string;
    signals: string[];
    pass70: boolean;
    astra: boolean;
  }[] = [];

  for (const item of toScout) {
    try {
      const scout = await scoutArticle(item.title, item.text);
      const row = {
        title: item.title,
        source: item.sourceName,
        radarRole: item.radarRole,
        priority: item.priority,
        score: scout.score,
        reason: (scout.reason || '').slice(0, 140),
        primaryResolved: item.primaryResolved,
        primaryUrl: item.primaryUrl,
        url: item.url,
        signals: item.eventSignals,
        pass70: scout.score >= FLOOR,
        astra: isAstra(item),
      };
      scored.push(row);
      console.log(
        `scout ${String(scout.score).padStart(3)} ${row.pass70 ? 'PASS' : 'fail'} [${item.priority}/${item.sourceName}] ${item.title.slice(0, 58)}`,
      );
    } catch (err) {
      console.log(
        `scout ERR [${item.sourceName}] ${item.title.slice(0, 50)}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  scored.sort((a, b) => b.score - a.score);
  console.log('\n=== TOP-10 AI radar (Scout) ===');
  for (const [i, row] of scored.slice(0, 10).entries()) {
    console.log(
      `${i + 1}. ${row.score} ${row.pass70 ? 'PASS' : 'fail'} [${row.source}/${row.priority}] ${row.title.slice(0, 70)}`,
    );
    console.log(`   ${row.reason}`);
  }

  const astraScored = scored.filter((s) => s.astra);
  const astraBest = astraScored.sort((a, b) => b.score - a.score)[0];

  const hypeLow = candidates.filter(
    (c) =>
      c.priority === 'low' &&
      /openai|anthropic|google|meta|gpt|claude|gemini/i.test(c.title) &&
      /pricing|api|benchmark|refresh|partnership|dinner|hooks/i.test(c.title),
  );

  const report = {
    id: 'SP-A-065C-R1',
    floor: FLOOR,
    feedsConnected: Object.entries(perSource).map(([name, st]) => ({
      name,
      ...st,
    })),
    feedsSkipped: skipped.length ? skipped : AI_RADAR_SKIPPED,
    candidatesTotal: candidates.length,
    highMedium: highMed.length,
    discoveryNeedingPrimary: resolvedNeed.length,
    discoveryResolvedToPrimary: resolvedOk.length,
    astraFound: astraHits.length > 0,
    astra: astraBest
      ? {
          title: astraBest.title,
          source: astraBest.source,
          url: astraBest.url,
          primaryResolved: astraBest.primaryResolved,
          primaryUrl: astraBest.primaryUrl,
          score: astraBest.score,
          pass70: astraBest.pass70,
          reason: astraBest.reason,
          priority: astraBest.priority,
          signals: astraBest.signals,
        }
      : astraHits[0]
        ? {
            title: astraHits[0].title,
            source: astraHits[0].sourceName,
            url: astraHits[0].url,
            primaryResolved: astraHits[0].primaryResolved,
            primaryUrl: astraHits[0].primaryUrl,
            score: null,
            pass70: false,
            reason: 'not scouted',
            priority: astraHits[0].priority,
            signals: astraHits[0].eventSignals,
          }
        : null,
    top10: scored.slice(0, 10),
    hypeFalsePositivesSample: hypeLow.slice(0, 8).map((c) => ({
      title: c.title,
      source: c.sourceName,
      priority: c.priority,
    })),
    scouted: scored.length,
    wouldPass70: scored.filter((s) => s.pass70).length,
    recommendationLiveTestAuto: null as string | null,
  };

  // Recommendation heuristic (dry-run only)
  const astraOk = report.astraFound && astraBest && astraBest.score >= 55;
  const enoughSignal = scored.filter((s) => s.score >= 60).length >= 3;
  const lowHypeBleed = scored.filter((s) => s.priority === 'low' && s.score >= FLOOR).length === 0;
  report.recommendationLiveTestAuto =
    astraOk && enoughSignal && lowHypeBleed
      ? 'CONDITIONAL — dry-run looks usable for gated TEST-AUTO on AI channel only; keep gadget pipeline separate; do NOT enable normal AUTO yet.'
      : 'NOT READY — keep AI radar dry-run / fix signal quality before TEST-AUTO.';

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'spa065c-r1.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);

  console.log('\n======== SP-A-065C-R1 ========');
  console.log(
    `1. RSS connected: ${report.feedsConnected.map((f) => f.name).join('; ')}`,
  );
  console.log(
    `2. Not safely connected: ${report.feedsSkipped.map((f) => f.name).join('; ')}`,
  );
  console.log(`3. AI candidates found: ${report.candidatesTotal} (high|med=${report.highMedium})`);
  console.log('4. TOP-10:');
  for (const [i, row] of report.top10.entries()) {
    console.log(
      `   ${i + 1}. ${row.score} ${row.pass70 ? 'PASS' : 'fail'} [${row.source}] ${row.title}`,
    );
  }
  console.log(`5. Astra found: ${report.astraFound ? 'YES' : 'NO'}`);
  console.log(
    `6. Astra primary: ${
      report.astra?.primaryResolved
        ? report.astra.primaryUrl || report.astra.url
        : 'NOT RESOLVED / N/A'
    }`,
  );
  console.log(`7. Astra score: ${report.astra?.score ?? 'N/A'} (pass@${FLOOR}=${report.astra?.pass70})`);
  console.log(
    `8. Discovery→primary resolved: ${report.discoveryResolvedToPrimary}/${report.discoveryNeedingPrimary}`,
  );
  console.log(
    `9. Hype/low false themes sample: ${report.hypeFalsePositivesSample.length} (brand fluff filtered to low)`,
  );
  console.log(`10. Recommendation: ${report.recommendationLiveTestAuto}`);
  console.log('\nSTOP — no publish.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
