/**
 * Quick sanity checks for product↔photo family gate (Neakasa e-bike incident).
 * Run: npx tsx scripts/test-product-photo-gate.ts
 */
import {
  gateProductPhotoMatch,
  inferProductPhotoFamily,
} from '../src/lib/collectors/product-photo-gate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const article =
  'Neakasa Riko: свежий влажный корм для кошки по расписанию — автокормушка готовит wet meal';
const bikeUrl = 'https://cdn.example.com/aotos-ebike-fat-tire-ride-the-future.jpg';
const bikeCtx = 'AOTOS electric bike fat tire motorcycle urban';
const feederUrl = 'https://cdn.example.com/neakasa-riko-pet-feeder-wet-meal.jpg';
const feederCtx = 'Neakasa Riko cat feeder fresh wet meal';

assert(inferProductPhotoFamily(article) === 'pet_feeder', 'article family pet_feeder');
assert(inferProductPhotoFamily(bikeUrl, bikeCtx) === 'vehicle', 'bike family vehicle');
assert(inferProductPhotoFamily(feederUrl, feederCtx) === 'pet_feeder', 'feeder family');

const bad = gateProductPhotoMatch({
  articleTitle: article,
  articleText: 'кормушка для кошек влажный корм',
  photoUrl: bikeUrl,
  photoContext: bikeCtx,
});
assert(!bad.ok, 'must reject e-bike for pet feeder');

const good = gateProductPhotoMatch({
  articleTitle: article,
  articleText: 'кормушка для кошек влажный корм',
  photoUrl: feederUrl,
  photoContext: feederCtx,
});
assert(good.ok, 'must keep matching feeder photo');

console.log('product-photo-gate OK', { bad: bad.ok === false && bad.reason, good: good.ok });
