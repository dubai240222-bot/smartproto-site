/**
 * SP-A-039-ALT — deterministic niche PC / consumer-angle filter tests.
 * No OpenRouter / AI / network / articles.json writes.
 */
import {
  evaluateTopicLocal,
  hardRejectTopic,
  hasStrongConsumerAngle,
  isNicheTechTopic,
} from '../src/lib/ai/hard-reject';
import { reviewDraftLocal } from '../src/lib/ai/reviewer';

type Case = { title: string; text: string; expect: 'REJECT' | 'CONSIDER' };

const CASES: Case[] = [
  // REJECT — ordinary niche PC / server parts
  {
    title: 'Ordinary CPU cooler launches with new mounting kit',
    text: 'A standard air CPU cooler is now available for gaming PCs. Buy the cooler today.',
    expect: 'REJECT',
  },
  {
    title: 'Ordinary motherboard announced for Intel builders',
    text: 'This ATX motherboard launches with more USB ports for PC enthusiasts. Priced at $180.',
    expect: 'REJECT',
  },
  {
    title: 'Ordinary PC PSU now available from Corsair line',
    text: 'An ATX PSU / PC power supply launches for mid-range builds. Available to buy online.',
    expect: 'REJECT',
  },
  {
    title: 'Ordinary server SSD launched for data centers',
    text: 'Enterprise server SSD unveiled for rack storage. Data-center buyers can pre-order.',
    expect: 'REJECT',
  },
  {
    title: 'Ordinary internal SSD launches for PC builders',
    text: 'A standard internal NVME SSD drive launches for desktop upgrades. Available to buy for PC enthusiasts.',
    expect: 'REJECT',
  },
  // CONSIDER — preferred consumer gadgets with novelty
  {
    title: 'Unusual QWERTY Android phone launches on Kickstarter',
    text: 'A finished Android smartphone with a physical QWERTY keyboard is available to pre-order on Kickstarter.',
    expect: 'CONSIDER',
  },
  {
    title: 'Compact game controller unveiled for travel',
    text: 'A portable gamepad / controller launches for phones and tablets. Pre-order now.',
    expect: 'CONSIDER',
  },
  {
    title: 'Home robot vacuum launches with AI mapping',
    text: 'A new robot vacuum for home use is now available to buy. Product launch this week.',
    expect: 'CONSIDER',
  },
  {
    title: 'Wearable health device tracks sleep without an app maze',
    text: 'This wearable health tracker launches measuring sleep stages. Priced at $99 on Amazon.',
    expect: 'CONSIDER',
  },
  {
    title: 'Travel translator gadget supports 40 languages offline',
    text: 'A pocket translator device launches with offline live translation. Kickstarter pre-order open.',
    expect: 'CONSIDER',
  },
  {
    title: 'Smart ring launches as a finished health wearable',
    text: 'A new smart ring wearable announces continuous health tracking. Available to buy next month.',
    expect: 'CONSIDER',
  },
  {
    title: 'Mini projector launches for travel movie nights',
    text: 'A portable mini projector device unveils pocket cinema for travel. Pre-order on Indiegogo.',
    expect: 'CONSIDER',
  },
];

let failed = 0;

for (const c of CASES) {
  const gate = hardRejectTopic(c.title, c.text);
  const local = evaluateTopicLocal(c.title, c.text);
  const review = reviewDraftLocal(c.title, c.text);
  const got: 'REJECT' | 'CONSIDER' = gate.reject || !local.interesting ? 'REJECT' : 'CONSIDER';
  const ok = got === c.expect;
  if (!ok) failed += 1;
  console.log('---');
  console.log(`title: ${c.title}`);
  console.log(`expect: ${c.expect} | got: ${got}${ok ? '' : '  ← FAIL'}`);
  console.log(`rejectCode: ${gate.rejectCode ?? '(none)'}`);
  console.log(`niche: ${isNicheTechTopic(c.title, c.text)} consumerAngle: ${hasStrongConsumerAngle(c.title, c.text)}`);
  console.log(`score: ${local.score} review: ${review ? 'REJECT' : '(pass-to-model)'}`);
  if (gate.reason) console.log(`reason: ${gate.reason}`);
}

console.log('---');
console.log(`SP-A-039-ALT niche PC filter: ${CASES.length - failed}/${CASES.length} passed`);
if (failed > 0) {
  process.exit(1);
}
