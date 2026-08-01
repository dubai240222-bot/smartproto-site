import Link from 'next/link';
import { ArrowRight, Layers3, Newspaper, PlayCircle, Sparkles } from 'lucide-react';
import articles from '@/data/articles';
import { ArticleCard } from '@/components/article-card';
import { LiveFeedSection } from '@/components/live-feed-section';
import { MediaPlaceholder } from '@/components/media-placeholder';
import { getArticleStats, getCategoryHighlights, getLatestArticles } from '@/lib/article-utils';

export const metadata = {
  title: 'Editorial variant | SmartProto',
  description:
    'A second landing-page variant for SmartProto, focused on thematic blocks, media placeholders, and newsroom pacing.',
};

export default function EditorialPage() {
  const stats = getArticleStats(articles);
  const latestArticles = getLatestArticles(3, articles);
  const categoryHighlights = getCategoryHighlights(articles);
  const spotlightArticle = stats.latestArticle ?? latestArticles[0];

  const chapterBlocks = [
    {
      title: 'Signal first',
      description:
        'The layout starts with the strongest item and then moves into supporting blocks, so the page feels curated.',
    },
    {
      title: 'Structured by theme',
      description:
        'Categories, related stories, and live feed blocks are arranged like a newsroom overview instead of a generic blog.',
    },
    {
      title: 'Media-ready slots',
      description:
        'Image and video placeholders make it obvious where future visuals will live without breaking the composition today.',
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-11rem] top-16 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-8rem] top-36 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-sm font-bold text-cyan-300">
              S
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-400">SmartProto</p>
              <p className="mt-1 text-lg font-semibold text-white">Editorial variant</p>
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
              href="/all"
              className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 font-medium text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/15"
            >
              Archive
            </Link>
          </nav>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:py-14">
          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Alternative landing
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
              A newsroom-style variant with chapters, signals, and media placeholders.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
              This page gives the site a second visual rhythm. It feels closer to a magazine opener, with a clear
              editorial hierarchy and space reserved for future images and videos.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={spotlightArticle ? `/articles/${spotlightArticle.slug}` : '/all'}
                className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-200"
              >
                Open spotlight story
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/all"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/8"
              >
                View archive
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Stories</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stats.totalArticles}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Sections</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stats.totalCategories}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Latest</p>
                <p className="mt-2 text-2xl font-semibold text-white">Now</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <MediaPlaceholder
              kind="video"
              title="Editorial trailer slot"
              description="A short intro video can appear here later without changing the structure."
              label="Video placeholder"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Latest label</p>
                <p className="mt-3 text-xl font-semibold text-white">{stats.latestPublishedLabel}</p>
              </div>
              <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Reading time</p>
                <p className="mt-3 text-xl font-semibold text-white">{stats.totalReadMinutes} min</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-14 md:grid-cols-3">
          {chapterBlocks.map((block) => (
            <article key={block.title} className="rounded-[2rem] border border-white/8 bg-white/5 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                <Layers3 className="h-5 w-5 text-cyan-300" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-white">{block.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{block.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 pb-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Spotlight</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">The lead article stays visually dominant</h2>
              </div>
              <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                Featured
              </span>
            </div>

            {spotlightArticle ? (
              <div className="mt-6">
                <ArticleCard article={spotlightArticle} variant="featured" eyebrow="Editorial lead" />
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
                No spotlight article is available yet.
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 md:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Visual grid</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Media placeholders keep the layout grounded</h2>
            <div className="mt-6 space-y-4">
              <MediaPlaceholder
                kind="image"
                title="Hero image slot"
                description="Reserved for a hero photo or render."
                label="Image area"
              />
              <div className="rounded-[2rem] border border-white/8 bg-white/5 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Why this matters</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  The page stays polished even with no connected media because the placeholders are explicit and labeled.
                </p>
              </div>
            </div>
          </div>
        </section>

        <LiveFeedSection />

        <section className="pb-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Recent stories</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">A tighter stack of the latest three</h2>
            </div>
            <span className="text-sm text-slate-400">{latestArticles.length} items</span>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {latestArticles.map((article) => (
              <ArticleCard key={article.slug} article={article} variant="compact" />
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/8 bg-gradient-to-r from-cyan-400/10 via-white/5 to-teal-400/10 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300">Back to browsing</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Switch back to the archive or the main home anytime.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:border-cyan-400/30 hover:bg-white/8"
              >
                Home
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/all"
                className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-200"
              >
                Archive
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
