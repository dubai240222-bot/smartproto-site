/**
 * SP-A-065 — editorial recalibration helpers (local, deterministic).
 * Tier/source does NOT inflate score. Commodity stories get a hard penalty.
 */

import {
  hasStrongConsumerAngle,
  isCommodityLowWow,
  isKeepWowException,
  isOverplayedMassTopic,
} from './hard-reject';

export type ProductStatus =
  | 'AVAILABLE'
  | 'ANNOUNCED'
  | 'PROTOTYPE'
  | 'RESEARCH'
  | 'CONCEPT'
  | 'CROWDFUNDING';

/** New Scout parts (sum 0–100). */
export interface ScoutScorePartsV2 {
  humanSurprise: number; // 0–30
  visualDemonstrability: number; // 0–20
  everydayRelevance: number; // 0–15
  novelty: number; // 0–15
  shareability: number; // 0–10
  credibility: number; // 0–10
}

/**
 * Commodity / routine product news class (SP-A-065).
 * Strong unusual angle can still pass via hasStrongConsumerAngle / KEEP exceptions.
 */
const COMMODITY_ROUTINE_RE =
  /\b(new\s+(iphone|pixel|galaxy|smartphone|phone|laptop|notebook|ultrabook|monitor|keyboard|power\s*bank|charger)\b)|(\b(lineup|line-up|series)\s+(will\s+)?(be\s+)?(unveil|announce|launch|reveal))|(\b(will\s+unveil|to\s+announce|set\s+to\s+launch).{0,40}(phone|smartphone|lineup|series))|(\b(specs?\s+leak|price\s+leak|rumor|rumour).{0,40}(iphone|pixel|galaxy|xiaomi|huawei|iqoo|oppo|vivo))|(\b(refresh|incremental\s+update|same\s+design|minor\s+upgrade)\b.{0,40}(phone|laptop|monitor|keyboard))|(обычн\w*\s+(смартфон|ноутбук|монитор|клавиатур|пауэрбанк))|(представит\s+линейк)|(утечк\w*.{0,30}(iqoo|huawei|xiaomi|pixel|iphone))/i;

/** Routine smart-home SKUs without a surprising mechanism (e.g. basic soil+rain watering kit). */
const SMART_HOME_ROUTINE_RE =
  /\bsmart\s+(watering|irrigation|sprinkler|plug|bulb|outlet|thermostat|switch|doorbell)\b|система\s+полива\s+с\s+датчик|connected\s+watering|soil\s+sensor.{0,40}(gateway|zone)/i;

export function looksCommodityRoutine(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  if (isKeepWowException(title, text) || hasStrongConsumerAngle(title, text)) return false;
  if (isCommodityLowWow(title, text) || isOverplayedMassTopic(title, text)) return true;
  return COMMODITY_ROUTINE_RE.test(hay);
}

export function looksSmartHomeRoutine(title: string, text = ''): boolean {
  if (isKeepWowException(title, text) || hasStrongConsumerAngle(title, text)) return false;
  return SMART_HOME_ROUTINE_RE.test(`${title}\n${text}`);
}

/** Infer product status from copy — never upgrade concept/crowdfunding to available. */
export function inferProductStatus(title: string, text = ''): ProductStatus {
  const hay = `${title}\n${text}`.toLowerCase();
  if (/\b(kickstarter|indiegogo|crowdfund|на\s*kickstarter|сбор\s*средств)\b/i.test(hay)) {
    return 'CROWDFUNDING';
  }
  if (/\b(concept\s+(car|device|phone|keyboard)|designer\s+concept|концепт)\b/i.test(hay)) {
    return 'CONCEPT';
  }
  if (/\b(research|paper|study|lab\s+demo|peer[- ]reviewed|scientists?\s+(develop|show|demonstrate)|university)\b/i.test(hay)) {
    return 'RESEARCH';
  }
  if (/\b(prototype|lab\s+prototype|working\s+prototype|прототип)\b/i.test(hay)) {
    return 'PROTOTYPE';
  }
  if (/\b(available\s+now|on\s+sale|buy\s+now|shipping|preorder|pre-order|in\s+stores|можно\s+купить|предзаказ)\b/i.test(hay)) {
    return 'AVAILABLE';
  }
  if (/\b(announce|unveil|reveal|launching|will\s+launch|анонс|представил|представит)\b/i.test(hay)) {
    return 'ANNOUNCED';
  }
  return 'ANNOUNCED';
}

export function sumPartsV2(p: ScoutScorePartsV2): number {
  return (
    clamp(p.humanSurprise, 0, 30) +
    clamp(p.visualDemonstrability, 0, 20) +
    clamp(p.everydayRelevance, 0, 15) +
    clamp(p.novelty, 0, 15) +
    clamp(p.shareability, 0, 10) +
    clamp(p.credibility, 0, 10)
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Apply anti-commodity penalty after model parts sum.
 * Wrong product / routine electronics should not sit at 80+.
 */
export function applyAntiCommodityPenalty(
  rawScore: number,
  title: string,
  text = '',
): { score: number; penalty: number; reason?: string } {
  if (looksCommodityRoutine(title, text)) {
    // Routine phones/lineups/leaks → land in ~0–25 band.
    const targetCap = 25;
    const penalty = Math.max(0, rawScore - targetCap);
    return {
      score: Math.min(rawScore, targetCap),
      penalty,
      reason: 'anti-commodity (routine product / lineup / specs refresh)',
    };
  }
  if (looksSmartHomeRoutine(title, text)) {
    // RainPoint-class → ~0–35.
    const targetCap = 35;
    const penalty = Math.max(0, rawScore - targetCap);
    return {
      score: Math.min(rawScore, targetCap),
      penalty,
      reason: 'smart-home routine (not enough surprise)',
    };
  }
  return { score: rawScore, penalty: 0 };
}

/**
 * SP-A-065B — soft novelty: do NOT zero score for "not a brand-new category".
 * Unusual improvements (ultra-thin keyboard, cry-response bassinet) may sit at 40–69.
 * 70+ still requires strong parts / actual newness.
 */
export function applySoftNoveltyAdjust(
  rawScore: number,
  opts: {
    isActuallyNew: boolean;
    noProduct: boolean;
    title: string;
    text?: string;
    parts?: ScoutScorePartsV2;
  },
): { score: number; penalty: number; capped: boolean; reason?: string } {
  if (opts.noProduct) {
    return { score: 0, penalty: rawScore, capped: false, reason: 'no product' };
  }
  if (looksCommodityRoutine(opts.title, opts.text) || looksSmartHomeRoutine(opts.title, opts.text)) {
    // Commodity path already handled by applyAntiCommodityPenalty.
    return { score: rawScore, penalty: 0, capped: false };
  }
  if (opts.isActuallyNew) {
    return { score: rawScore, penalty: 0, capped: false };
  }

  const surprise = opts.parts?.humanSurprise ?? 0;
  const novelty = opts.parts?.novelty ?? 0;
  const share = opts.parts?.shareability ?? 0;
  const strongWow = surprise >= 22 && (novelty >= 10 || share >= 7);

  // Soft mid-band: keep unusual category improvements visible (Altar/Delta class).
  let score = rawScore;
  let penalty = 0;
  if (score > 55) {
    penalty = Math.min(20, score - 55);
    score -= penalty;
  }
  let capped = false;
  if (!strongWow && score > 69) {
    capped = true;
    penalty += score - 69;
    score = 69;
  }
  // Floor mid interest so we don't collapse to 0.
  if (score > 0 && score < 40 && rawScore >= 50) {
    score = 40;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    penalty,
    capped,
    reason: capped
      ? 'soft novelty: capped below 70 without strong surprise'
      : 'soft novelty: mid-band for category improvement',
  };
}

export const SCOUT_SYSTEM_PROMPT_GADGET_V2 = [
  'Ты разведчик SmartProto. Нужны действительно интересные изобретения, полезные AI-инструменты, research с понятной пользой,',
  'необычные гаджеты/приложения — НЕ обычный товарный шум и НЕ лента про роботов.',
  'CORE: CAPABILITY→FREEDOM→PROOF→EARLY — новая человеческая возможность, свобода от рутины, доказательство, ранний сигнал.',
  'HARD: конкретный объект интереса (устройство / прототип / research demo / app / AI-модель). Покупка сегодня НЕ обязательна.',
  'Публичный текст БЕЗ цен и БЕЗ ссылок.',
  '',
  'Оценка 0–100 СТРОГО суммой частей (новые веса SP-A-065):',
  'humanSurprise 0–30 — обычный человек: «неужели такое уже существует?»',
  'visualDemonstrability 0–20 — можно ли показать сильным фото/видео',
  'everydayRelevance 0–15 — ценность понятна без техподготовки',
  'novelty 0–15 — новая категория/способ, не «ещё одна версия»',
  'shareability 0–10 — захочет ли человек отправить знакомому',
  'credibility 0–10 — реальный продукт / prototype / primary research',
  '',
  'ANTI-COMMODITY: низкие части (итог ориентир 0–35), если история про очередной смартфон/ноутбук/монитор/клавиатуру/powerbank,',
  'линейку «представят в сентябре», утечку характеристик без необычной идеи, обычный smart-watering kit.',
  '',
  'SOFT NOVELTY (SP-A-065B): не ставь score=0 только потому что категория уже существует.',
  'Необычное улучшение существующей категории (ультратонкая клавиатура, люлька с автооткликом на плач) → ориентир 40–69.',
  '70+ только при высоком humanSurprise / shareability / настоящей новизне способа.',
  '',
  'PRIORITY: EV/mobility, health-tech, energy/solar/Starlink, apps, travel, materials, inventions, lifehacks, unusual smart home — сайт не робо-блог.',
  'DIVERSIFY desks: gadgets / apps / AI capability / inventions — не серия robotics/research подряд.',
  'REJECT robotics flood: humanoid, robot hand, lab manipulator, industrial robot, robotaxi-as-main-story без бытового гаджета.',
  'Home robot vacuum/lawn OK редко. Иначе сайт становится узким робо-блогом — это запрещено.',
  '',
  'ЭТАЛОНЫ: Meta gesture wristband → 80–90; ETH drones → 70–85; grounded AI tool/demo с ясной пользой → 70–90;',
  'Delta Aero (cry-response) → ~50–70; Altar II (extreme thinness) → ~40–65; RainPoint watering → 0–35;',
  'обычный iQOO/OPPO/iPhone rumor/lineup → 0–25; humanoid/robot-hand flood без бытовой пользы → 0–25.',
  '',
  'status: AVAILABLE | ANNOUNCED | PROTOTYPE | RESEARCH | CONCEPT | CROWDFUNDING.',
  'Не маскируй concept/crowdfunding под AVAILABLE.',
  'REJECT: мусор/политика/SEO/robotics flood — не обнуляй mid-band необычные улучшения гаджетов/apps.',
].join('\n');
