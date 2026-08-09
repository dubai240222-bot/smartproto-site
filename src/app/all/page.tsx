import Link from 'next/link';
import { ArrowRight, Newspaper, Sparkles } from 'lucide-react';
import { getAllArticles } from '@/data/articles';
import { ArticleCard } from '@/components/article-card';
import { LiveFeedSection } from '@/components/live-feed-section';
import { MediaPlaceholder } from '@/components/media-placeholder';
import {
  getArticleStats,
  getCategoryHighlights,
  sortArticlesByPublishedDate,
} from '@/lib/article-utils';

// SP-A-056: render per request so a new SQLite-published article (Hetzner)
// or refreshed JSON data appears without a rebuild.
export const dynamic = 'force-dynamic';

export default function AllArticlesPage() {
  const sortedArticles = sortArticlesByPublishedDate(getAllArticles());
  const stats = getArticleStats(sortedArticles);
  const featuredArticle = stats.latestArticle ?? sortedArticles[0];
  const categoryHighlights = getCategoryHighlights(sortedArticles);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-10 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-sm font-bold text-cyan-300">
              S
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-400">SmartProto</p>
              <p className="mt-1 text-lg font-semibold text-white">Новости</p>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:border-cyan-400/30 hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/editorial"
              className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 font-medium text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/15"
            >
              Editorial variant
            </Link>
          </nav>
        </header>

        <section className="grid gap-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:py-14">
          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Новости
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Все новости SmartProto
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
              Архив опубликованных материалов: гаджеты, ИИ, роботы и наука — свежие истории сверху.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={featuredArticle ? `/articles/${featuredArticle.slug}` : '/'}
                className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-200"
              >
                Читать свежую новость
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#news"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/8"
              >
                На главную ленту
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Новости</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stats.totalArticles}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Темы</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stats.totalCategories}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Чтение</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stats.totalReadMinutes}м</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <MediaPlaceholder
              kind="image"
              title="Archive hero"
              description="Editorial photo or render for the archive spotlight."
              label="Media"
            />
            <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Featured story</p>
              <p className="mt-3 text-xl font-semibold text-white">{featuredArticle?.title}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                The archive now highlights the freshest article first so the page feels curated instead of flat.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-14 md:grid-cols-3">
          {[
            {
              title: 'Newsroom live',
              text: 'A current feed keeps the archive feeling active before AI-generated content arrives.',
            },
            {
              title: 'Story cards',
              text: 'Each article card now uses a stronger type scale, clearer metadata, and better hover states.',
            },
            {
              title: 'Topic spread',
              text: 'Categories are visible as editorial signals instead of a hidden taxonomy.',
            },
          ].map((item) => (
            <article key={item.title} className="rounded-[2rem] border border-white/8 bg-white/5 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                <Newspaper className="h-5 w-5 text-cyan-300" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.text}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 pb-14 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Featured article</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">The freshest published piece</h2>
              </div>
              <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                Latest first
              </span>
            </div>

            {featuredArticle ? (
              <div className="mt-6">
                <ArticleCard article={featuredArticle} variant="featured" eyebrow="Archive spotlight" />
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
                No articles have been approved yet.
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Category context</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Each topic now feels like a separate section.</h2>
            <div className="mt-6 space-y-4">
              {categoryHighlights.slice(0, 4).map((item) => (
                <article key={item.category} className="rounded-3xl border border-white/8 bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">{item.category}</p>
                      <p className="mt-2 text-lg font-semibold text-white">{item.count} items</p>
                    </div>
                    <span className="rounded-full border border-white/8 bg-slate-950/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                      Curated
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.latest.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <LiveFeedSection />

        <section className="pb-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Опубликовано</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Все новости</h2>
            </div>
            <span className="text-sm text-slate-400">{sortedArticles.length} материалов</span>
          </div>

          {sortedArticles.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
              Пока нет опубликованных новостей.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {sortedArticles.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-white/8 bg-gradient-to-r from-cyan-400/10 via-white/5 to-teal-400/10 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Next reading path</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Try the editorial landing variant for a different layout.</h2>
            </div>
            <Link
              href="/editorial"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-200"
            >
              Open editorial variant
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
