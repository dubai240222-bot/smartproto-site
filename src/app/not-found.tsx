import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto flex min-h-[60vh] max-w-[1440px] flex-col items-start justify-center px-4 py-16 sm:px-5">
        <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Страница не найдена
        </h1>
        <p className="mt-3 max-w-xl text-[14px] font-normal leading-relaxed text-[var(--muted)]">
          Материала нет или ссылка введена с ошибкой.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-[13px]">
          <Link
            href="/"
            className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            На главную
          </Link>
          <Link
            href="/all"
            className="px-4 py-2 font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            Лента новостей →
          </Link>
        </div>
      </div>
    </main>
  );
}
