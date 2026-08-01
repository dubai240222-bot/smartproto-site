import Link from 'next/link';
import articles, { type Article } from '@/data/articles';
import { MediaPlaceholder } from '@/components/media-placeholder';
import { formatPublishedAt, sortArticlesByPublishedDate } from '@/lib/article-utils';
import {
  CategoryTags,
  VergeNumberedItem,
  ArsTechnicaCard,
  QuickUpdateItem,
  StratecheryDeepDive,
} from '@/components/article-card';

function filterArticlesByCategory(categoryName: string, list: Article[]): Article[] {
  const norm = categoryName.toLowerCase().trim();
  if (!norm) return list;

  return list.filter((a) => {
    const cat = a.category.toLowerCase();
    const title = a.title.toLowerCase();
    const summary = a.summary.toLowerCase();
    const content = a.content.toLowerCase();

    if (norm === 'гаджеты') {
      return cat.includes('гаджет') || title.includes('проектор') || title.includes('гаджет');
    }
    if (norm === 'робототехника') {
      return cat.includes('робот') || title.includes('робот');
    }
    if (norm === 'искусственный интеллект' || norm === 'ии') {
      return (
        cat.includes('искусственный интеллект') ||
        cat.includes('ии') ||
        title.includes('интеллект') ||
        title.includes('обучается')
      );
    }
    if (norm === 'open source') {
      return (
        cat.includes('open source') ||
        title.includes('open source') ||
        content.includes('открытым исходным кодом')
      );
    }
    if (norm === 'аналитика') {
      return cat.includes('аналитика') || cat.includes('hn') || title.includes('hacker news');
    }
    if (norm === 'инфраструктура') {
      return cat.includes('инфраструктура') || cat.includes('deploy') || title.includes('продакшен');
    }
    if (norm === 'редакция') {
      return cat.includes('редакция') || cat.includes('live feed') || title.includes('живая лента');
    }
    if (norm === 'разборы') {
      return cat.includes('разборы') || cat.includes('формат') || title.includes('разбор');
    }

    return cat.includes(norm) || title.includes(norm) || summary.includes(norm);
  });
}

// Extract all unique semantic tag topics for navigation
function getNavigationTopics(list: Article[]): string[] {
  const defaultTopics = [
    'Гаджеты',
    'Робототехника',
    'Искусственный интеллект',
    'Open Source',
    'Аналитика',
    'Инфраструктура',
    'Редакция',
    'Разборы',
  ];

  const extracted = new Set<string>();
  for (const item of list) {
    if (item.category) {
      const parts = item.category.split('/').map((s) => s.trim());
      for (const p of parts) {
        if (p && p.length > 2) {
          // Normalize title case
          const capitalized = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
          extracted.add(capitalized);
        }
      }
    }
  }

  for (const t of defaultTopics) {
    extracted.add(t);
  }

  return Array.from(extracted);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category?.trim();

  const sortedArticles = sortArticlesByPublishedDate(articles);
  const navigationTopics = getNavigationTopics(sortedArticles);

  // Articles for specific editorial slots
  const mainStory = sortedArticles[0];
  const editorialPicks = sortedArticles.slice(0, 5); // 1 to 5 numbered picks
  const visualFeatureStories = sortedArticles.slice(1, 4); // Ars Technica 2-3 visual blocks
  
  // Stratechery Deep Dive candidate (prefer deploy playbook or longform analysis)
  const deepDiveStory =
    sortedArticles.find(
      (a) => a.slug.includes('deploy') || a.category.toLowerCase().includes('разбор'),
    ) || sortedArticles[2] || sortedArticles[0];

  // Quick updates stream
  const quickUpdates = sortedArticles;

  // Filtered view if a category is selected
  const filteredArticles = activeCategory
    ? filterArticlesByCategory(activeCategory, sortedArticles)
    : [];

  const thematicNavigator = (
    <section className="border-b border-[var(--border)] pb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--muted)]">
          Тематический навигатор
        </span>
        {activeCategory && (
          <Link
            href="/"
            className="text-xs text-[var(--accent)] hover:underline font-medium"
          >
            Сбросить фильтр
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1">
        <Link
          href="/"
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            !activeCategory
              ? 'bg-[var(--text)] text-[var(--bg)] shadow-sm'
              : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)]'
          }`}
        >
          Все материалы
        </Link>
        {navigationTopics.map((topic) => {
          const isActive =
            activeCategory?.toLowerCase() === topic.toLowerCase();
          return (
            <Link
              key={topic}
              href={`/?category=${encodeURIComponent(topic)}`}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
            >
              {topic}
            </Link>
          );
        })}
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10 sm:space-y-14">
        {/* ACTIVE CATEGORY FILTER VIEW */}
        {activeCategory ? (
          <>
            {thematicNavigator}
            <section className="space-y-6">
              <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
                <div>
                  <h1 className="font-serif text-xl font-bold text-[var(--text)]">
                    Рубрика: <span className="text-[var(--accent)]">{activeCategory}</span>
                  </h1>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Найдено материалов: {filteredArticles.length}
                  </p>
                </div>
                <Link
                  href="/"
                  className="text-xs font-semibold px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface)] transition-colors"
                >
                  Показать всю ленту
                </Link>
              </div>

              {filteredArticles.length > 0 ? (
                <div className="space-y-4">
                  {filteredArticles.map((article) => (
                    <QuickUpdateItem key={article.slug} article={article} />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center border border-[var(--border)] rounded-lg bg-[var(--surface)]">
                  <p className="text-sm text-[var(--muted)]">
                    В выбранной рубрике пока нет материалов.
                  </p>
                  <Link
                    href="/"
                    className="mt-3 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    Вернуться на главную
                  </Link>
                </div>
              )}
            </section>
          </>
        ) : (
          /* DIVERSE EDITORIAL HOMEPAGE (No uniform card wall!) */
          <>
            {/* 0. NEWS FEED — near the top so «Новости» is never buried */}
            <section id="news" className="scroll-mt-24 space-y-4 pb-8 border-b border-[var(--border)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[var(--text)]">
                    Последние новости
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Свежие материалы о гаджетах и технологиях
                  </p>
                </div>
                <Link
                  href="/all"
                  className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Все новости →
                </Link>
              </div>
              <div className="space-y-1 divide-y divide-[var(--border)]">
                {sortedArticles.slice(0, 6).map((article) => (
                  <QuickUpdateItem key={`news-${article.slug}`} article={article} />
                ))}
              </div>
            </section>

            {/* Thematic navigator — directly above «Выбор редакции» */}
            {thematicNavigator}

            {/* 1. HERO STORY + "ВЫБОР РЕДАКЦИИ" (The Verge Style Split Grid) */}
            <section className="grid gap-8 lg:grid-cols-12 lg:items-start pb-10 border-b border-[var(--border)]">
              {/* LEFT (8 Cols): Hero Main Story */}
              {mainStory && (
                <div className="lg:col-span-8 lg:pr-8 lg:border-r border-[var(--border)] space-y-4">
                  <div className="group space-y-4">
                    <MediaPlaceholder
                      category={mainStory.category}
                      title={mainStory.title}
                      imageUrl={mainStory.imageUrl}
                      aspectRatio="aspect-[16/9]"
                      className="rounded-lg shadow-sm"
                    />

                    <CategoryTags category={mainStory.category} className="pt-1" />

                    <h1 className="font-serif text-2xl sm:text-4xl font-black leading-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                      <Link href={`/articles/${mainStory.slug}`}>{mainStory.title}</Link>
                    </h1>

                    <p className="text-sm sm:text-base leading-relaxed text-[var(--muted)]">
                      {mainStory.summary}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-[var(--muted)] pt-1 border-t border-[var(--border)]">
                      <span>{formatPublishedAt(mainStory.publishedAt)}</span>
                      <span>•</span>
                      <span>Время чтения: {mainStory.readTime}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* RIGHT (4 Cols): "Выбор редакции" Numbered List 1-5 (The Verge Style) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="flex items-center justify-between border-b-2 border-[var(--accent)] pb-2">
                  <h2 className="font-serif text-sm font-bold uppercase tracking-wider text-[var(--text)]">
                    Выбор редакции
                  </h2>
                  <span className="text-[10px] font-mono text-[var(--accent)] font-bold">
                    TOP 1–5
                  </span>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {editorialPicks.map((article, idx) => (
                    <VergeNumberedItem
                      key={article.slug}
                      index={idx + 1}
                      article={article}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* 2. "ВИЗУАЛЬНЫЕ ИСТОРИИ" (Ars Technica Style Feature Blocks) */}
            <section className="space-y-6 pb-10 border-b border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-1 bg-[var(--accent)] rounded-full"></div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[var(--text)]">
                    Визуальные истории
                  </h2>
                </div>
                <span className="text-xs font-mono text-[var(--muted)]">Ars Technica Style</span>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {visualFeatureStories.map((article) => (
                  <ArsTechnicaCard key={article.slug} article={article} />
                ))}
              </div>
            </section>

            {/* 3. "ГЛУБОКИЙ РАЗБОР" (Stratechery Style Calm Reading Column) */}
            {deepDiveStory && (
              <section className="pb-10 border-b border-[var(--border)]">
                <StratecheryDeepDive article={deepDiveStory} />
              </section>
            )}

            {/* 4. Full chronological archive teaser */}
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[var(--text)]">
                  Вся лента
                </h2>
                <Link href="/all" className="text-xs font-semibold text-[var(--accent)] hover:underline">
                  Открыть архив новостей →
                </Link>
              </div>

              <div className="space-y-1 divide-y divide-[var(--border)]">
                {quickUpdates.map((article) => (
                  <QuickUpdateItem key={article.slug} article={article} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
