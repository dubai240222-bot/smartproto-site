/**
 * SP-A-068R — Editorial DNA v1 control (max 10 Scout calls, no live ticks).
 * OLD SCOUT = prior known/estimated band before DNA prompt (not a second model run).
 */
import 'dotenv/config';
import fs from 'node:fs';
import { scoutArticle } from '../src/lib/ai/scout';

const FLOOR = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);

type Fix = {
  key: string;
  title: string;
  text: string;
  /** Pre-068R known/estimated Scout band for comparison (no second AI call). */
  oldScout: number;
  bucket: string;
};

const FIXTURES: Fix[] = [
  {
    key: 'access_money',
    bucket: 'доступ/экономия денег',
    title: 'Phone software update turns smartphones into RFID readers without new hardware',
    text: 'A software update and tiny existing chip capability let ordinary phones read RFID tags that used to need a separate reader purchase. Available as OS/app update for recent phones.',
    oldScout: 72,
  },
  {
    key: 'independence',
    bucket: 'самостоятельность',
    title: 'Meta wants to replace your mouse and keyboard with this bracelet',
    text: 'Meta presented a neural wristband that reads muscle signals so one person can control a computer by gestures, without a desk setup. Announced consumer-facing wearable.',
    oldScout: 85,
  },
  {
    key: 'one_person_work',
    bucket: 'one-person work/business',
    title: 'Tacta Systems takes aim at high-skilled manufacturing work with TactaBot',
    text: 'TactaBot robotic hands claim to let a small shop perform skilled assembly tasks that usually need trained specialists or a larger team. Early commercial robotics for manufacturing.',
    oldScout: 80,
  },
  {
    key: 'health_home',
    bucket: 'health/home',
    title: 'Delta Children Aero smart auto-glide bassinet',
    text: 'Bassinet detects baby cry and auto-glides/responds so parents get help at home without a night nurse. Consumer product available.',
    oldScout: 60,
  },
  {
    key: 'assistive',
    bucket: 'assistive technology',
    title: 'Wearable that reads text aloud for people with low vision using on-device AI',
    text: 'A glasses/clip wearable reads printed text and labels aloud in real time, aiming to reduce dependence on a second person for everyday reading. Announced assistive device.',
    oldScout: 78,
  },
  {
    key: 'expensive_niche',
    bucket: 'дорогой нишевый gadget',
    title: '$3,200 titanium desk sculpture that also charges your phone wirelessly',
    text: 'Luxury limited desk objet with wireless charging. Ordinary $20 pad charges the same. No new capability beyond aesthetics.',
    oldScout: 35,
  },
  {
    key: 'factory_robot',
    bucket: 'factory robot',
    title: 'New six-axis factory arm ships with 15% faster cycle time for auto plants',
    text: 'Industrial robot arm upgrade for automotive factories. Specs and throughput for plant engineers. No consumer or small-business door.',
    oldScout: 55,
  },
  {
    key: 'humanoid_research',
    bucket: 'humanoid/research',
    title: 'MIT CSAIL researchers give robots a better feel for object manipulation',
    text: 'Lab research paper/demo on tactile manipulation. Research prototype in university lab; no product, no clear near-term home use.',
    oldScout: 70,
  },
  {
    key: 'specs_story',
    bucket: 'specs story',
    title: 'iQOO T: cooling system test and 200 MP camera teased for next phone',
    text: 'Phone rumor/lineup piece focused on megapixels, cooling, and chip refresh. Incremental smartphone specs.',
    oldScout: 18,
  },
  {
    key: 'ordinary_refresh',
    bucket: 'ordinary product refresh',
    title: 'RainPoint connected watering system with gateway, two zones, and soil sensor',
    text: 'Smart irrigation kit with soil and rain sensors. Routine smart-home watering; ordinary timers/hoses remain cheaper for many yards.',
    oldScout: 28,
  },
];

async function main() {
  const rows = [];
  for (const f of FIXTURES) {
    console.log(`\nScout ${f.key}...`);
    const r = await scoutArticle(f.title, f.text, 'gadget');
    const verdict = r.score >= FLOOR ? 'PASS' : 'REJECT';
    const flagship = r.flagship === true ? 'YES' : 'NO';
    const row = {
      key: f.key,
      bucket: f.bucket,
      title: f.title,
      oldScout: f.oldScout,
      newScout: r.score,
      humanWall: r.humanWall || '—',
      openedDoor: r.openedDoor || '—',
      whoCares: r.whoCares || '—',
      access: r.accessNote || '—',
      reality: r.status || '—',
      verdict,
      flagship,
      why: (r.reason || '').slice(0, 140),
    };
    rows.push(row);
    console.log(
      `  old=${f.oldScout} new=${r.score} ${verdict} flagship=${flagship} wall=${(r.humanWall || '').slice(0, 40)}`,
    );
  }

  fs.mkdirSync('data/spa068r', { recursive: true });
  fs.writeFileSync(
    'data/spa068r/control10.json',
    JSON.stringify({ id: 'SP-A-068R', floor: FLOOR, rows }, null, 2),
  );
  console.log('\nWrote data/spa068r/control10.json');
  for (const row of rows) {
    console.log('---');
    console.log(`TITLE: ${row.title}`);
    console.log(`OLD SCOUT: ${row.oldScout}`);
    console.log(`HUMAN WALL: ${row.humanWall}`);
    console.log(`OPENED DOOR: ${row.openedDoor}`);
    console.log(`WHO CARES: ${row.whoCares}`);
    console.log(`ACCESS: ${row.access}`);
    console.log(`REALITY: ${row.reality}`);
    console.log(`NEW EDITORIAL VERDICT: ${row.verdict} @${row.newScout}`);
    console.log(`FLAGSHIP: ${row.flagship}`);
    console.log(`WHY: ${row.why}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
