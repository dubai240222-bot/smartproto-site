import Link from 'next/link';

/**
 * SP-A-102 — primary tip CTA. Slim strip (not a card), sits above the homepage grid.
 */
export function TipCtaBanner({
  locale = 'ru',
}: {
  locale?: 'ru' | 'en' | 'tr';
}) {
  const copy =
    locale === 'en'
      ? {
          kicker: 'Reader desk',
          title: 'Got a sharp tech tip?',
          body: 'Send a link — editorial checks it first. No direct publish.',
          cta: 'Send a cool tip',
          board: 'Top stringers',
        }
      : locale === 'tr'
        ? {
            kicker: 'Okur masası',
            title: 'Keskin bir teknoloji buldunuz mu?',
            body: 'Bağlantı gönderin — önce editörlük kontrol eder. Doğrudan yayın yok.',
            cta: 'Haber gönder',
            board: 'En iyi muhabirler',
          }
        : {
            kicker: 'Редакция читателей',
            title: 'Нашли крутую новость?',
            body: 'Пришлите ссылку — сначала проверит редакция. Прямой publish закрыт.',
            cta: 'Прислать крутую новость',
            board: 'Рейтинг внештатных',
          };

  return (
    <section
      aria-label={copy.cta}
      className="tip-cta relative overflow-hidden border-b border-[var(--border)] bg-[linear-gradient(120deg,rgba(23,105,170,0.10),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(23,105,170,0.12),transparent_50%)]"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3.5 lg:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            {copy.kicker}
          </p>
          <p className="mt-0.5 font-serif text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">
            {copy.title}
          </p>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-snug text-[var(--muted)]">{copy.body}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/scout"
            className="inline-flex items-center justify-center bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {copy.cta}
          </Link>
          <Link
            href="/stringers"
            className="inline-flex items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {copy.board}
          </Link>
        </div>
      </div>
    </section>
  );
}
