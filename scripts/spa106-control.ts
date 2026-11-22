/**
 * SP-A-106 — NO_PRODUCT is a shop-SKU gate, not a magazine-wide buy/preorder ban.
 * Early tech may reach Scout; Amazon/price-only copy still dies; commodity final gate stays.
 */
import assert from 'node:assert/strict';
import { hardRejectTopic, allowsWithoutBuyPreorder } from '../src/lib/ai/hard-reject';
import {
  assertFinalAutoPublishAllowed,
  FinalAutoGateError,
} from '../src/lib/ai/final-auto-commodity-gate';

function expectPass(title: string, text: string) {
  const gate = hardRejectTopic(title, text, { sourceName: 'New Atlas', mode: 'gadget' });
  assert.equal(gate.reject, false, `${title} → ${gate.rejectCode}: ${gate.reason}`);
  assert.equal(allowsWithoutBuyPreorder(title, text), true);
}

function expectCode(title: string, text: string, code: string) {
  const gate = hardRejectTopic(title, text, { sourceName: 'RSS', mode: 'gadget' });
  assert.equal(gate.reject, true, `expected reject for "${title}"`);
  assert.equal(gate.rejectCode, code, `${title} expected ${code} got ${gate.rejectCode}`);
}

expectPass(
  'New imaging method spots disease years earlier',
  'Experimental diagnostic imaging method for early detection in future medicine.',
);
expectPass(
  'Thermoelectric fabric harvests body heat to power sensors',
  'Researchers created a thermoelectric energy-harvesting textile. Not yet commercially available.',
);

expectCode(
  'Best USB-C cables on Amazon this week',
  'Priced at $12 on amazon.com, on sale now.',
  'NO_PRODUCT',
);
expectCode('How elephants mourn their dead', 'Wildlife natural history museum story.', 'HARD_TOPIC');
expectCode(
  'iPhone 17 rumor dump: new color options',
  'Leak of iPhone 17 colorways and finishes.',
  'OVERPLAYED_MASS',
);

try {
  assertFinalAutoPublishAllowed({
    title: 'Attack Shark gaming mouse with 23 buttons for every genre',
    summary: 'Ordinary gaming mouse peripheral with extra buttons and RGB.',
    content: 'Ordinary gaming mouse peripheral with extra buttons and RGB.',
    tags: ['gadgets'],
    category: 'Гаджеты',
    agentId: 'newsroom-scout',
  });
  assert.fail('gaming mouse must still die at commodity final gate');
} catch (err) {
  assert.ok(err instanceof FinalAutoGateError, String(err));
}

console.log('spa106-control: PASS');
