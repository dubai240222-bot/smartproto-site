/**
 * SP-A-050 — Reader-facing labels. Strip factory/tech marks from public UI.
 * Internal China/Qwen pipeline may still run; public copy must not expose it.
 */

const INTERNAL_TAG_RE =
  /^(китай|china|qwen|gemini|china[-_ ]?(department|desk|qwen)|китайский\s*отдел|agent|factory)$/i;

const CATEGORY_MAP: Record<string, string> = {
  китай: 'Гаджеты',
  china: 'Гаджеты',
  qwen: 'Гаджеты',
  гаджет: 'Гаджеты',
  гаджеты: 'Гаджеты',
  находка: 'Гаджеты',
  полезно: 'Гаджеты',
  технологии: 'Гаджеты',
  приложения: 'Приложения',
  ai: 'AI',
  ии: 'AI',
  здоровье: 'Здоровье',
  дом: 'Дом',
  игры: 'Игры',
  // SP-A-075 — Author Door
  author_article: 'Авторская статья',
  review_opinion: 'Обзор / мнение',
  'авторская статья': 'Авторская статья',
  'обзор / мнение': 'Обзор / мнение',
};

/** Map a raw category fragment to a reader-friendly label. */
export function mapCategoryPart(part: string): string | null {
  const raw = part.trim();
  if (!raw) return null;
  if (INTERNAL_TAG_RE.test(raw)) return null;
  const key = raw.toLowerCase();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  // Drop pure factory marks inside compound categories
  if (/китай|china|qwen|gemini/i.test(raw) && /гаджет/i.test(raw)) return 'Гаджеты';
  if (/китай|china|qwen|gemini/i.test(raw)) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Public category string for cards / filters (never КИТАЙ / Qwen). */
export function toPublicCategory(category: string | undefined | null): string {
  if (!category?.trim()) return 'Гаджеты';
  const parts = category
    .split('/')
    .map((p) => mapCategoryPart(p))
    .filter((p): p is string => Boolean(p));
  const uniq = Array.from(new Set(parts));
  return uniq[0] || 'Гаджеты';
}

/** Strip internal factory tags from a tags array. */
export function toPublicTags(tags: string[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t).replace(/^#/, '').trim())
    .filter((t) => t && !INTERNAL_TAG_RE.test(t) && !/^(qwen|gemini|china department)$/i.test(t));
}

/** True if a navigator/filter chip is an internal tech mark. */
export function isInternalPublicLabel(label: string): boolean {
  const n = label.trim().toLowerCase();
  return (
    INTERNAL_TAG_RE.test(n) ||
    n === 'китай' ||
    n === 'china' ||
    n === 'qwen' ||
    n === 'gemini' ||
    n.includes('китайским отдел') ||
    n.includes('china department')
  );
}
