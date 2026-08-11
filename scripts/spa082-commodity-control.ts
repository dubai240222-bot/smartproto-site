/**
 * SP-A-082 — control suite for final AUTO commodity gate.
 * Dry checks only — does not write SQLite.
 *
 *   npx tsx scripts/spa082-commodity-control.ts
 */
import {
  finalAutoCommodityGate,
  type FinalAutoGateInput,
} from '../src/lib/ai/final-auto-commodity-gate';

type Case = FinalAutoGateInput & {
  name: string;
  expect: 'REJECT' | 'PASS';
};

const CASES: Case[] = [
  {
    name: 'china-v3 gaming mouse (23 buttons)',
    expect: 'REJECT',
    agentId: 'china-qwen',
    title: 'Игровая мышь с 23 кнопками подстраивается под любой жанр',
    summary: 'Razer Naga V3 Pro с тремя сменными панелями и 23 кнопками.',
    content:
      'Новая Razer Naga V3 Pro предлагает три сменные боковые панели. 23 программируемые кнопки и сенсор Focus Pro 50K, 8000 DPI.',
    tags: ['Razer', 'игровая мышь', 'гейминг'],
    category: 'Гаджеты',
  },
  {
    name: 'AUTO RSS ordinary gaming mouse',
    expect: 'REJECT',
    agentId: 'newsroom-scout',
    title: 'Logitech G Pro wireless gaming mouse hits 8000 Hz',
    content: 'New gaming mouse with 8000 Hz polling rate and lighter shell.',
  },
  {
    name: 'AI radar commodity keyboard',
    expect: 'REJECT',
    agentId: 'newsroom-scout',
    title: 'Mechanical gaming keyboard with new switches',
    content: 'Another mechanical keyboard refresh for gamers.',
    extra: 'ai-radar candidate',
  },
  {
    name: 'ordinary monitor',
    expect: 'REJECT',
    agentId: 'china-qwen',
    title: 'MSI QD-OLED gaming monitor 240Hz',
    content: '27-inch gaming monitor with 240 Hz refresh.',
  },
  {
    name: 'ordinary smartphone battery',
    expect: 'REJECT',
    agentId: 'china-qwen',
    title: 'Ulefone Armor 24 Pro: смартфон с батареей на 22000 мАч',
    content: 'Защищённый смартфон с огромной батареей.',
  },
  {
    name: 'lens refresh',
    expect: 'REJECT',
    agentId: 'china-qwen',
    title: 'Sony представила лёгкий зум-объектив 100-400mm для фотографов',
    content: 'Более лёгкий zoom lens FE 100-400mm для камер Sony.',
  },
  {
    name: 'assistive EMG bracelet (PASS)',
    expect: 'PASS',
    agentId: 'newsroom-scout',
    title: 'EMG bracelet lets people without hand function type again',
    content:
      'Assistive EMG bracelet gives people with paralysis the ability to control devices without using their hands — accessibility independence.',
  },
  {
    name: 'exoskeleton clinic→home (PASS)',
    expect: 'PASS',
    agentId: 'china-qwen',
    title: 'Home exoskeleton moves rehab from clinic to living room',
    content:
      'Clinic → home exoskeleton for patients who cannot walk unaided — professional rehab democratized for home care.',
  },
  {
    name: 'humanoid robot capability (PASS)',
    expect: 'PASS',
    agentId: 'newsroom-scout',
    title: 'Care robot helps elderly live independently at home',
    content:
      'Humanoid robot helper supports assistive independence for elderly people living alone.',
  },
  {
    name: 'Chief gaming mouse (must PASS / bypass)',
    expect: 'PASS',
    agentId: 'chief-fast-lane',
    title: 'Игровая мышь с 23 кнопками подстраивается под любой жанр',
    content: 'Owner-picked Chief publish of a gaming mouse.',
  },
  {
    name: 'Author gaming mouse (must PASS / bypass)',
    expect: 'PASS',
    agentId: 'author-door',
    title: 'Logitech G Pro wireless gaming mouse',
    content: 'Author door manual publish.',
  },
];

function main() {
  let failed = 0;
  console.log('SP-A-082 commodity control\n');
  for (const c of CASES) {
    const result = finalAutoCommodityGate(c);
    const got = result.ok ? 'PASS' : 'REJECT';
    const ok = got === c.expect;
    if (!ok) failed += 1;
    const detail = result.ok
      ? result.bypassed
        ? `bypass=${result.bypassed}`
        : 'ok'
      : result.reason;
    console.log(`${ok ? 'OK  ' : 'FAIL'} [${got}] ${c.name}`);
    console.log(`     ${detail}`);
  }

  const mouseAuto = finalAutoCommodityGate({
    agentId: 'china-qwen',
    title: 'Normal gaming mouse with 23 buttons and 8000 DPI',
    content: 'Ordinary gaming accessory SKU.',
  });
  const canAutoMouse = mouseAuto.ok;
  console.log('\nCRITICAL:');
  console.log(
    `CAN ANY AUTO PATH PUBLISH A NORMAL GAMING MOUSE? ${canAutoMouse ? 'YES (BAD)' : 'NO'}`,
  );

  if (failed || canAutoMouse) {
    console.error(`\nFAILED cases=${failed} mouseAuto=${canAutoMouse}`);
    process.exit(1);
  }
  console.log('\nALL CONTROLS PASSED');
}

main();
