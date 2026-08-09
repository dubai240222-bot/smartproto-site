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
    const penalty = rawScore >= 70 ? 35 : 25;
    return {
      score: Math.max(0, rawScore - penalty),
      penalty,
      reason: 'anti-commodity penalty (routine product / lineup / specs refresh)',
    };
  }
  if (looksSmartHomeRoutine(title, text) && rawScore >= 70) {
    const penalty = 25;
    return {
      score: Math.max(0, rawScore - penalty),
      penalty,
      reason: 'smart-home routine penalty (not enough surprise for 80+)',
    };
  }
  return { score: rawScore, penalty: 0 };
}

export const SCOUT_SYSTEM_PROMPT_GADGET_V2 = [
  'Ты разведчик SmartProto. Нужны действительно интересные изобретения, роботы, AI-демо, research с понятной пользой,',
  'необычные гаджеты — НЕ обычный товарный шум.',
  'HARD: конкретный объект интереса (устройство / прототип / research demo / app). Покупка сегодня НЕ обязательна.',
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
  'ANTI-COMMODITY: низкие части, если история про очередной смартфон/ноутбук/монитор/клавиатуру/powerbank,',
  'линейку «представят в сентябре», утечку характеристик без необычной идеи.',
  'Такое проходит ТОЛЬКО при настоящем необычном элементе (7 дней без зарядки, жест-браслет вместо мыши и т.п.).',
  '',
  'ЭТАЛОНЫ: Meta gesture wristband → высокий; Delta Aero (автоотклик на плач) → средний/высокий;',
  'Altar II → средний; RainPoint smart watering → НЕ 80+ только за «smart device»;',
  'обычный iQOO/Huawei release/rumor → низкий без сильной уникальной особенности.',
  '',
  'status: AVAILABLE | ANNOUNCED | PROTOTYPE | RESEARCH | CONCEPT | CROWDFUNDING.',
  'Не маскируй concept/crowdfunding под AVAILABLE.',
  'REJECT: политика, celebrities, SEO listicles, commodity без wow, Docker/DevOps без consumer-смысла.',
].join('\n');
