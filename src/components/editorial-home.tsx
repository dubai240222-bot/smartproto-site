import Link from 'next/link';
import { ThematicNavigator } from '@/components/thematic-navigator';
import { PastNewsPager } from '@/components/past-news-pager';
import {
  LeadStory,
  LeadRailItem,
  GridStoryCard,
  QuickNewsBlock,
  QuickUpdateItem,
} from '@/components/article-card';
import {
  filterHomeStoriesByCategory,
  listHomeStories,
} from '@/lib/editorial-home-data';
import { LOCALE_UI, localeHomePath, type AppLocale } from '@/lib/i18n/locales';
import { getAllArticles } from '@/data/articles';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';

const FRONT_SLOT_COUNT = 14;
const PAST_PAGE_SIZE = 10;

export function EditorialHome({
  locale,
  searchParams,
}: {
  locale: AppLocale;
  searchParams: { category?: string; page?: string };
}) {
  const ui = LOCALE_UI[locale];
  const activeCategory = searchParams.category?.trim();
  const requestedPage = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const basePath = localeHomePath(locale);

  const allStories = listHomeStories(locale);
  const leadStory = allStories[0];
  const restOrdered = allStories.slice(1);
  const leadRail = restOrdered.slice(0, 5);
  const gridStories = restOrdered.slice(5, 9);
  const quickNews = restOrdered.slice(9, 13);
  const pastPool = restOrdered.slice(FRONT_SLOT_COUNT - 1);
  const totalPast = pastPool.length;
  const totalPages = Math.max(1, Math.ceil(totalPast / PAST_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pastStart = (currentPage - 1) * PAST_PAGE_SIZE;
  const pastPageStories = pastPool.slice(pastStart, pastStart + PAST_PAGE_SIZE);

  const filteredStories = activeCategory
    ? filterHomeStoriesByCategory(activeCategory, allStories)
    : [];

  const ruArticlesForNav =
    locale === 'ru' ? sortArticlesByPublishedDate(getAllArticles()) : undefined;

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors">
      <div className="mx-auto max-w-[1440px] space-y-3 px-2 py-2.5 sm:space-y-4 sm:px-4 sm:py-3 lg:px-5">
        {activeCategory ? (
          <>
            {locale === 'ru' && ruArticlesForNav ? (
              <ThematicNavigator activeCategory={activeCategory} articles={ruArticlesForNav} />
            ) : null}
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div>
                  <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    {ui.homeCategoryLabel}
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                    {activeCategory}
                  </h1>
                  <p className="mt-1 text-[13px] font-normal text-[var(--muted)]">
                    {filteredStories.length} {ui.homeCategoryCount}
                  </p>
                </div>
                <Link
                  href={basePath}
                  className="text-[12px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  {ui.backHome}
                </Link>
              </div>

              {filteredStories.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {filteredStories.map((story) => (
                    <QuickUpdateItem key={story.href} story={story} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                  <p className="text-sm font-normal text-[var(--muted)]">{ui.emptyCategory}</p>
                  <Link
                    href={basePath}
                    className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    {ui.backHome}
                  </Link>
                </div>
              )}
            </section>
          </>
        ) : allStories.length === 0 ? (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
            <p className="text-sm text-[var(--muted)]">{ui.emptyHome}</p>
          </div>
        ) : (
          <>
            <section
              className={`grid items-start gap-3 border-b border-[var(--border)] pb-3 lg:gap-4 lg:pb-4 ${
                leadRail.length > 0 ? 'lg:grid-cols-12' : ''
              }`}
            >
              <div className={leadRail.length > 0 ? 'lg:col-span-7 xl:col-span-8' : ''}>
                {leadStory ? <LeadStory story={leadStory} locale={locale} /> : null}
              </div>
              {leadRail.length > 0 ? (
              <aside className="flex flex-col lg:col-span-5 xl:col-span-4 lg:border-l lg:border-[var(--border)] lg:pl-4">
                <div className="mb-1 flex items-center justify-between border-b border-[var(--border)] pb-1">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    {ui.homeRailTitle}
                  </h2>
                  {locale === 'ru' ? (
                    <Link
                      href="/all"
                      className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                    >
                      {ui.homeAllLink}
                    </Link>
                  ) : null}
                </div>
                <div className="flex-1">
                  {leadRail.map((story) => (
                    <LeadRailItem
                      key={story.href}
                      story={story}
                      locale={locale}
                    />
                  ))}
                </div>
              </aside>
              ) : null}
            </section>

            {gridStories.length > 0 ? (
              <section className="border-b border-[var(--border)] pb-4 sm:pb-5">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    {ui.homeGridTitle}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                  {gridStories.map((story) => (
                    <GridStoryCard key={story.href} story={story} locale={locale} />
                  ))}
                </div>
              </section>
            ) : null}

            {quickNews.length > 0 ? (
              <section className="border-b border-[var(--border)] pb-4 sm:pb-5">
                <div className="mb-2.5">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    {ui.homeQuickTitle}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2.5">
                  {quickNews.map((story) => (
                    <QuickNewsBlock key={story.href} story={story} locale={locale} />
                  ))}
                </div>
              </section>
            ) : null}

            {totalPast > 0 ? (
            <section id="past-news">
              <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                  {ui.homePastTitle}
                </h2>
                {locale === 'ru' ? (
                  <Link
                    href="/all"
                    className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                  >
                    {ui.homeArchiveLink}
                  </Link>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {pastPageStories.map((story) => (
                  <LeadRailItem key={`past-${story.href}`} story={story} locale={locale} />
                ))}
              </div>
              <PastNewsPager
                currentPage={currentPage}
                totalPages={totalPages}
                totalPast={totalPast}
                basePath={basePath}
                hash="#past-news"
                label={ui.homePastPagerLabel}
              />
            </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
