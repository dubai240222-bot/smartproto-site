/**
 * SP-A-065 — recalibrate Scout on a fixed editorial sample (no publish).
 *
 * Usage:
 *   ARTICLES_STORE=sqlite npx tsx scripts/spa065-recalibrate-scout.ts
 *
 * Does NOT change SCOUT_SCORE_THRESHOLD. Prints old vs new + publish/reject at 70.
 */
import 'dotenv/config';
import { scoutArticle } from '../src/lib/ai/scout';
import {
  applyAntiCommodityPenalty,
  looksCommodityRoutine,
  looksSmartHomeRoutine,
} from '../src/lib/ai/scout-recalibrate';

interface Sample {
  title: string;
  text: string;
  source: string;
  oldScore: number | null;
  note?: string;
}

/** Calibration set from live journal + synthetic commodity controls. */
const SAMPLES: Sample[] = [
  {
    title: 'Meta wants to replace your mouse and keyboard with this bracelet',
    text: 'Meta gesture wristband reads neuromuscular signals for handwriting and computer control without touching a keyboard or mouse. Demo shows typing in air and cursor control.',
    source: 'New Atlas',
    oldScore: 86,
    note: 'etalon HIGH',
  },
  {
    title: 'Delta Children Aero Smart Auto-Glide Bassinet',
    text: 'Smart bassinet that automatically responds to baby cry with gliding motion and soothing. Auto-detects fussing and starts motion without parent app tap.',
    source: 'Gadget Flow',
    oldScore: 78,
    note: 'etalon MED/HIGH',
  },
  {
    title: 'Altar II Mechanical Keyboard',
    text: 'Ultra-thin mechanical keyboard 4.75mm with tactile feedback and unique low-profile switches. Crowdfunding mechanical board.',
    source: 'Gadget Flow',
    oldScore: 82,
    note: 'etalon MEDIUM',
  },
  {
    title: "RainPoint's connected watering system puts a gateway, two zones, and a soil sensor",
    text: 'Smart irrigation kit with soil moisture sensor, rain sensor, gateway and two watering zones controlled by app.',
    source: 'Gadget Flow',
    oldScore: 83,
    note: 'etalon should DROP',
  },
  {
    title: 'iQOO Z11S: новый смартфон с чипом Dimensity 7500',
    text: 'iQOO представила смартфон Z11S на Dimensity 7500, обычные характеристики камеры и батареи без уникальной функции.',
    source: 'ITHome',
    oldScore: null,
    note: 'commodity phone',
  },
  {
    title: 'iQOO T: тестирование системы охлаждения и 200 МП камеры',
    text: 'Слухи о смартфоне iQOO T: тесты охлаждения и камера 200 МП. Модель не подтверждена.',
    source: 'ITHome',
    oldScore: null,
    note: 'rumor commodity',
  },
  {
    title: 'OPPO will unveil a new smartphone lineup in September',
    text: 'OPPO plans to announce its next phone series in September with refreshed designs and standard flagship specs.',
    source: 'Android Authority',
    oldScore: null,
    note: 'lineup commodity LOW',
  },
  {
    title: 'Smartphone that lasts 7 days without charging',
    text: 'Experimental phone prototype claims seven days of mixed use on a single charge using a new battery chemistry demo.',
    source: 'Tech Xplore',
    oldScore: null,
    note: 'unusual HIGH',
  },
  {
    title: 'Whale Writer: складное устройство для письма с открытым исходным кодом',
    text: 'Портативный DIY-гаджет для письма без отвлечений, open source, складной форм-фактор.',
    source: 'Yanko Design',
    oldScore: 84,
  },
  {
    title: 'Samsung Freestyle+: canister projector becomes a SmartThings hub',
    text: 'Portable projector update adds SmartThings hub features while keeping the Freestyle form.',
    source: 'New Atlas',
    oldScore: null,
  },
  {
    title: 'Birdfy smart bird feeder is on sale for just $60',
    text: 'Discount deal on existing smart bird feeder with camera.',
    source: 'The Verge',
    oldScore: 0,
    note: 'deal reject',
  },
  {
    title: 'OpenAI acquires presentation startup NextSlide',
    text: 'Acquisition news without a new consumer product capability.',
    source: 'TechCrunch',
    oldScore: 0,
  },
  {
    title: 'Teaching AI to create visuals with more common sense',
    text: 'MIT CSAIL researchers demonstrate an AI system that generates images with better physical common sense.',
    source: 'MIT CSAIL',
    oldScore: null,
    note: 'research AI',
  },
  {
    title: 'Humanoid robot learns to fold laundry in a home demo',
    text: 'Robotics lab shows a humanoid prototype folding towels autonomously after vision training.',
    source: 'IEEE Spectrum Robotics',
    oldScore: null,
    note: 'robotics',
  },
  {
    title: 'Soft robotic gripper inspired by octopus arms',
    text: 'Wyss Institute soft robot gripper gently handles fragile objects using pneumatic chambers.',
    source: 'Harvard Wyss Institute',
    oldScore: null,
  },
  {
    title: 'Pixel 11 specs and price leak before launch',
    text: 'Leaked Pixel 11 specifications and pricing with incremental camera upgrades.',
    source: 'The Verge',
    oldScore: null,
    note: 'leak commodity',
  },
  {
    title: 'Solly $79 solar power bank with travel adapter',
    text: '20,000 mAh power bank with solar panel and built-in plug for travel.',
    source: 'New Atlas',
    oldScore: null,
    note: 'powerbank commodity-ish',
  },
  {
    title: 'PlumCat AI wearable translator weighs 7.4g',
    text: 'Tiny wearable AI translator you wear instead of holding a phone, supports live conversation translation.',
    source: 'New Atlas',
    oldScore: null,
    note: 'unusual wearable',
  },
  {
    title: 'Autonomous key locks addictive apps for $9',
    text: 'Physical key that blocks distracting apps by requiring a real key turn — behavioral gadget.',
    source: 'TechCrunch',
    oldScore: null,
  },
  {
    title: 'Nike Air Zoom Hyperslide heated massage sandals',
    text: 'Recovery sandals with heating and massage for athletes after training.',
    source: 'New Atlas',
    oldScore: null,
  },
  {
    title: 'ChatGPT Voice shifts from chatbot to proper assistant',
    text: 'Subjective impression piece about ChatGPT voice feeling more like an assistant.',
    source: 'New Atlas',
    oldScore: 0,
  },
  {
    title: 'Ultra-thin 4.75mm mechanical keyboard with haptic feedback',
    text: 'Keyboard only 4.75mm thick with mechanical switches and tactile haptic layer rarely seen at this thickness.',
    source: 'Gadget Flow',
    oldScore: null,
    note: 'unusual keyboard',
  },
  {
    title: 'Ordinary 27-inch 165Hz gaming monitor refresh',
    text: 'Another IPS gaming monitor with 165Hz and thin bezels, standard specs.',
    source: 'Engadget',
    oldScore: null,
    note: 'monitor commodity',
  },
  {
    title: 'ETH Zurich researchers demo autonomous drone swarm navigation',
    text: 'ETH lab demonstrates drone swarm navigating cluttered indoor spaces without GPS.',
    source: 'ETH Zurich',
    oldScore: null,
  },
  {
    title: 'TechNode: Chinese lab shows on-device AI chip for robots',
    text: 'China hardware startup unveils an edge AI chip aimed at home robots with open demo videos.',
    source: 'TechNode',
    oldScore: null,
  },
];

async function main() {
  const floor = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);
  console.log(`SP-A-065 recalibration | floor=${floor} (NOT changing production threshold)\n`);
  console.log(
    [
      'title'.padEnd(52),
      'src'.padEnd(18),
      'old'.padStart(4),
      'new'.padStart(4),
      'pen'.padStart(4),
      'dec'.padStart(8),
      'status'.padEnd(12),
      'reason',
    ].join(' | '),
  );
  console.log('-'.repeat(140));

  const rows: {
    title: string;
    source: string;
    oldScore: number | null;
    newScore: number;
    penalty: number;
    decision: string;
    status?: string;
    reason: string;
    commodity: boolean;
  }[] = [];

  for (const s of SAMPLES) {
    try {
      const scout = await scoutArticle(s.title, s.text);
      const decision =
        scout.interesting && scout.score >= floor ? 'PUBLISH' : 'REJECT';
      const commodity =
        looksCommodityRoutine(s.title, s.text) || looksSmartHomeRoutine(s.title, s.text);
      rows.push({
        title: s.title,
        source: s.source,
        oldScore: s.oldScore,
        newScore: scout.score,
        penalty: scout.commodityPenalty || 0,
        decision,
        status: scout.status,
        reason: scout.reason.slice(0, 70),
        commodity,
      });
      console.log(
        [
          s.title.slice(0, 52).padEnd(52),
          s.source.slice(0, 18).padEnd(18),
          String(s.oldScore ?? '-').padStart(4),
          String(scout.score).padStart(4),
          String(scout.commodityPenalty || 0).padStart(4),
          decision.padStart(8),
          String(scout.status || '-').padEnd(12),
          scout.reason.slice(0, 60),
        ].join(' | '),
      );
    } catch (err) {
      console.log(
        `${s.title.slice(0, 52).padEnd(52)} | ERROR ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const wouldPublish = rows.filter((r) => r.decision === 'PUBLISH');
  const commodityDown = rows.filter((r) => r.commodity && (r.oldScore ?? 0) >= 70 && r.newScore < 70);
  console.log('\n=== SUMMARY ===');
  console.log(`samples: ${rows.length}`);
  console.log(`would publish @${floor}: ${wouldPublish.length}`);
  console.log(`commodity flagged: ${rows.filter((r) => r.commodity).length}`);
  console.log(`commodity dropped below ${floor}: ${commodityDown.length}`);
  for (const key of ['Meta', 'RainPoint', 'Altar', 'Delta', 'iQOO Z11', 'OPPO', '7 days']) {
    const hit = rows.find((r) => r.title.includes(key) || r.title.toLowerCase().includes(key.toLowerCase()));
    if (hit) console.log(`etalon ${key}: old=${hit.oldScore ?? '-'} new=${hit.newScore} ${hit.decision}`);
  }

  // Local penalty sanity without model (RainPoint text)
  const rp = applyAntiCommodityPenalty(
    83,
    SAMPLES[3].title,
    SAMPLES[3].text,
  );
  console.log(`\nRainPoint local penalty on old 83 → ${rp.score} (−${rp.penalty})`);

  console.log('\nRecommended production threshold: keep 70 for now; re-check after control dry-runs.');
  console.log('Do NOT enable long AUTO from this script.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
