/**
 * SP-A-087 — editorial depth control (dry, no publish).
 *
 *   npx tsx scripts/spa087-editorial-depth-control.ts
 */
import 'dotenv/config';
import { writeDraft } from '../src/lib/ai/editor';

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CASES = [
  {
    name: 'AI tokens −70% → agent cost angle',
    articleData: {
      format: 'article' as const,
      mode: 'ai_radar' as const,
      title: 'New training method uses fewer tokens',
      sourceName: 'lab note',
      text: [
        'Researchers published a method that cuts token usage by 70% for multi-step AI agents.',
        'On the same tasks, agents needed far fewer tokens while keeping task success rate.',
        'Authors say this can make multi-step AI agents cheaper to run in production by cutting token spend.',
        'Method works by compressing intermediate reasoning traces without inventing new facts.',
      ].join('\n'),
    },
    reviewData: { technicalVerdict: 'PASS: AI efficiency capability with measured token cut' },
    must: [/70\s*%|на\s*70/i, /агент|токен|дешев|расход|эксплуатац/i],
  },
  {
    name: 'Robot one-shot demo → learning shift',
    articleData: {
      format: 'article' as const,
      mode: 'ai_radar' as const,
      title: 'Robot learning improved with new training',
      sourceName: 'IEEE Spectrum',
      text: [
        'A robot learned a new household manipulation task after a single human demonstration.',
        'Previously the same lab stack needed dozens of demos for comparable success.',
        'Contact-rich task: pouring and placing a flexible object.',
        'Researchers frame this as a shift toward one-shot / few-shot robot teaching.',
      ].join('\n'),
    },
    reviewData: { technicalVerdict: 'PASS: robotics learning capability' },
    must: [/одной демонстрац|one[- ]shot|после одной/i, /обучен|учить|робот/i],
  },
  {
    name: 'Cold-weather battery (not just “new battery”)',
    articleData: {
      format: 'article' as const,
      mode: 'gadget' as const,
      title: 'Company launches new battery pack',
      sourceName: 'vendor',
      text: [
        'New lithium pack keeps >80% capacity at −30°C where ordinary packs drop sharply.',
        'Intended for outdoor tools and vehicles in winter climates.',
        'Lab tests: standard pack lost most usable capacity below −20°C; this pack held above 80% at −30°C.',
        'Charge rate in cold still limited; manufacturer does not claim summer range gains.',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: battery with cold-climate capability',
      productName: 'ColdPack',
    },
    must: [/−\s*30|-30|минус\s*30|моро|холод|замерза/i, /80\s*%/i],
  },
];

async function main() {
  console.log('SP-A-087 editorial depth control\n');
  let fail = 0;
  for (const c of CASES) {
    try {
      const draft = await writeDraft(c.articleData, c.reviewData);
      const words = wc(draft.text);
      const hits = c.must.map((re) => re.test(`${draft.title}\n${draft.text}`));
      const depthOk = words >= 160;
      const depthSoft = words >= 120;
      const angleOk = hits.every(Boolean);
      const ok = draft.title !== 'REJECT' && angleOk && depthSoft;
      if (!ok) fail += 1;
      console.log('='.repeat(64));
      console.log(c.name);
      console.log(
        'WORDS',
        words,
        'DEPTH',
        depthOk ? 'OK' : depthSoft ? 'SOFT' : 'THIN',
        'ANGLE',
        angleOk ? 'OK' : 'WEAK',
      );
      console.log('TITLE', draft.title);
      console.log(draft.text);
      console.log();
    } catch (err) {
      fail += 1;
      console.log('='.repeat(64));
      console.log(c.name);
      console.log('ERROR', err instanceof Error ? err.message : String(err));
      console.log();
    }
  }
  if (fail) {
    console.error('FAILED', fail);
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
