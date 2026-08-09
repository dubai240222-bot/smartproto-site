import 'dotenv/config';
import fs from 'node:fs';
import { normalizeAiEvent } from '../src/lib/ai/ai-event-normalize';
import { scoutArticle } from '../src/lib/ai/scout';

/** Economy: re-score only Astra C; keep prior A/B from R1. */
const ASTRA_PRIMARY = {
  title: 'Responding to the next frontier of critical cyber capabilities',
  text: 'OpenAI is sharing preliminary cybersecurity evaluations for Astra and the steps we are taking to strengthen safeguards and security controls.',
  url: 'https://openai.com/index/responding-next-frontier-critical-cyber-capabilities',
};
const ASTRA_VERGE = {
  title: "OpenAI puts the brakes on a new model because it's supposedly too powerful",
  text: 'OpenAI is pausing further development related to a model after critical cyber capability evaluations, according to reporting on Astra and preparedness controls.',
  url: 'https://www.theverge.com/ai-artificial-intelligence/976948/openai-astra-model-pause-critical-cyber-capabilities',
};

async function main() {
  const ev = normalizeAiEvent({
    title: ASTRA_VERGE.title,
    text: ASTRA_VERGE.text,
    url: ASTRA_VERGE.url,
    sourceName: 'The Verge AI',
    radarRole: 'secondary',
    primaryStatus: 'DISCOVERY_WITH_PRIMARY',
    primaryUrl: ASTRA_PRIMARY.url,
    primaryTitle: ASTRA_PRIMARY.title,
    primaryText: ASTRA_PRIMARY.text,
    secondaryTitle: ASTRA_VERGE.title,
    secondaryText: ASTRA_VERGE.text,
  });
  console.log('--- EVENT preview ---');
  console.log(ev.summaryForScout.slice(0, 900));
  console.log('--- Scout C only ---');
  const r = await scoutArticle(ASTRA_PRIMARY.title, ev.summaryForScout, 'ai_radar');
  const C = { score: r.score, reason: (r.reason || '').slice(0, 200), pass: r.score >= 70 };
  console.log('C', C.score, C.pass, C.reason);

  const prev = JSON.parse(fs.readFileSync('data/spa065d/spa065d-r1.json', 'utf8'));
  const A = prev.astra.A_official;
  const B = prev.astra.B_verge;
  prev.astra = {
    A_official: A,
    B_verge: B,
    C_normalized: { ...C, event: ev },
    mainDecision: 'C_normalized',
    gapOfficialVsVerge: Math.abs(B.score - A.score),
    gapNormalizedVsVerge: Math.abs(C.score - B.score),
    gapNormalizedVsOfficial: Math.abs(C.score - A.score),
  };
  prev.controlSet = prev.controlSet.map((row: { key: string }) =>
    row.key === 'astra'
      ? {
          ...row,
          rawScore: B.score,
          normScore: C.score,
          decision: C.pass ? 'PASS' : 'REJECT',
          reason: C.reason,
        }
      : row,
  );
  prev.recommendation = C.pass
    ? 'Normalized Astra stays strong on facts (not Verge drama). Do NOT merge PR #5 until 065D reviewed; AI radar not live yet.'
    : 'Normalized path still weak — calibrate further before merge.';
  prev.statusHint = C.pass ? 'DONE' : 'PARTIAL';
  fs.writeFileSync('data/spa065d/spa065d-r1.json', JSON.stringify(prev, null, 2));
  console.log('UPDATED R1');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
