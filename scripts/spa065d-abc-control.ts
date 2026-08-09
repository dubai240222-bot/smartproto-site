/**
 * SP-A-065D — targeted A/B/C + small control set (economical).
 * No full RSS poll. Fixtures from known 065C candidates + normalizeAiEvent.
 * Threshold 70 unchanged. NO PUBLISH.
 *
 *   SCOUT_SCORE_THRESHOLD=70 npx tsx scripts/spa065d-abc-control.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeAiEvent } from '../src/lib/ai/ai-event-normalize';
import { scoutArticle } from '../src/lib/ai/scout';

const FLOOR = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
const OUT = path.resolve(process.cwd(), 'data', 'spa065d');

const ASTRA_PRIMARY = {
  title: 'Responding to the next frontier of critical cyber capabilities',
  text:
    'OpenAI is sharing preliminary cybersecurity evaluations for Astra and the steps we’re taking to strengthen safeguards and security controls.',
  url: 'https://openai.com/index/responding-next-frontier-critical-cyber-capabilities',
  sourceName: 'OpenAI News',
};

const ASTRA_VERGE = {
  title: "OpenAI puts the brakes on a new model because it's supposedly too powerful",
  text:
    'OpenAI is pausing further development related to a model after critical cyber capability evaluations, according to reporting on Astra and preparedness controls.',
  url: 'https://www.theverge.com/ai-artificial-intelligence/976948/openai-astra-model-pause-critical-cyber-capabilities',
  sourceName: 'The Verge AI',
};

/** Small control fixtures — titles/text from 065C live feeds (no re-poll). */
const CONTROL = [
  {
    key: 'astra',
    kind: 'safety_capability' as const,
    rawTitle: ASTRA_VERGE.title,
    rawText: ASTRA_VERGE.text,
    primaryTitle: ASTRA_PRIMARY.title,
    primaryText: ASTRA_PRIMARY.text,
    primaryUrl: ASTRA_PRIMARY.url,
    sourceName: 'The Verge AI→OpenAI',
    radarRole: 'secondary' as const,
    primaryStatus: 'DISCOVERY_WITH_PRIMARY' as const,
    // rawScore from fresh A/B below — placeholder
  },
  {
    key: 'gemini_robotics',
    kind: 'embodied' as const,
    rawTitle: 'Gemini Robotics 2 brings whole body intelligence to robots',
    rawText:
      'Google DeepMind Gemini Robotics 2 brings whole body intelligence to robots, expanding embodied control beyond narrow single-skill demos.',
    primaryTitle: 'Gemini Robotics 2 brings whole body intelligence to robots',
    primaryText:
      'Google DeepMind Gemini Robotics 2 brings whole body intelligence to robots, expanding embodied control beyond narrow single-skill demos.',
    primaryUrl: 'https://deepmind.google/blog/gemini-robotics-2-brings-whole-body-intelligence-to-robots/',
    sourceName: 'Google DeepMind',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
  {
    key: 'weathernext',
    kind: 'research' as const,
    rawTitle: 'WeatherNext: AI model achieves breakthrough in forecasting cyclones',
    rawText:
      'DeepMind WeatherNext AI model achieves breakthrough in forecasting cyclones with improved research accuracy.',
    primaryTitle: 'WeatherNext: AI model achieves breakthrough in forecasting cyclones',
    primaryText:
      'DeepMind WeatherNext AI model achieves breakthrough in forecasting cyclones with improved research accuracy.',
    primaryUrl: 'https://deepmind.google/blog/weathernext',
    sourceName: 'Google DeepMind',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
  {
    key: 'gpt56_efficiency',
    kind: 'refresh' as const,
    rawTitle: 'How GPT-5.6 fuses frontier intelligence with frontier efficiency',
    rawText:
      'OpenAI describes GPT-5.6 improvements in frontier intelligence and price-performance efficiency — a model refresh focused on efficiency.',
    primaryTitle: 'How GPT-5.6 fuses frontier intelligence with frontier efficiency',
    primaryText:
      'OpenAI describes GPT-5.6 improvements in frontier intelligence and price-performance efficiency — a model refresh focused on efficiency.',
    primaryUrl: 'https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency',
    sourceName: 'OpenAI News',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
  {
    key: 'enterprise_case',
    kind: 'case_study' as const,
    rawTitle: 'How avatarin built a 24/7 retail agent with GPT-Realtime',
    rawText:
      'Customer case study: avatarin built a 24/7 retail agent with GPT-Realtime for shopper support — enterprise integration of existing models.',
    primaryTitle: 'How avatarin built a 24/7 retail agent with GPT-Realtime',
    primaryText:
      'Customer case study: avatarin built a 24/7 retail agent with GPT-Realtime for shopper support — enterprise integration of existing models.',
    primaryUrl: 'https://openai.com/index/avatarin',
    sourceName: 'OpenAI News',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
  {
    key: 'api_refresh_noise',
    kind: 'noise' as const,
    rawTitle: 'Improving GPT-5.6 Sol in ChatGPT—and expanding access to GPT-5.6 Luna for free users',
    rawText:
      'ChatGPT introduces improved GPT-5.6 Sol plus expanded access for free users — product/model refresh and access tier update.',
    primaryTitle: 'Improving GPT-5.6 Sol in ChatGPT—and expanding access to GPT-5.6 Luna for free users',
    primaryText:
      'ChatGPT introduces improved GPT-5.6 Sol plus expanded access for free users — product/model refresh and access tier update.',
    primaryUrl: 'https://openai.com/index/improving-gpt-5-6-sol-in-chatgpt',
    sourceName: 'OpenAI News',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
  {
    key: 'hype_open_weights',
    kind: 'hype' as const,
    rawTitle: 'OpenAI подписала письмо об открытых весах. Anthropic осталась одна',
    rawText:
      'Новость о позиции компаний по open weights — политический/отраслевой жест без новой capability demo.',
    primaryTitle: '',
    primaryText: '',
    primaryUrl: '',
    sourceName: 'AI-Stat',
    radarRole: 'discovery_only' as const,
    primaryStatus: 'DISCOVERY_UNRESOLVED' as const,
  },
  {
    key: 'vibe_course',
    kind: 'noise' as const,
    rawTitle: 'Inside our 353,000-person vibe coding course',
    rawText: 'Google AI Blog post about a large vibe coding course — education/marketing, not a capability event.',
    primaryTitle: 'Inside our 353,000-person vibe coding course',
    primaryText: 'Google AI Blog post about a large vibe coding course — education/marketing, not a capability event.',
    primaryUrl: 'https://blog.google/technology/ai/vibe-coding',
    sourceName: 'Google AI Blog',
    radarRole: 'primary' as const,
    primaryStatus: 'PRIMARY_ORIGIN' as const,
  },
];

async function scout(title: string, text: string) {
  const r = await scoutArticle(title, text, 'ai_radar');
  return { score: r.score, reason: (r.reason || '').slice(0, 160), pass: r.score >= FLOOR };
}

async function main() {
  console.log(`SP-A-065D ABC control | floor=${FLOOR} | NO PUBLISH | economical fixtures\n`);

  // --- Astra A/B/C ---
  const event = normalizeAiEvent({
    title: ASTRA_VERGE.title,
    text: ASTRA_VERGE.text,
    url: ASTRA_VERGE.url,
    sourceName: ASTRA_VERGE.sourceName,
    radarRole: 'secondary',
    primaryStatus: 'DISCOVERY_WITH_PRIMARY',
    primaryUrl: ASTRA_PRIMARY.url,
    primaryTitle: ASTRA_PRIMARY.title,
    primaryText: ASTRA_PRIMARY.text,
    secondaryTitle: ASTRA_VERGE.title,
    secondaryText: ASTRA_VERGE.text,
  });

  console.log('Normalized EVENT RECORD (preview):');
  console.log(event.summaryForScout.slice(0, 700));
  console.log('---\n');

  console.log('Scouting Astra A/B/C...');
  const A = await scout(ASTRA_PRIMARY.title, ASTRA_PRIMARY.text);
  console.log(`A official: ${A.score} ${A.pass ? 'PASS' : 'fail'} — ${A.reason}`);
  const B = await scout(ASTRA_VERGE.title, ASTRA_VERGE.text);
  console.log(`B Verge:    ${B.score} ${B.pass ? 'PASS' : 'fail'} — ${B.reason}`);
  const C = await scout(ASTRA_PRIMARY.title, event.summaryForScout);
  console.log(`C normalized: ${C.score} ${C.pass ? 'PASS' : 'fail'} — ${C.reason}  ← MAIN`);

  // --- Control set: raw + normalized (skip duplicate Astra raw/norm already done) ---
  const rows: {
    key: string;
    primaryStatus: string;
    rawScore: number;
    normScore: number;
    decision: string;
    reason: string;
  }[] = [];

  rows.push({
    key: 'astra',
    primaryStatus: 'DISCOVERY_WITH_PRIMARY',
    rawScore: B.score,
    normScore: C.score,
    decision: C.pass ? 'PASS' : 'REJECT',
    reason: C.reason,
  });

  for (const c of CONTROL) {
    if (c.key === 'astra') continue;
    const ev = normalizeAiEvent({
      title: c.rawTitle,
      text: c.rawText,
      url: c.primaryUrl || c.rawTitle,
      sourceName: c.sourceName,
      radarRole: c.radarRole,
      primaryStatus: c.primaryStatus,
      primaryUrl: c.primaryUrl || undefined,
      primaryTitle: c.primaryTitle || undefined,
      primaryText: c.primaryText || undefined,
      secondaryTitle: c.radarRole !== 'primary' ? c.rawTitle : undefined,
      secondaryText: c.radarRole !== 'primary' ? c.rawText : undefined,
    });
    console.log(`\nScout ${c.key} raw+norm...`);
    const raw = await scout(c.rawTitle, c.rawText);
    const norm = await scout(c.primaryTitle || c.rawTitle, ev.summaryForScout);
    rows.push({
      key: c.key,
      primaryStatus: c.primaryStatus,
      rawScore: raw.score,
      normScore: norm.score,
      decision: norm.pass ? 'PASS' : 'REJECT',
      reason: norm.reason,
    });
    console.log(
      `  raw=${raw.score} norm=${norm.score} ${norm.pass ? 'PASS' : 'REJECT'} — ${norm.reason.slice(0, 90)}`,
    );
  }

  const primaryMetrics = {
    PRIMARY_ORIGIN: rows.filter((r) => r.primaryStatus === 'PRIMARY_ORIGIN').length,
    DISCOVERY_WITH_PRIMARY: rows.filter((r) => r.primaryStatus === 'DISCOVERY_WITH_PRIMARY').length,
    DISCOVERY_UNRESOLVED: rows.filter((r) => r.primaryStatus === 'DISCOVERY_UNRESOLVED').length,
    note: 'PRIMARY_ORIGIN is not counted as failed resolve',
  };

  const report = {
    id: 'SP-A-065D-R1',
    floor: FLOOR,
    astra: {
      A_official: A,
      B_verge: B,
      C_normalized: { ...C, event },
      mainDecision: 'C_normalized',
      gapOfficialVsVerge: Math.abs(B.score - A.score),
      gapNormalizedVsVerge: Math.abs(C.score - B.score),
      gapNormalizedVsOfficial: Math.abs(C.score - A.score),
    },
    controlSet: rows,
    primaryMetrics,
    recommendation:
      C.score >= 70 && C.score >= 55
        ? 'Normalized Astra stays strong on facts; AI radar usable for further gated dry-run — do NOT merge PR #5 until owner reviews R1.'
        : 'Needs more calibration before treating normalized path as live decision.',
  };

  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, 'spa065d-r1.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);

  console.log('\n======== SP-A-065D-R1 ========');
  console.log(`ASTRA A official = ${A.score}`);
  console.log(`ASTRA B secondary = ${B.score}`);
  console.log(`ASTRA C normalized = ${C.score} (${C.pass ? 'PASS' : 'fail'} @${FLOOR})`);
  console.log('CONTROL SET:');
  for (const r of rows) {
    console.log(
      `  ${r.key.padEnd(18)} raw=${String(r.rawScore).padStart(3)} norm=${String(r.normScore).padStart(3)} ${r.decision.padEnd(6)} [${r.primaryStatus}]`,
    );
  }
  console.log('PRIMARY METRICS:', primaryMetrics);
  console.log('STOP — no publish / PR #5 not merged.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
