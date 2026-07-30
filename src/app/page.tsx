import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, Cpu, Globe, Shield, Sparkles, Zap } from 'lucide-react';
import articles, { type Article } from '@/data/articles';

const categoryIcons: Record<string, ReactNode> = {
  AI: <Cpu className="h-5 w-5 text-cyan-400" />,
  Cloud: <Globe className="h-5 w-5 text-cyan-400" />,
  Security: <Shield className="h-5 w-5 text-cyan-400" />,
  Automation: <Zap className="h-5 w-5 text-cyan-400" />,
};

function getCategoryIcon(article: Article): ReactNode {
  return categoryIcons[article.category] ?? (
    <Sparkles className="h-5 w-5 text-cyan-400" />
  );
}

function formatPublishedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function HomePage() {
  const publishedArticles: Article[] = articles;

  return (
    <main className="min-h-screen bg-black text-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 border-b border-gray-800 pb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-cyan-400">
                Лента SmartProto
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-6xl">
                AI-статьи, отобранные вручную
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400 md:text-base">
                Тёмные редакционные карточки с последними опубликованными материалами.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-cyan-400">
              <BookOpen className="h-4 w-4" />
              Опубликованные материалы
            </div>
          </div>
        </header>

        {publishedArticles.length === 0 ? (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-gray-300">
            <p className="text-lg leading-8">
              Пока нет опубликованных материалов. AI-конвейер работает...
            </p>
          </section>
        ) : (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {publishedArticles.map((article) => (
              <Link
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-cyan-400/40"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-800 bg-black">
                    {getCategoryIcon(article)}
                  </div>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-400">
                    опубликовано
                  </span>
                </div>

                <div className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-400">
                  {article.category}
                </div>
                <h2 className="mt-3 text-2xl font-semibold leading-tight text-white transition-colors group-hover:text-cyan-300">
                  {article.title}
                </h2>
                <p className="mt-4 flex-1 text-sm leading-7 text-gray-300">
                  {article.summary}
                </p>
                <div className="mt-6 flex items-center justify-between text-xs text-gray-500">
                  <span>{formatPublishedAt(article.publishedAt)}</span>
                  <span>{article.readTime}</span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
