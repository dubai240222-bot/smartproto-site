import Link from 'next/link';
import { getAllArticles, type Article } from '@/data/articles';
import { ThematicNavigator } from '@/components/thematic-navigator';
import { PastNewsPager } from '@/components/past-news-pager';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';
import { orderArticlesForHomepage } from '@/lib/homepage-editorial-mix';
import {
  LeadStory,
  LeadRailItem,
  GridStoryCard,
  QuickNewsBlock,
  QuickUpdateItem,
} from '@/components/article-card';

const FRONT_SLOT_COUNT = 12; // lead + rail3 + grid4 + quick4
const PAST_PAGE_SIZE = 10;

function textBlob(a: Article): string {
  const tags = Array.isArray(a.tags) ? a.tags.join(' ') : '';
  return `${a.category} ${tags} ${a.title} ${a.summary} ${a.content}`.toLowerCase();
}

function filterArticlesByCategory(categoryName: string, list: Article[]): Article[] {
  const norm = categoryName.toLowerCase().trim();
  if (!norm) return list;

  return list.filter((a) => {
    const cat = a.category.toLowerCase();
    const title = a.title.toLowerCase();
    const summary = a.summary.toLowerCase();
    const content = a.content.toLowerCase();
    const tags = Array.isArray(a.tags) ? a.tags.join(' ').toLowerCase() : '';
    const blob = textBlob(a);

    // SP-A-050: Китай/Qwen are not public filter categories anymore.
    if (norm === 'китай' || norm === 'china' || norm === 'qwen') {
      return cat.includes('гаджет');
    }
    // Serial / shipping products (not lab prototypes / research alone)
    if (norm === 'производство' || norm === 'серия' || norm === 'серийное') {
      return (
        cat.includes('гаджет') ||
        cat.includes('смартфон') ||
        cat.includes('новинк') ||
        blob.includes('представил') ||
        blob.includes('анонсир') ||
        blob.includes('выпустил') ||
        blob.includes('в продаже') ||
        blob.includes('производител')
      );
    }
    if (norm === 'новинки') {
      return cat.includes('новинк') || title.includes('новинк');
    }
    if (norm === 'гаджеты') {
      return cat.includes('гаджет') || title.includes('проектор') || title.includes('гаджет');
    }
    if (norm === 'приложения' || norm === 'apps' || norm === 'приложен') {
      return (
        cat.includes('приложен') ||
        tags.includes('приложен') ||
        blob.includes('mobile app') ||
        blob.includes('app store') ||
        blob.includes('google play') ||
        /\bapps?\b/.test(tags) ||
        title.includes('приложен')
      );
    }
    if (norm === 'смартфоны') {
      return (
        cat.includes('смартфон') ||
        blob.includes('smartphone') ||
        blob.includes('android') ||
        blob.includes('foldable') ||
        title.includes('iphone')
      );
    }
    if (norm === 'дом') {
      return (
        cat.includes('умный дом') ||
        cat.includes('умныйдом') ||
        blob.includes('smart home') ||
        blob.includes('kitchen') ||
        blob.includes('household') ||
        (cat.includes('дом') && !cat.includes('смартфон'))
      );
    }
    if (norm === 'игры') {
      return cat.includes('игр') || blob.includes('game') || cat.includes('vr');
    }
    if (norm === 'ai' || norm === 'искусственный интеллект' || norm === 'ии') {
      return (
        cat.includes('искусственный интеллект') ||
        cat.includes('ии') ||
        /\bai\b/.test(cat) ||
        cat.includes('ai') ||
        title.includes('интеллект') ||
        title.includes('обучается') ||
        blob.includes('assistant') ||
        blob.includes('translator')
      );
    }
    if (norm === 'здоровье') {
      return (
        cat.includes('здоров') ||
        cat.includes('фитнес') ||
        blob.includes('health') ||
        blob.includes('fitness')
      );
    }
    if (norm === 'робототехника' || norm === 'роботы') {
      return cat.includes('робот') || title.includes('робот');
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
    if (norm === 'наука') {
      return (
        cat.includes('наук') ||
        cat.includes('research') ||
        blob.includes('research') ||
        blob.includes('lab') ||
        title.includes('лаборатор')
      );
    }

    return (
      cat.includes(norm) ||
      tags.includes(norm) ||
      title.includes(norm) ||
      summary.includes(norm)
    );
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category?.trim();
  const requestedPage = Math.max(1, parseInt(params.page || '1', 10) || 1);

  const sortedArticles = sortArticlesByPublishedDate(getAllArticles());
  // Editorial mix for homepage slots: AI/apps first, avoid commodity streaks
  const feedArticles = orderArticlesForHomepage(sortedArticles);

  // SP-A-066 editorial levels (mixed order; not raw chronology)
  const leadStory = feedArticles[0];
  const leadRail = feedArticles.slice(1, 4);
  const gridStories = feedArticles.slice(4, 8);
  const quickNews = feedArticles.slice(8, 12);

  const pastPool = feedArticles.slice(FRONT_SLOT_COUNT);
  const totalPast = pastPool.length;
  const totalPages = Math.max(1, Math.ceil(totalPast / PAST_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pastStart = (currentPage - 1) * PAST_PAGE_SIZE;
  const pastPageArticles = pastPool.slice(pastStart, pastStart + PAST_PAGE_SIZE);

  const filteredArticles = activeCategory
    ? filterArticlesByCategory(activeCategory, sortedArticles)
    : [];

  const thematicNavigator = (
    <ThematicNavigator activeCategory={activeCategory} articles={sortedArticles} />
  );

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors">
      <div className="mx-auto max-w-[1280px] space-y-4 px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4 lg:px-6">
        {activeCategory ? (
          <>
            {thematicNavigator}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-[var(--text)] sm:text-xl">
                    Рубрика: <span className="text-[var(--accent)]">{activeCategory}</span>
                  </h1>
                  <p className="mt-0.5 text-xs font-normal text-[var(--muted)]">
                    Найдено материалов: {filteredArticles.length}
                  </p>
                </div>
                <Link
                  href="/"
                  className="shrink-0 border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface)]"
                >
                  На главную
                </Link>
              </div>

              {filteredArticles.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {filteredArticles.map((article) => (
                    <QuickUpdateItem key={article.slug} article={article} />
                  ))}
                </div>
              ) : (
                <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                  <p className="text-sm font-normal text-[var(--muted)]">
                    В выбранной рубрике пока нет материалов.
                  </p>
                  <Link
                    href="/"
                    className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Вернуться на главную
                  </Link>
                </div>
              )}
            </section>
          </>
        ) : (
          /* SP-A-066 — HOMEPAGE EDITORIAL GRID */
          <>
            {/* 1. TOP / LEAD AREA */}
            <section className="grid gap-3 border-b border-[var(--border)] pb-4 lg:grid-cols-12 lg:gap-5 lg:pb-5">
              <div className="lg:col-span-8">{leadStory ? <LeadStory article={leadStory} /> : null}</div>
              <aside className="bg-[var(--surface)] px-0 lg:col-span-4 lg:border-l lg:border-[var(--border)] lg:pl-5">
                <div className="mb-1.5 flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    Новинки технологий
                  </h2>
                  <Link
                    href="/all"
                    className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                  >
                    Все →
                  </Link>
                </div>
                <div>
                  {leadRail.map((article) => (
                    <LeadRailItem key={article.slug} article={article} />
                  ))}
                </div>
              </aside>
            </section>

            {/* 2. MAIN GRID */}
            {gridStories.length > 0 ? (
              <section className="border-b border-[var(--border)] pb-4 sm:pb-5">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Лента</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                  {gridStories.map((article) => (
                    <GridStoryCard key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 3. QUICK NEWS ROW */}
            {quickNews.length > 0 ? (
              <section className="border-b border-[var(--border)] pb-4 sm:pb-5">
                <div className="mb-2.5">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Коротко</h2>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2.5">
                  {quickNews.map((article) => (
                    <QuickNewsBlock key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Past news with numbered pages */}
            <section id="past-news">
              <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                  Лента новостей
                </h2>
                <Link
                  href="/all"
                  className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  Архив →
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {pastPageArticles.map((article) => (
                  <LeadRailItem key={`past-${article.slug}`} article={article} />
                ))}
              </div>
              <PastNewsPager
                currentPage={currentPage}
                totalPages={totalPages}
                totalPast={totalPast}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
