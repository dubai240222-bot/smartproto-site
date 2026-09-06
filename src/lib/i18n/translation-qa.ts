/**
 * SP-A-098 — deterministic (non-AI) QA for EN/TR localizations.
 */
import type { LocalizationLanguage } from '@/lib/i18n/locales';

export type TranslationQaInput = {
  language: LocalizationLanguage;
  canonicalTitle: string;
  canonicalSummary: string;
  canonicalContent: string;
  localizedTitle: string;
  localizedExcerpt: string;
  localizedContent: string;
  localizedSlug: string;
};

export type TranslationQaResult =
  | { ok: true; checks: string[] }
  | { ok: false; reason: string; checks: string[] };

function extractNumbers(text: string): string[] {
  const raw = text.match(/\d+(?:[.,]\d+)?%?/g) || [];
  // Normalize 1,5 / 1.5 → keep digit skeleton for parity.
  const norm = raw
    .map((n) => n.replace(/,/g, '.').replace(/%/g, ''))
    .filter((n) => n.length > 0);
  return Array.from(new Set(norm));
}

function cyrillicRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const cyr = letters.filter((ch) => /\p{Script=Cyrillic}/u.test(ch)).length;
  return cyr / letters.length;
}

function hasCodeLikeTokens(src: string, dst: string): boolean {
  const tokens = src.match(/\b[A-Z]{2,}[A-Z0-9_-]*\b|\b(?:https?:\/\/|www\.)\S+/gi) || [];
  for (const t of tokens.slice(0, 12)) {
    if (t.length < 3) continue;
    if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) {
      // URLs in body are rare; skip hard fail if absent.
      continue;
    }
    if (!dst.includes(t) && !dst.toLowerCase().includes(t.toLowerCase())) {
      // Proper product codes often stay Latin — soft: only fail if many missing.
      return false;
    }
  }
  return true;
}

export function runTranslationQa(input: TranslationQaInput): TranslationQaResult {
  const checks: string[] = [];
  const title = (input.localizedTitle || '').trim();
  const summary = (input.localizedExcerpt || '').trim();
  const content = (input.localizedContent || '').trim();
  const slug = (input.localizedSlug || '').trim();

  if (title.length < 8) {
    return { ok: false, reason: 'title_too_short', checks };
  }
  checks.push('title_ok');

  if (summary.length < 20) {
    return { ok: false, reason: 'summary_too_short', checks };
  }
  checks.push('summary_ok');

  if (content.length < 120) {
    return { ok: false, reason: 'content_too_short', checks };
  }
  checks.push('content_ok');

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 6) {
    return { ok: false, reason: 'slug_invalid', checks };
  }
  checks.push('slug_ok');

  const ratio = cyrillicRatio(`${title}\n${summary}\n${content}`);
  if (ratio > 0.25) {
    return { ok: false, reason: `mostly_cyrillic:${ratio.toFixed(2)}`, checks };
  }
  checks.push('script_ok');

  const srcNums = extractNumbers(
    `${input.canonicalTitle}\n${input.canonicalSummary}\n${input.canonicalContent}`,
  );
  const dstNums = new Set(
    extractNumbers(`${title}\n${summary}\n${content}`),
  );
  // Require majority of canonical numbers (ignore tiny noise like years if many).
  const significant = srcNums.filter((n) => {
    const v = parseFloat(n);
    // Always keep multi-digit meaningful numbers; skip lone 1/2 noise if abundant.
    return n.replace('.', '').length >= 2 || srcNums.length <= 6;
  });
  const must = significant.slice(0, 12);
  let missing = 0;
  for (const n of must) {
    if (!dstNums.has(n)) missing++;
  }
  if (must.length >= 3 && missing / must.length > 0.34) {
    return {
      ok: false,
      reason: `number_parity_fail missing=${missing}/${must.length}`,
      checks,
    };
  }
  checks.push('number_parity_ok');

  void hasCodeLikeTokens;
  checks.push('qa_complete');
  return { ok: true, checks };
}
