/**
 * SP-A-093 — control: capability stories reach Scout pool; commodity stays blocked.
 * No network.
 */
import assert from 'node:assert/strict';
import {
  hardRejectTopic,
  looksBuyableGadget,
  allowsWithoutBuyPreorder,
  isCapabilityEditorialStory,
} from '../src/lib/ai/hard-reject';
import {
  assertFinalAutoPublishAllowed,
  FinalAutoGateError,
} from '../src/lib/ai/final-auto-commodity-gate';

function expectScoutPool(title: string, text: string, source: string) {
  const gate = hardRejectTopic(title, text, { sourceName: source, mode: 'gadget' });
  assert.equal(
    gate.reject,
    false,
    `expected Scout-pool pass for "${title}" but got ${gate.rejectCode}: ${gate.reason}`,
  );
  assert.equal(looksBuyableGadget(title, text, source), true);
  assert.equal(allowsWithoutBuyPreorder(title, text), true);
}

function expectHardBlocked(title: string, text: string, source: string) {
  // May pass hardReject if buyable-shaped, but commodity final gate must reject.
  try {
    assertFinalAutoPublishAllowed({
      title,
      summary: text.slice(0, 160),
      content: text,
      tags: ['gadgets'],
      category: 'Гаджеты',
      agentId: 'newsroom-scout',
    });
    assert.fail(`expected commodity final gate reject for "${title}"`);
  } catch (err) {
    assert.ok(err instanceof FinalAutoGateError, String(err));
  }
}

// PASS TO SCOUT POOL (capability — not automatic publish)
expectScoutPool(
  "World's first solar-powered ambulance hits the real world",
  'Stella Juva solar-powered ambulance enters real-world trials with solar panels powering the vehicle.',
  'New Atlas',
);
expectScoutPool(
  'Smart clothing controls devices via finger movements – no touching required',
  'Smart textile senses finger movements to control devices without touch — new human capability.',
  'New Atlas Wearables',
);
expectScoutPool(
  'Computer memory prototype ditches 1s and 0s for denser data storage',
  'Researchers unveil a memory architecture prototype that stores denser data without binary bits.',
  'New Atlas Electronics',
);
assert.equal(
  isCapabilityEditorialStory(
    'Soft robotic gripper prototype lifts fragile objects in lab demo',
    'Robotics prototype demonstrates assistive independence for delicate tasks.',
  ),
  true,
);
assert.equal(
  isCapabilityEditorialStory(
    'Clinic-to-home medical imaging prototype for remote patients',
    'Medical prototype brings clinic imaging capability into the home.',
  ),
  true,
);

// SP-A-106 — early tech / not-yet-buyable magazine stories reach Scout pool
expectScoutPool(
  'New imaging method spots disease years earlier',
  'Engineers developed an experimental diagnostic imaging method for early detection. Not a shop listing.',
  'New Atlas',
);
expectScoutPool(
  'Thermoelectric fabric harvests body heat to power sensors',
  'Researchers created a thermoelectric textile that harvests energy. Not yet commercially available.',
  'IEEE Spectrum',
);

// Shop-signal-only copy must NOT pass just because it says Amazon / priced at
{
  const shop = hardRejectTopic(
    'Best USB-C cables on Amazon this week',
    'Priced at $12 on amazon.com, on sale now.',
    { sourceName: 'Roundup Blog', mode: 'gadget' },
  );
  assert.equal(shop.reject, true, 'shop roundup must not pass NO_PRODUCT via Amazon/price');
  assert.equal(shop.rejectCode, 'NO_PRODUCT');
}

// Commodity / ordinary SKU must stay blocked at final gate
expectHardBlocked(
  'Attack Shark gaming mouse with 23 buttons for every genre',
  'Ordinary gaming mouse peripheral with extra buttons and RGB.',
  'IT Home',
);
expectHardBlocked(
  'Honor Robot Phone Hands-on: Bold Phone With A Moving Camera Few Can Buy',
  'Ordinary smartphone SKU with motorized camera gimbal — phone refresh.',
  'Yanko Design',
);

console.log('spa093-control: PASS');
