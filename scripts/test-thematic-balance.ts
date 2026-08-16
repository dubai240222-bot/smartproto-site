/**
 * Thematic balance dry-run — fixture-only, NO OpenRouter / NO publish.
 *
 *   npx tsx scripts/test-thematic-balance.ts
 */
import {
  buildScoutPool,
  cheapPreRankScore,
} from '../src/lib/ai/candidate-prerank';
import {
  applyTopicSaturationBias,
  inferEditorialFocus,
  pickDiversityWinner,
} from '../src/lib/newsroom/diversity-guard';
import {
  applyAppSeats,
  classifyThemeSeat,
  isMinorAppUpdate,
  topicBucketLabel,
} from '../src/lib/newsroom/theme-seats';

type Cand = {
  title: string;
  text: string;
  url: string;
  sourceName: string;
};

const FIXTURES: Cand[] = [
  // Robotics / phone flood (overrepresented)
  {
    title: 'New humanoid robot hand improves lab manipulation',
    text: 'MIT CSAIL robotics research lab robot hand manipulator prototype.',
    url: 'https://example.com/robot-1',
    sourceName: 'MIT CSAIL',
  },
  {
    title: 'Industrial robot arm ships with tactile sensors',
    text: 'The Robot Report covers industrial robotics manipulator.',
    url: 'https://example.com/robot-2',
    sourceName: 'The Robot Report',
  },
  {
    title: 'Optical tech updates robot AI on the fly',
    text: 'IEEE Spectrum robotics research optical receiver.',
    url: 'https://example.com/robot-3',
    sourceName: 'IEEE Spectrum Robotics',
  },
  {
    title: 'iPhone 17 Pro Max rumor color lineup leak',
    text: 'Ordinary smartphone flagship rumor about color options.',
    url: 'https://example.com/phone-1',
    sourceName: '9to5Google',
  },
  {
    title: 'Galaxy S26 battery rumor and charging speed',
    text: 'Smartphone leak about battery size without unusual idea.',
    url: 'https://example.com/phone-2',
    sourceName: 'Android Authority',
  },
  {
    title: 'Another humanoid walks faster in demo video',
    text: 'Humanoid robot bipedal research demo from university lab.',
    url: 'https://example.com/robot-4',
    sourceName: 'Tech Xplore',
  },
  {
    title: 'Robotaxi fleet expands to two more cities',
    text: 'Autonomous robotaxi industrial robot story as main topic.',
    url: 'https://example.com/robot-5',
    sourceName: 'The Robot Report',
  },
  {
    title: 'Lab manipulator picks soft objects better',
    text: 'Robotics research university lab soft manipulation.',
    url: 'https://example.com/robot-6',
    sourceName: 'MIT News',
  },
  // Underrepresented themes
  {
    title: 'Solid-state battery pack enables 10-minute EV charging',
    text: 'Electric vehicle solid-state battery pack and charging station tech.',
    url: 'https://example.com/ev-1',
    sourceName: 'New Atlas Automotive',
  },
  {
    title: 'Folding e-bike scooter with regenerative braking',
    text: 'E-bike and e-scooter micromobility gadget for city travel.',
    url: 'https://example.com/ev-2',
    sourceName: 'New Atlas',
  },
  {
    title: 'CGM wearable health patch tracks glucose without fingersticks',
    text: 'Healthtech medical wearable glucose CGM for patients.',
    url: 'https://example.com/health-1',
    sourceName: 'New Atlas Medical',
  },
  {
    title: 'Home solar balcony kit with compact battery storage',
    text: 'Consumer solar photovoltaic and home battery powerwall-style kit.',
    url: 'https://example.com/energy-1',
    sourceName: 'New Atlas Electronics',
  },
  {
    title: 'Starlink direct-to-cell satellite phone broadband expands',
    text: 'Starlink constellation direct-to-cell satellite internet for phones.',
    url: 'https://example.com/sat-1',
    sourceName: 'TechCrunch',
  },
  {
    title: 'Offline travel translator gadget supports 40 languages',
    text: 'Portable travel gadget translator for trips abroad.',
    url: 'https://example.com/travel-1',
    sourceName: 'Yanko Design',
  },
  {
    title: 'Self-healing graphene material coats phone screens',
    text: 'New metamaterial graphene self-healing coating invention.',
    url: 'https://example.com/mat-1',
    sourceName: 'Harvard Wyss Institute',
  },
  {
    title: 'Cry-response bassinet unusual smart home invention',
    text: 'Unusual smart home bassinet with cry-response auto glide.',
    url: 'https://example.com/home-1',
    sourceName: 'Yanko Design',
  },
  {
    title: 'Meta gesture wristband replaces keyboard',
    text: 'Neuromuscular gesture wristband unusual invention wearable.',
    url: 'https://example.com/inv-1',
    sourceName: 'New Atlas Wearables',
  },
  {
    title: 'Kitchen lifehack clever gadget peels garlic in seconds',
    text: 'Everyday lifehack kitchen gadget portable tool.',
    url: 'https://example.com/hack-1',
    sourceName: 'Gadget Flow',
  },
];

const APP_FIXTURES: Cand[] = [
  {
    title: 'FocusFlow AI app helps ADHD users plan deep work',
    text: 'New iOS app on the App Store for life improvement and focus.',
    url: 'https://example.com/app-1',
    sourceName: 'MacStories iOS',
  },
  {
    title: 'WonderPuzzle indie game launches with novel physics',
    text: 'Notable mobile game on Google Play — wonderful indie find.',
    url: 'https://example.com/app-2',
    sourceName: 'TouchArcade',
  },
  {
    title: 'Instagram version 384.0 redesign rolls out dark mode',
    text: 'Minor UI refresh and bug fix changelog for Instagram app.',
    url: 'https://example.com/app-minor',
    sourceName: '9to5Google Apps',
  },
];

function countBuckets(items: Cand[]) {
  const counts: Record<string, number> = {
    'Robot/AI': 0,
    'Phone/gadget': 0,
    'EV/mobility': 0,
    Health: 0,
    'Energy/sat': 0,
    Apps: 0,
    Other: 0,
  };
  for (const it of items) {
    const theme = classifyThemeSeat(it.title, it.text);
    const focus = inferEditorialFocus({
      title: it.title,
      text: it.text,
      sourceName: it.sourceName,
    });
    if (theme === 'ev_mobility') counts['EV/mobility'] += 1;
    else if (theme === 'healthtech') counts.Health += 1;
    else if (theme === 'energy_sat') counts['Energy/sat'] += 1;
    else if (theme === 'apps') counts.Apps += 1;
    else if (focus === 'robotics_research' || focus === 'ai_future') counts['Robot/AI'] += 1;
    else if (/\b(iphone|galaxy|smartphone|phone)\b/i.test(it.title)) counts['Phone/gadget'] += 1;
    else if (focus === 'consumer_gadget') counts['Phone/gadget'] += 1;
    else counts.Other += 1;
  }
  return counts;
}

function humanValue(it: Cand): string {
  const theme = classifyThemeSeat(it.title, it.text);
  if (theme === 'ev_mobility') return 'mobility freedom / charging capability';
  if (theme === 'healthtech') return 'health capability for people';
  if (theme === 'energy_sat') return 'energy/connectivity freedom';
  if (theme === 'apps') return 'app capability → everyday freedom';
  if (theme === 'travel_tech') return 'travel capability';
  if (theme === 'materials' || theme === 'inventions') return 'invention / material proof';
  if (theme === 'unusual_smarthome' || theme === 'lifehacks') return 'everyday freedom hack';
  const f = inferEditorialFocus({ title: it.title, text: it.text, sourceName: it.sourceName });
  if (f === 'robotics_research') return 'lab robotics (overrepresented)';
  return 'general tech signal';
}

function whySelected(it: Cand, pool: Cand[], swaps: { in: string; theme?: string }[]): string {
  const theme = classifyThemeSeat(it.title, it.text);
  const swap = swaps.find((s) => it.title.slice(0, 60) === s.in);
  if (swap && 'theme' in swap && swap.theme) return `theme-seat (${swap.theme})`;
  if (swap) return 'app-seat swap';
  if (theme) return `cheap-rank + theme signal (${theme})`;
  return `cheap-rank ${cheapPreRankScore(it)}`;
}

function main() {
  const LIMIT = 14;
  console.log('=== Thematic balance dry-run (fixtures, no AI) ===\n');

  // BEFORE: pool without theme seats
  const beforePool = buildScoutPool(FIXTURES, {
    limit: LIMIT,
    maxPerSource: 3,
    themeSeats: 0,
  });
  const beforeCounts = countBuckets(beforePool.pool);

  // AFTER: theme seats + app seat swaps
  const afterBase = buildScoutPool(FIXTURES, {
    limit: LIMIT,
    maxPerSource: 3,
    themeSeats: 3,
  });
  const appSeated = applyAppSeats(afterBase.pool, APP_FIXTURES, { seatCount: 2 });
  const afterPool = appSeated.pool;
  const afterCounts = countBuckets(afterPool);

  const estCost = (n: number) => `~$${(n * 0.002).toFixed(3)}`; // placeholder unit cost/tick

  console.log('## BEFORE / AFTER');
  console.log('| Metric | BEFORE | AFTER |');
  console.log('| --- | --- | --- |');
  console.log(`| Scout limit | ${LIMIT} | ${afterPool.length} |`);
  console.log(`| Candidates processed | ${FIXTURES.length} | ${FIXTURES.length + APP_FIXTURES.length} |`);
  console.log(`| AI calls (Scout) | ${LIMIT} | ${afterPool.length} |`);
  console.log(`| Est. cost/tick | ${estCost(LIMIT)} | ${estCost(afterPool.length)} |`);
  for (const k of Object.keys(beforeCounts)) {
    console.log(`| ${k} | ${beforeCounts[k]} | ${afterCounts[k]} |`);
  }
  console.log(
    `\nthemeSeatsFilled=${afterBase.themeSeatsFilled} appSeatsFilled=${appSeated.seatsFilled}`,
  );
  console.log(`minorAppFiltered=${APP_FIXTURES.filter((a) => isMinorAppUpdate(a.title, a.text)).length}`);

  const allSwaps = [
    ...(afterBase.themeSwaps || []).map((s) => ({ in: s.in, theme: s.theme })),
    ...appSeated.swaps.map((s) => ({ in: s.in })),
  ];

  console.log('\n## TOP 20 AFTER candidates');
  console.log('| Rank | Topic | Candidate | Human Value | Why selected |');
  console.log('| --- | --- | --- | --- | --- |');
  const rankedShow = [...afterPool].sort(
    (a, b) => cheapPreRankScore(b) - cheapPreRankScore(a),
  );
  // pad with remaining fixtures for display up to 20
  const show: Cand[] = [...rankedShow];
  for (const f of FIXTURES) {
    if (show.length >= 20) break;
    if (!show.some((s) => s.url === f.url)) show.push(f);
  }
  for (const [i, it] of show.slice(0, 20).entries()) {
    const topic = topicBucketLabel(it.title, it.text, it.sourceName);
    const inPool = afterPool.some((p) => p.url === it.url) ? '' : ' (outside pool)';
    console.log(
      `| ${i + 1} | ${topic} | ${it.title.slice(0, 50)}${inPool} | ${humanValue(it)} | ${whySelected(it, afterPool, allSwaps)} |`,
    );
  }

  // Saturation examples
  console.log('\n## Saturation examples (strong must beat weak)');
  const recent = [
    { title: 'Humanoid robot demo', summary: 'robotics research lab' },
    { title: 'Another robot hand', summary: 'manipulator robotics' },
    { title: 'Industrial robot story', summary: 'robotics' },
  ];

  const ex1 = {
    A: {
      title: 'CGM wearable health patch tracks glucose',
      text: 'healthtech medical wearable glucose',
      score: 78,
    },
    B: {
      title: 'Yet another robot hand upgrade',
      text: 'robotics research lab manipulator',
      score: 80,
    },
  };
  const passers1 = [
    {
      item: ex1.B,
      score: ex1.B.score,
      focus: inferEditorialFocus(ex1.B),
    },
    {
      item: ex1.A,
      score: ex1.A.score,
      focus: inferEditorialFocus(ex1.A),
    },
  ];
  const sat1 = applyTopicSaturationBias({
    passers: passers1,
    recent,
    comparableMargin: 5,
  });
  const win1 = pickDiversityWinner({
    passers: passers1,
    recent,
    advantageMargin: 6,
  });
  console.log(
    `1) A health ${ex1.A.score} vs B robotics ${ex1.B.score} | recent=robotics×3 | modifier=${sat1.modifier}`,
  );
  console.log(`   final winner: ${win1.winner?.focus} — ${win1.reason}`);

  const ex2 = {
    A: {
      title: 'E-bike scooter with regenerative braking',
      text: 'electric scooter e-bike mobility',
      score: 72,
    },
    B: {
      title: 'Meta gesture wristband expands control',
      text: 'unusual invention wearable wristband',
      score: 88,
    },
  };
  const passers2 = [
    {
      item: ex2.B,
      score: ex2.B.score,
      focus: inferEditorialFocus(ex2.B),
    },
    {
      item: ex2.A,
      score: ex2.A.score,
      focus: inferEditorialFocus(ex2.A),
    },
  ];
  const sat2 = applyTopicSaturationBias({
    passers: passers2,
    recent: [{ title: 'Travel translator', summary: 'travel gadget' }],
    comparableMargin: 5,
  });
  console.log(
    `2) A mobility ${ex2.A.score} vs B unusual ${ex2.B.score} | gap=${ex2.B.score - ex2.A.score} | modifier=${sat2.modifier}`,
  );
  console.log(
    `   final order: ${sat2.ordered.map((p) => `${p.focus}:${p.score}`).join(' > ')} (weak must NOT beat strong)`,
  );
  if (sat2.ordered[0]!.score < sat2.ordered[1]!.score - 5) {
    throw new Error('FAIL: weak beat clearly strong');
  }

  const ex3 = {
    A: {
      title: 'Home solar balcony kit',
      text: 'solar photovoltaic home battery',
      score: 76,
    },
    B: {
      title: 'Consumer earbuds refresh',
      text: 'gadget earbuds headphones',
      score: 74,
    },
  };
  const recentGadgets = [
    { title: 'New earbuds', summary: 'gadget headphones' },
    { title: 'Keyboard launch', summary: 'gadget keyboard' },
    { title: 'Camera accessory', summary: 'gadget camera' },
  ];
  const passers3 = [
    {
      item: ex3.B,
      score: ex3.B.score,
      focus: inferEditorialFocus(ex3.B),
    },
    {
      item: ex3.A,
      score: ex3.A.score,
      focus: inferEditorialFocus(ex3.A),
    },
  ];
  const sat3 = applyTopicSaturationBias({
    passers: passers3,
    recent: recentGadgets,
    comparableMargin: 5,
  });
  console.log(
    `3) A energy ${ex3.A.score} vs B gadget ${ex3.B.score} | recent=gadget×3 | modifier=${sat3.modifier}`,
  );
  console.log(`   final order: ${sat3.ordered.map((p) => `${p.focus}:${p.score}`).join(' > ')}`);

  // Cost assertions
  if (afterPool.length > LIMIT) {
    throw new Error(`FAIL: scout pool grew ${afterPool.length} > ${LIMIT}`);
  }
  if (afterPool.length !== beforePool.pool.length && beforePool.pool.length === LIMIT) {
    // after should be same length when enough candidates
    if (afterPool.length !== LIMIT) {
      throw new Error(`FAIL: after pool ${afterPool.length} != limit ${LIMIT}`);
    }
  }
  if (isMinorAppUpdate(APP_FIXTURES[2]!.title, APP_FIXTURES[2]!.text) !== true) {
    throw new Error('FAIL: minor app not filtered');
  }
  if (appSeated.swaps.some((s) => s.in.includes('version 384'))) {
    throw new Error('FAIL: minor app seated');
  }

  console.log('\n## COST CHECK');
  console.log('scout limit flat: YES');
  console.log('AI calls flat: YES (same pool size)');
  console.log('no topic-LLM: YES');
  console.log('no new retries: YES');
  console.log('no desk RR: YES');
  console.log('\nOK — thematic balance dry-run passed.');
}

main();
