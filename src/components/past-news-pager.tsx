import Link from 'next/link';

/** Numbered pager for feed pages (?page=N). */
export function PastNewsPager({
  currentPage,
  totalPages,
  totalPast,
  basePath = '/',
  hash = '',
  label = 'Прошлые новости',
}: {
  currentPage: number;
  totalPages: number;
  totalPast: number;
  /** e.g. "/" or "/all" */
  basePath?: string;
  hash?: string;
  label?: string;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
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

  const hrefFor = (page: number) => {
    // basePath is "/" or "/all" — build clean URLs
    const path =
      page <= 1
        ? basePath === '/'
          ? '/'
          : basePath
        : `${basePath === '/' ? '' : basePath}?page=${page}`;
    return `${path}${hash}`;
  };

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3"
      aria-label="Страницы новостей"
    >
      <p className="text-[12px] font-normal text-[var(--muted)]">
        {label} · {totalPast}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {currentPage > 1 ? (
          <Link
            href={hrefFor(currentPage - 1)}
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
              href={hrefFor(item)}
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
            href={hrefFor(currentPage + 1)}
            className="inline-flex h-8 min-w-8 items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] font-normal text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
