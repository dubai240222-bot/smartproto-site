/**
 * Quick sanity checks for product↔photo family gate
 * (Neakasa e-bike + Hypershell AOTOS bike incidents).
 * Run: npx tsx scripts/test-product-photo-gate.ts
 */
import {
  gateProductPhotoMatch,
  inferProductPhotoFamily,
} from '../src/lib/collectors/product-photo-gate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const feederTitle =
  'Neakasa Riko: свежий влажный корм для кошки по расписанию — автокормушка готовит wet meal';
const exoTitle = 'Экзоскелет Hypershell Halo: ИИ предскажет ваш шаг на тропе';
const bikeUrl = 'https://cdn.example.com/aotos-ebike-fat-tire-ride-the-future.jpg';
const bikeCtx = 'AOTOS electric bike fat tire motorcycle urban';
const feederUrl = 'https://cdn.shopify.com/s/files/1/0600/4736/0185/files/neakasa_riko_main_2.webp';
const exoUrl = 'https://cdn.shopify.com/s/files/1/example/hypershell-halo-closeup.jpg';

assert(inferProductPhotoFamily(feederTitle) === 'pet_feeder', 'feeder article → pet_feeder');
assert(inferProductPhotoFamily(exoTitle) === 'exoskeleton', 'hypershell → exoskeleton');
assert(inferProductPhotoFamily(bikeUrl, bikeCtx) === 'vehicle', 'AOTOS bike → vehicle');

const badFeeder = gateProductPhotoMatch({
  articleTitle: feederTitle,
  articleText: 'кормушка для кошек влажный корм',
  photoUrl: bikeUrl,
  photoContext: bikeCtx,
});
assert(!badFeeder.ok, 'must reject e-bike for pet feeder');

const badExo = gateProductPhotoMatch({
  articleTitle: exoTitle,
  articleText: 'экзоскелет для трейла Hypershell Halo',
  photoUrl: bikeUrl,
  photoContext: bikeCtx,
});
assert(!badExo.ok, 'must reject e-bike for exoskeleton');

const goodFeeder = gateProductPhotoMatch({
  articleTitle: feederTitle,
  articleText: 'кормушка для кошек',
  photoUrl: feederUrl,
  photoContext: 'Neakasa Riko pet feeder wet meal',
});
assert(goodFeeder.ok, 'must keep matching feeder photo');

const goodExo = gateProductPhotoMatch({
  articleTitle: exoTitle,
  articleText: 'Hypershell Halo exoskeleton trail',
  photoUrl: exoUrl,
  photoContext: 'Hypershell Halo exoskeleton close-up',
});
assert(goodExo.ok, 'must keep matching exoskeleton photo');

console.log('product-photo-gate OK', {
  rejectFeederBike: badFeeder.reason,
  rejectExoBike: badExo.reason,
  keepFeeder: goodFeeder.ok,
  keepExo: goodExo.ok,
});
