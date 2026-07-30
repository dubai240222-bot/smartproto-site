import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center px-6 py-16">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.35em] text-cyan-400">
          404
        </p>
        <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
          Страница не найдена
        </h1>
        <p className="mb-8 max-w-xl text-lg leading-8 text-gray-300">
          Похоже, этой статьи больше нет или ссылка была введена с ошибкой.
        </p>
        <Link
          href="/"
          className="rounded-lg border border-gray-800 bg-gray-900 px-5 py-3 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
        >
          Вернуться на главную
        </Link>
      </div>
    </main>
  );
}
