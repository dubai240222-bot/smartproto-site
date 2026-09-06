import Link from 'next/link';
import { QuickUpdateItem } from '@/components/article-card';
import { PastNewsPager } from '@/components/past-news-pager';
import { listHomeStories } from '@/lib/editorial-home-data';
import { LOCALE_UI, localeHomePath } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function AllArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const ui = LOCALE_UI.ru;
  const stories = listHomeStories('ru');
  const requestedPage = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const totalPages = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageStories = stories.slice(start, start + PAGE_SIZE);

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors">
      <div className="mx-auto max-w-[1440px] space-y-4 px-2 py-2.5 sm:px-4 sm:py-3 lg:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
              SmartProto
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {ui.archivePageTitle}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {stories.length} {ui.archivePageCount}
            </p>
          </div>
          <Link
            href={localeHomePath('ru')}
            className="text-[12px] text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            {ui.backHome}
          </Link>
        </div>

        {pageStories.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {pageStories.map((story) => (
              <QuickUpdateItem key={story.href} story={story} locale="ru" />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-[var(--muted)]">{ui.emptyHome}</p>
        )}

        <PastNewsPager
          currentPage={currentPage}
          totalPages={totalPages}
          totalPast={stories.length}
          basePath="/all"
          label={ui.homePastPagerLabel}
        />
      </div>
    </main>
  );
}
