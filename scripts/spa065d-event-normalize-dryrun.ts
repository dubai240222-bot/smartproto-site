/**
 * SP-A-065D — Event normalization dry-run.
 * Astra A/B/C control + ≥15 events (raw vs normalized Scout).
 * NO PUBLISH / NO AUTO / threshold 70 unchanged.
 *
 *   SCOUT_SCORE_THRESHOLD=70 npx tsx scripts/spa065d-event-normalize-dryrun.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectAiRadarCandidates,
  normalizeAiRadarCandidates,
  type AiRadarCandidate,
} from '../src/lib/ai/ai-radar';
import { buildNormalizedCandidate } from '../src/lib/ai/ai-event-normalize';
import { scoutArticle } from '../src/lib/ai/scout';

const FLOOR = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
const OUT_DIR = path.resolve(process.cwd(), 'data', 'spa065d');

const ASTRA_RE =
  /astra|critical cyber|cyber capabilit|next frontier of (cyber|critical)|responding to the next frontier|puts the brakes/i;
const GEMINI_ROBOT_RE = /gemini robotics|whole body intelligence/i;
const WEATHER_RE = /weathernext|forecast(?:ing)? cyclone/i;
const GPT_EFF_RE = /gpt-?5\.?6.*(efficien|frontier intelligence|price-performance)|fuses frontier intelligence/i;
const ENTERPRISE_RE = /how (codex|avatarin|hsp)|case study|built a .+ with|retail agent|creative team/i;
const NOISE_RE = /api (version|bump)|pricing|benchmark|model refresh|vibe coding|efficiency|price-performance/i;

function findCand(candidates: AiRadarCandidate[], re: RegExp) {
  return candidates.find((c) => re.test(`${c.title}\n${c.text}\n${c.url}`));
}
function findNorm(
  normalized: ReturnType<typeof normalizeAiRadarCandidates>,
  re: RegExp,
) {
  return normalized.find((c) =>
    re.test(`${c.title}\n${c.rawTitle}\n${c.url}\n${c.event.whatHappened}\n${c.event.capabilityChange}`),
  );
}

async function scoutRaw(title: string, text: string) {
  return scoutArticle(title, text, 'ai_radar');
}

async function scoutNormalized(summary: string, label: string) {
  return scoutArticle(label, summary, 'ai_radar');
}

async function main() {
  console.log(`SP-A-065D Event Normalization dry-run | floor=${FLOOR} | NO PUBLISH\n`);

  const { candidates, primaryPool, perSource, resolveStats } = await collectAiRadarCandidates({
    limitPerSource: 35,
  });
  const normalized = normalizeAiRadarCandidates(candidates, primaryPool);

  console.log('Feeds:', Object.keys(perSource).join('; '));
  console.log(
    `candidates=${candidates.length} normalized_events=${normalized.length}`,
  );
  console.log(
    `primaryOrigin=${resolveStats.primaryOrigin} neededPrimary=${resolveStats.neededPrimary} withPrimary=${resolveStats.discoveryWithPrimary} unresolved=${resolveStats.discoveryUnresolved}`,
  );
  const resolveRate =
    resolveStats.neededPrimary > 0
      ? resolveStats.discoveryWithPrimary / resolveStats.neededPrimary
      : null;
  console.log(
    `resolve_rate_among_needed=${resolveRate === null ? 'n/a' : `${(resolveRate * 100).toFixed(1)}%`}`,
  );

  const astraPrimary =
    candidates.find(
      (c) => ASTRA_RE.test(`${c.title}\n${c.url}`) && c.primaryStatus === 'PRIMARY_ORIGIN',
    ) ||
    candidates.find((c) => /openai\.com.*critical-cyber|responding-next-frontier/i.test(c.url));
  const astraVerge = candidates.find(
    (c) => ASTRA_RE.test(`${c.title}\n${c.url}`) && /verge/i.test(c.sourceName),
  );
  let astraNorm = findNorm(normalized, ASTRA_RE);
  if (!astraNorm && astraPrimary) {
    astraNorm = buildNormalizedCandidate(
      astraPrimary,
      primaryPool,
      astraVerge
        ? { title: astraVerge.title, text: astraVerge.text, sourceName: astraVerge.sourceName }
        : undefined,
    );
  }

  console.log('\n=== ASTRA CONTROL A/B/C ===');
  console.log('Normalized EVENT RECORD preview:');
  if (astraNorm) {
    console.log(astraNorm.event.summaryForScout.slice(0, 900));
    console.log('---');
  }

  const astraA = astraPrimary
    ? await scoutRaw(astraPrimary.title, astraPrimary.text)
    : null;
  const astraB = astraVerge ? await scoutRaw(astraVerge.title, astraVerge.text) : null;
  const astraC = astraNorm
    ? await scoutNormalized(astraNorm.event.summaryForScout, astraNorm.title)
    : null;

  console.log(
    `A official headline alone: ${astraA ? astraA.score : 'N/A'} — ${astraA?.reason?.slice(0, 100) || ''}`,
  );
  console.log(
    `B Verge headline alone:    ${astraB ? astraB.score : 'N/A'} — ${astraB?.reason?.slice(0, 100) || ''}`,
  );
  console.log(
    `C normalized EVENT:        ${astraC ? astraC.score : 'N/A'} — ${astraC?.reason?.slice(0, 100) || ''}  ← MAIN`,
  );

  // Build ≥15 test set with required stories
  const requiredRes = [
    { key: 'astra', n: astraNorm },
    { key: 'gemini_robotics', n: findNorm(normalized, GEMINI_ROBOT_RE) },
    { key: 'weathernext', n: findNorm(normalized, WEATHER_RE) },
    { key: 'gpt56_efficiency', n: findNorm(normalized, GPT_EFF_RE) },
    {
      key: 'enterprise_case',
      n:
        findNorm(normalized, ENTERPRISE_RE) ||
        (() => {
          const c = findCand(candidates, ENTERPRISE_RE);
          return c ? buildNormalizedCandidate(c, primaryPool) : undefined;
        })(),
    },
    {
      key: 'noise_refresh',
      n:
        findNorm(normalized, NOISE_RE) ||
        findNorm(normalized, /vibe coding|benchmark|api version|pricing tier/i) ||
        findNorm(normalized, GPT_EFF_RE),
    },
  ];

  const testSet = [...normalized];
  for (const r of requiredRes) {
    if (r.n && !testSet.some((t) => t.url === r.n!.url && t.title === r.n!.title)) {
      testSet.unshift(r.n);
    }
  }

  // Prefer diversity: high/med first, then fill low noise samples
  const selected: typeof normalized = [];
  const pushUnique = (item: (typeof normalized)[0]) => {
    if (selected.some((s) => s.title === item.title || s.url === item.url)) return;
    selected.push(item);
  };
  for (const r of requiredRes) if (r.n) pushUnique(r.n);
  for (const n of normalized.filter((x) => x.priority === 'high' || x.priority === 'medium')) {
    if (selected.length >= 15) break;
    pushUnique(n);
  }
  for (const n of normalized.filter((x) => x.priority === 'low')) {
    if (selected.length >= 16) break;
    pushUnique(n);
  }

  console.log(`\nScouting ${selected.length} events (raw + normalized)...\n`);

  const rows: {
    title: string;
    source: string;
    primaryStatus: string;
    rawScore: number;
    normalizedScore: number;
    reason: string;
    decision: string;
    tag?: string;
  }[] = [];

  for (const item of selected) {
    const tag = requiredRes.find((r) => r.n && r.n.title === item.title)?.key;
    try {
      const raw = await scoutRaw(item.rawTitle, item.rawText);
      const norm = await scoutNormalized(item.event.summaryForScout, item.title);
      const decision = norm.score >= FLOOR ? 'PUBLISH_CANDIDATE' : 'REJECT';
      rows.push({
        title: item.title.slice(0, 100),
        source: item.sourceName,
        primaryStatus: item.primaryStatus,
        rawScore: raw.score,
        normalizedScore: norm.score,
        reason: (norm.reason || '').slice(0, 160),
        decision,
        tag,
      });
      console.log(
        `raw=${String(raw.score).padStart(3)} norm=${String(norm.score).padStart(3)} ${decision.padEnd(18)} [${item.primaryStatus}] ${item.title.slice(0, 55)}`,
      );
    } catch (err) {
      console.log(
        `ERR [${item.sourceName}] ${item.title.slice(0, 40)}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  const astraRow = rows.find((r) => r.tag === 'astra') || rows.find((r) => ASTRA_RE.test(r.title));
  const geminiRow = rows.find((r) => r.tag === 'gemini_robotics');
  const weatherRow = rows.find((r) => r.tag === 'weathernext');
  const gptRow = rows.find((r) => r.tag === 'gpt56_efficiency');
  const entRow = rows.find((r) => r.tag === 'enterprise_case');
  const noiseRow = rows.find((r) => r.tag === 'noise_refresh');

  const report = {
    id: 'SP-A-065D-R1',
    floor: FLOOR,
    resolveStats: {
      ...resolveStats,
      resolveRateAmongNeeded: resolveRate,
    },
    astraControl: {
      A_officialAlone: astraA ? { score: astraA.score, reason: astraA.reason, title: astraPrimary?.title } : null,
      B_vergeAlone: astraB ? { score: astraB.score, reason: astraB.reason, title: astraVerge?.title } : null,
      C_normalized: astraC
        ? {
            score: astraC.score,
            reason: astraC.reason,
            pass70: astraC.score >= FLOOR,
            event: astraNorm?.event,
          }
        : null,
      mainDecision: 'C_normalized',
    },
    testSet: rows,
    successChecks: {
      astraStrongViaNormalized: Boolean(astraC && astraC.score >= 70),
      astraGapOfficialVsVergeReduced: Boolean(
        astraA && astraB && astraC && Math.abs(astraC.score - astraA.score) < Math.abs(astraB.score - astraA.score),
      ),
      geminiRoboticsStrong: Boolean(geminiRow && geminiRow.normalizedScore >= 70),
      weatherNotAutoHigh: weatherRow ? weatherRow.normalizedScore < 70 || weatherRow.normalizedScore >= 50 : null,
      gptEfficiencyLow: Boolean(gptRow && gptRow.normalizedScore < 50),
      enterpriseLow: Boolean(entRow && entRow.normalizedScore < 50),
      noiseLow: Boolean(noiseRow && noiseRow.normalizedScore < 50),
    },
    recommendation:
      astraC && astraC.score >= 70 && geminiRow && geminiRow.normalizedScore >= 70
        ? 'Event normalization works for Astra/Gemini controls; still dry-run only — do not enable AUTO.'
        : 'Needs more calibration; stay dry-run.',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'spa065d-r1.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);

  console.log('\n======== SP-A-065D-R1 ========');
  console.log(
    `Astra A=${astraA?.score ?? 'n/a'} B=${astraB?.score ?? 'n/a'} C(normalized)=${astraC?.score ?? 'n/a'} pass@70=${astraC ? astraC.score >= FLOOR : false}`,
  );
  console.log(
    `Gemini Robotics norm=${geminiRow?.normalizedScore ?? 'n/a'} Weather=${weatherRow?.normalizedScore ?? 'n/a'} GPT-eff=${gptRow?.normalizedScore ?? 'n/a'} Enterprise=${entRow?.normalizedScore ?? 'n/a'}`,
  );
  console.log(
    `Resolve among needed: ${resolveStats.discoveryWithPrimary}/${resolveStats.neededPrimary}`,
  );
  console.log('Test set:');
  for (const r of rows) {
    console.log(
      `  ${r.decision} raw=${r.rawScore} norm=${r.normalizedScore} [${r.primaryStatus}] ${r.title}`,
    );
  }
  console.log(`Recommendation: ${report.recommendation}`);
  console.log('\nSTOP — no publish.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
