import Link from 'next/link';
import { getAllArticles } from '@/data/articles';
import { GridStoryCard, LeadRailItem } from '@/components/article-card';
import { PastNewsPager } from '@/components/past-news-pager';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

export default async function AllArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Math.max(1, parseInt(params.page || '1', 10) || 1);

  const feed = sortArticlesByPublishedDate(getAllArticles());
  const totalPages = Math.max(1, Math.ceil(feed.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = feed.slice(start, start + PAGE_SIZE);

  const leadGrid = pageItems.slice(0, 8);
  const restList = pageItems.slice(8);

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1440px] space-y-4 px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Архив</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
              Лента новостей
            </h1>
            <p className="mt-1 text-[13px] font-normal text-[var(--muted)]">
              {feed.length} материалов · сначала самые новые
            </p>
          </div>
          <Link
            href="/"
            className="text-[12px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            ← На главную
          </Link>
        </header>

        {pageItems.length === 0 ? (
          <p className="border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
            Пока нет опубликованных новостей.
          </p>
        ) : (
          <>
            {leadGrid.length > 0 ? (
              <section>
                <div className="mb-2.5">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">В фокусе</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {leadGrid.map((article) => (
                    <GridStoryCard key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            ) : null}

            {restList.length > 0 ? (
              <section className="border-t border-[var(--border)] pt-4">
                <div className="mb-2">
                  <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Ещё материалы</h2>
                </div>
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {restList.map((article) => (
                    <LeadRailItem key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            ) : null}

            <PastNewsPager
              currentPage={currentPage}
              totalPages={totalPages}
              totalPast={feed.length}
              basePath="/all"
              label="Всего материалов"
            />
          </>
        )}
      </div>
    </main>
  );
}
