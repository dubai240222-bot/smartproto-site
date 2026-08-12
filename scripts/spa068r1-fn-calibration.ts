/**
 * SP-A-068R1 — targeted FN calibration (exactly 5 Scout calls).
 * No live. No merge.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { scoutArticle } from '../src/lib/ai/scout';

const FLOOR = Number(process.env.SCOUT_SCORE_THRESHOLD || 70);

const CASES = [
  {
    key: 'assistive',
    title: 'Wearable that reads text aloud for people with low vision using on-device AI',
    text: 'A glasses/clip wearable reads printed text and labels aloud in real time, aiming to reduce dependence on a second person for everyday reading. Announced assistive device.',
    expect: 'not killed; ideally PASS >=70',
  },
  {
    key: 'tacta',
    title: 'Tacta Systems takes aim at high-skilled manufacturing work with TactaBot',
    text: 'TactaBot robotic hands claim to let a small shop perform skilled assembly tasks that usually need trained specialists or a larger team. Early commercial robotics for manufacturing.',
    expect: 'not auto-REJECT for SMB; NORMAL/STRONG or reject on real merit',
  },
  {
    key: 'csail',
    title: 'MIT CSAIL researchers give robots a better feel for object manipulation',
    text: 'Lab research paper/demo on tactile manipulation. Research prototype in university lab; no product, no clear near-term home use.',
    expect: 'Human Value allowed; REALITY=RESEARCH; not hard-zero',
  },
  {
    key: 'factory',
    title: 'New six-axis factory arm ships with 15% faster cycle time for auto plants',
    text: 'Industrial robot arm upgrade for automotive factories. Specs and throughput for plant engineers. No consumer or small-business door.',
    expect: 'REJECT',
  },
  {
    key: 'specs',
    title: 'iQOO T: cooling system test and 200 MP camera teased for next phone',
    text: 'Phone rumor/lineup piece focused on megapixels, cooling, and chip refresh. Incremental smartphone specs.',
    expect: 'REJECT',
  },
];

async function main() {
  const rows = [];
  for (const c of CASES) {
    console.log(`\nScout ${c.key}...`);
    const r = await scoutArticle(c.title, c.text, 'gadget');
    const row = {
      key: c.key,
      title: c.title,
      expect: c.expect,
      score: r.score,
      verdict: r.score >= FLOOR ? 'PASS' : 'REJECT',
      flagship: r.flagship === true ? 'YES' : 'NO',
      reality: r.status || '—',
      humanWall: r.humanWall || '—',
      openedDoor: r.openedDoor || '—',
      whoCares: r.whoCares || '—',
      access: r.accessNote || '—',
      why: (r.reason || '').slice(0, 160),
    };
    rows.push(row);
    console.log(
      `  ${row.verdict} @${row.score} flag=${row.flagship} reality=${row.reality} wall=${String(row.humanWall).slice(0, 50)}`,
    );
  }
  fs.mkdirSync('data/spa068r', { recursive: true });
  fs.writeFileSync(
    'data/spa068r/control5-r1.json',
    JSON.stringify({ id: 'SP-A-068R1', floor: FLOOR, rows }, null, 2),
  );
  console.log('\nWrote data/spa068r/control5-r1.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
