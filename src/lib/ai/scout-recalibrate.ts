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
import {
  applyHumanPriorityGate,
  isGreyGadgetNoise,
} from './human-priority-gate';

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
  /\b(new\s+(iphone|pixel|galaxy|smartphone|phone|laptop|notebook|ultrabook|monitor|keyboard|power\s*bank|charger|mouse|speaker|earbuds)\b)|(\b(lineup|line-up|series)\s+(will\s+)?(be\s+)?(unveil|announce|launch|reveal))|(\b(will\s+unveil|to\s+announce|set\s+to\s+launch).{0,40}(phone|smartphone|lineup|series))|(\b(specs?\s+leak|price\s+leak|rumor|rumour).{0,40}(iphone|pixel|galaxy|xiaomi|huawei|iqoo|oppo|vivo|lava))|(\b(refresh|incremental\s+update|same\s+design|minor\s+upgrade)\b.{0,40}(phone|laptop|monitor|keyboard|mouse|speaker))|(обычн\w*\s+(смартфон|ноутбук|монитор|клавиатур|пауэрбанк|мышь|колонк))|(представит\s+линейк)|(утечк\w*.{0,30}(iqoo|huawei|xiaomi|pixel|iphone|lava))|(jbl\s*pulse|xboom|aula\s*sc\d)/i;

/** Routine smart-home SKUs without a surprising mechanism (e.g. basic soil+rain watering kit). */
const SMART_HOME_ROUTINE_RE =
  /\bsmart\s+(watering|irrigation|sprinkler|plug|bulb|outlet|thermostat|switch|doorbell)\b|система\s+полива\s+с\s+датчик|connected\s+watering|soil\s+sensor.{0,40}(gateway|zone)/i;

export function looksCommodityRoutine(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  if (isGreyGadgetNoise(title, text)) return true;
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
 * SP-A-071 Human Priority Gate + legacy anti-commodity caps.
 * Threshold env (70) unchanged — we only demote scores.
 */
export function applyAntiCommodityPenalty(
  rawScore: number,
  title: string,
  text = '',
): { score: number; penalty: number; reason?: string } {
  const priority = applyHumanPriorityGate(rawScore, title, text);
  let score = priority.score;
  let penalty = priority.penalty;
  let reason = priority.reason;

  // Extra legacy caps only if priority gate did not already block/demote harder.
  if (!priority.blockPublish && looksCommodityRoutine(title, text) && priority.door === 'none') {
    const targetCap = 25;
    if (score > targetCap) {
      penalty += score - targetCap;
      score = targetCap;
      reason = reason
        ? `${reason}; anti-commodity cap`
        : 'anti-commodity (routine product / lineup / specs refresh)';
    }
  }
  if (!priority.blockPublish && looksSmartHomeRoutine(title, text) && priority.door === 'none') {
    const targetCap = 35;
    if (score > targetCap) {
      penalty += score - targetCap;
      score = targetCap;
      reason = reason ? `${reason}; smart-home routine` : 'smart-home routine (not enough surprise)';
    }
  }

  return { score, penalty, reason };
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
  'Ты разведчик SmartProto. Нужны истории с человеческой дверью: экономия денег/времени,',
  'один человек вместо команды/специалиста, услуга домой, самостоятельность, новая способность,',
  'снятие рутины — НЕ серая бытовуха.',
  'HARD: конкретный объект интереса (устройство / прототип / research demo / app). Покупка сегодня НЕ обязательна.',
  'Публичный текст БЕЗ цен и БЕЗ ссылок.',
  '',
  'Оценка 0–100 СТРОГО суммой частей (новые веса SP-A-065):',
  'humanSurprise 0–30 — «неужели такое уже существует?» / «перешлю другу»',
  'visualDemonstrability 0–20 — сильное фото/видео',
  'everydayRelevance 0–15 — понятная польза без техподготовки',
  'novelty 0–15 — новый способ, не «ещё одна версия»',
  'shareability 0–10 — захочет ли отправить знакомому',
  'credibility 0–10 — реальный продукт / prototype / primary research',
  '',
  'GREY NOISE → очень низкий score (0–20), если нет человеческой двери:',
  'мышь, клавиатура, колонка/сабвуфер/наушники, обычный smartphone launch, монитор/TV,',
  'зарядка/powerbank, gaming accessory, color/spec refresh, megapixels/Hz/+N%,',
  'factory/warehouse robot arm без прямой пользы обычному человеку.',
  '',
  'ИСКЛЮЧЕНИЕ: серый класс ОК, если есть дверь (assistive independence, clinic→home,',
  'pro-инструмент стал доступен дома, один человек вместо команды).',
  '',
  'SP-A-071B: публикация НЕ обязательна каждый час. Если нет реакции «неужели? / пригодится / перешлю» —',
  'ставь низкий score. SKIP сильного кандидата лучше, чем серая бытовуха ради регулярности.',
  '',
  'status: AVAILABLE | ANNOUNCED | PROTOTYPE | RESEARCH | CONCEPT | CROWDFUNDING.',
  'Не маскируй concept/crowdfunding под AVAILABLE.',
].join('\n');
