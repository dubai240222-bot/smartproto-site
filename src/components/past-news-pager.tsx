import Link from 'next/link';

/** Numbered pager for older homepage feed pages (?page=N). */
export function PastNewsPager({
  currentPage,
  totalPages,
  totalPast,
}: {
  currentPage: number;
  totalPages: number;
  totalPast: number;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  // Keep pager compact: show first, last, current ±2
  const visible = pages.filter((p) => {
    if (p === 1 || p === totalPages) return true;
    return Math.abs(p - currentPage) <= 2;
  });

  const items: Array<number | '…'> = [];
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    if (i > 0 && p - visible[i - 1] > 1) items.push('…');
    items.push(p);
  }

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3"
      aria-label="Страницы прошлых новостей"
    >
      <p className="text-[12px] font-normal text-[var(--muted)]">
        Прошлые новости · {totalPast}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {currentPage > 1 ? (
          <Link
            href={currentPage === 2 ? '/#past-news' : `/?page=${currentPage - 1}#past-news`}
            className="inline-flex h-8 min-w-8 items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] font-normal text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            ←
          </Link>
        ) : null}
        {items.map((item, idx) =>
          item === '…' ? (
            <span key={`e-${idx}`} className="px-1 text-[12px] text-[var(--muted)]">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={item === 1 ? '/#past-news' : `/?page=${item}#past-news`}
              className={`inline-flex h-8 min-w-8 items-center justify-center border px-2 text-[12px] font-normal tabular-nums transition ${
                item === currentPage
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
              aria-current={item === currentPage ? 'page' : undefined}
            >
              {item}
            </Link>
          ),
        )}
        {currentPage < totalPages ? (
          <Link
            href={`/?page=${currentPage + 1}#past-news`}
            className="inline-flex h-8 min-w-8 items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] font-normal text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
