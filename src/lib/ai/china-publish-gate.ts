/**
 * Shared editorial gate for China → Qwen dossiers before Editor publish.
 * Used by publish-china-qwen and newsroom tick (max 1 China pub per tick).
 *
 * SP-A-076 selective — editorial watch via human-priority-gate (grey noise / priority).
 * SP-A-082 remains the final AUTO commodity kill switch at upsert.
 */

import {
  passesEditorialPriority,
  shouldHardRejectGreyNoise,
} from '@/lib/ai/human-priority-gate';

export type ChinaDossierGateInput = {
  productName: string;
  whatItDoes: string;
  consumerUse: string;
  whyItIsNew: string;
  recommended: boolean;
  warningFlags: string[];
  unknownFacts: string[];
  prototypeOrSale: string;
  translatedTitle: string;
  originalTitle: string;
};

export function dossierPublishable(
  d: ChinaDossierGateInput,
  sourceBody: string,
): { ok: boolean; reason: string } {
  if (d.unknownFacts.includes('rejected before model')) {
    return { ok: false, reason: 'hard-rejected before Qwen' };
  }
  const flags = d.warningFlags.join(' ').toLowerCase();
  if (/hiring|personnel|trade.?show|not a product|essay|corporate|sales stats|not.?gadget/.test(flags)) {
    return { ok: false, reason: `warningFlags: ${d.warningFlags.join('; ')}` };
  }
  const proto = d.prototypeOrSale.toLowerCase();
  if (/essay|opinion|hiring|conference.?only/.test(proto)) {
    return { ok: false, reason: `prototypeOrSale=${d.prototypeOrSale}` };
  }
  const name = d.productName.trim() || d.originalTitle.trim();
  const blob = `${d.originalTitle} ${d.translatedTitle} ${name} ${d.whatItDoes}`.toLowerCase();
  if (/入职|裁员|总经理|票房|交付.*万/.test(blob)) {
    return { ok: false, reason: 'non-gadget topic residue' };
  }
  if (/chinajoy|游戏展/.test(blob) && !/(手机|手表|耳机|手柄|平板|phone|watch)/i.test(blob + name)) {
    return { ok: false, reason: 'trade-show fluff without device' };
  }

  const title = d.translatedTitle || d.productName || d.originalTitle;
  const text = [d.whatItDoes, d.consumerUse, d.whyItIsNew, sourceBody].join('\n');
  if (shouldHardRejectGreyNoise(title, text)) {
    return {
      ok: false,
      reason: 'editorial watch: grey commodity / no human door — SKIP',
    };
  }
  if (!passesEditorialPriority(title, text)) {
    return {
      ok: false,
      reason: 'editorial watch: not invention/share-worthy — prefer fewer',
    };
  }

  if (d.recommended) return { ok: true, reason: 'qwen recommended + editorial watch' };
  const facts = [d.whatItDoes, d.consumerUse, d.whyItIsNew, sourceBody].join('\n').trim();
  if (name.length >= 4 && facts.length >= 80) {
    return { ok: true, reason: 'editorial gadget bar (source-backed + watch)' };
  }
  return { ok: false, reason: 'weak dossier / thin source' };
}

/**
 * SP-A-050 — Public category/tags for China-pipeline pubs.
 * Internal China/Qwen still runs; reader-facing labels must NOT say КИТАЙ / Qwen.
 */
export const CHINA_CATEGORY = 'Гаджеты';
/** @deprecated SP-A-050 — do not add to public tags */
export const CHINA_TAG = 'новинка';
/** @deprecated SP-A-050 — do not add to public tags */
export const CHINA_SOURCE_TAG = 'гаджет';
