import Link from 'next/link';
import type { Article } from '@/data/articles';

/** Level-1 rubrics — display labels + filter query values. */
export const MAIN_RUBRICS = [
  { label: 'Новинки', category: 'Новинки' },
  { label: 'Гаджеты', category: 'Гаджеты' },
  { label: 'Смартфоны', category: 'Смартфоны' },
  { label: 'Дом', category: 'Дом' },
  { label: 'Игры', category: 'Игры' },
  { label: 'AI', category: 'AI' },
  { label: 'Здоровье', category: 'Здоровье' },
] as const;

const ARCHIVE_HREF = '/all';

/** Soft grouping hints (display layer only). */
const RUBRIC_HINTS: Record<string, string[]> = {
  Новинки: ['новинк'],
  Гаджеты: [
    'гаджет',
    'wearable',
    'наушник',
    'аксессуар',
    'portable',
    'мышь',
    'пульт',
    'смартчас',
    'очки',
    'гарнитур',
    'камера',
    'гравер',
    'экран',
    'аудио',
  ],
  Смартфоны: ['смартфон', 'phone', 'android', 'foldable', 'iphone'],
  Дом: ['умный дом', 'умныйдом', 'kitchen', 'household', 'дом'],
  Игры: ['игр', 'game', 'vr'],
  AI: ['ai', 'ии', 'интеллект', 'assistant', 'translator', 'обучается'],
  Здоровье: ['здоров', 'фитнес', 'health', 'fitness'],
};

/** Tags that are too generic / duplicate a main rubric — keep out of primary chips. */
const NOISE_TAGS = new Set([
  'полезно',
  'новинка',
  'новинки',
  'гаджет',
  'гаджеты',
  'общее',
]);

const MAX_VISIBLE_SUBTOPICS = 6;

function normalizeTag(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  // Keep short acronyms (AI, VR, HN) readable
  if (t.length <= 3 && /^[A-Za-zА-Яа-яЁё0-9]+$/.test(t)) {
    return t.toUpperCase();
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function tagMatchesHints(tag: string, hints: string[]): boolean {
  const n = tag.toLowerCase();
  return hints.some((h) => n.includes(h) || h.includes(n));
}

function countTags(list: Article[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) {
    const parts: string[] = [];
    if (item.category) parts.push(...item.category.split('/'));
    // Article tags (e.g. «Китай») must surface in the thematic navigator.
    if (Array.isArray(item.tags)) parts.push(...item.tags);
    for (const part of parts) {
      const tag = normalizeTag(part);
      if (!tag || tag.length < 2) continue;
      if (NOISE_TAGS.has(tag.toLowerCase())) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
}

function sortByFrequency(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([tag]) => tag);
}

export function buildSubtopicLists(
  list: Article[],
  activeCategory?: string,
): { visible: string[]; rare: string[] } {
  const counts = countTags(list);
  const active = activeCategory?.trim();
  const activeKey = active
    ? MAIN_RUBRICS.find((r) => r.category.toLowerCase() === active.toLowerCase())?.category
    : undefined;

  let ranked: string[];
  if (activeKey && RUBRIC_HINTS[activeKey]) {
    ranked = sortByFrequency(counts).filter((tag) =>
      tagMatchesHints(tag, RUBRIC_HINTS[activeKey]),
    );
    // If rubric has few matching tags, fall back to global useful tags
    if (ranked.length < 3) {
      ranked = sortByFrequency(counts);
    }
  } else {
    ranked = sortByFrequency(counts);
  }

  // Prefer tags that appear more than once; single-shot brands sink to rare
  const frequent = ranked.filter((t) => (counts.get(t) || 0) >= 2);
  const singles = ranked.filter((t) => (counts.get(t) || 0) < 2);
  const ordered = [...frequent, ...singles];

  return {
    visible: ordered.slice(0, MAX_VISIBLE_SUBTOPICS),
    rare: ordered.slice(MAX_VISIBLE_SUBTOPICS),
  };
}

function chipClass(active: boolean, variant: 'main' | 'sub'): string {
  const base =
    variant === 'main'
      ? 'px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold tracking-wide transition-colors'
      : 'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors';

  if (active) {
    return `${base} bg-[var(--accent)] text-white`;
  }
  return `${base} text-[var(--text)] border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)] hover:text-[var(--accent)]`;
}

export function ThematicNavigator({
  activeCategory,
  articles,
}: {
  activeCategory?: string;
  articles: Article[];
}) {
  const { visible, rare } = buildSubtopicLists(articles, activeCategory);
  const activeNorm = activeCategory?.toLowerCase().trim();

  const isMainActive = (category: string) =>
    activeNorm === category.toLowerCase();

  const isSubActive = (tag: string) => activeNorm === tag.toLowerCase();

  return (
    <section className="border-b border-[var(--border)] pb-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--muted)]">
          Тематический навигатор
        </span>
        {activeCategory && (
          <Link
            href="/"
            className="text-xs text-[var(--accent)] hover:underline font-medium shrink-0"
          >
            Сбросить фильтр
          </Link>
        )}
      </div>

      {/* Level 1 — main rubrics */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <Link
          href="/"
          className={chipClass(!activeCategory, 'main')}
          aria-current={!activeCategory ? 'page' : undefined}
        >
          Все
        </Link>
        {MAIN_RUBRICS.map((rubric) => {
          const active = isMainActive(rubric.category);
          return (
            <Link
              key={rubric.category}
              href={`/?category=${encodeURIComponent(rubric.category)}`}
              className={chipClass(active, 'main')}
              aria-current={active ? 'page' : undefined}
            >
              {rubric.label}
            </Link>
          );
        })}
        <Link href={ARCHIVE_HREF} className={chipClass(false, 'main')}>
          Архив
        </Link>
      </div>

      {/* Level 2 — subtopics (compact); rare tags behind «Ещё» */}
      {(visible.length > 0 || rare.length > 0) && (
        <div className="space-y-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {visible.map((topic) => {
              const active = isSubActive(topic);
              return (
                <Link
                  key={topic}
                  href={`/?category=${encodeURIComponent(topic)}`}
                  className={chipClass(active, 'sub')}
                  aria-current={active ? 'page' : undefined}
                >
                  {topic}
                </Link>
              );
            })}
            {rare.length > 0 && (
              <details className="group relative">
                <summary className="list-none cursor-pointer select-none px-2 py-0.5 rounded-md text-[11px] font-medium text-[var(--muted)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors [&::-webkit-details-marker]:hidden">
                  Ещё · Все темы
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full">
                  {rare.map((topic) => {
                    const active = isSubActive(topic);
                    return (
                      <Link
                        key={topic}
                        href={`/?category=${encodeURIComponent(topic)}`}
                        className={chipClass(active, 'sub')}
                        aria-current={active ? 'page' : undefined}
                      >
                        {topic}
                      </Link>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
