import { ArrowRight, Cpu, Globe, Shield, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import articles from '@/data/articles';
import { LiveFeedSection } from '@/components/live-feed-section';

const iconMap: Record<string, ReactNode> = {
  Globe: <Globe className="h-6 w-6" style={{ color: 'var(--primary)' }} />,
  Cpu: <Cpu className="h-6 w-6" style={{ color: 'var(--primary)' }} />,
  Zap: <Zap className="h-6 w-6" style={{ color: 'var(--primary)' }} />,
  Shield: <Shield className="h-6 w-6" style={{ color: 'var(--primary)' }} />,
};

const iconKeys = ['Globe', 'Cpu', 'Zap', 'Shield'] as const;

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

export default function AllArticlesPage() {
  const featuredArticle = articles[0];

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--text)' }}>
      <header
        className="sticky top-0 z-50 border-b border-surface/50 backdrop-blur-md"
        style={{ backgroundColor: 'rgba(11, 12, 16, 0.8)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--primary)' }}>
              <span className="text-xl font-bold" style={{ color: 'var(--background)' }}>S</span>
            </div>
            <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
              Smart<span style={{ color: 'var(--primary)' }}>Proto</span>
            </span>
          </Link>
          <Link href="/" className="text-sm font-medium transition-opacity hover:opacity-80" style={{ color: 'var(--primary)' }}>
            Back to home
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 py-16">
        <div
          className="absolute left-1/2 top-0 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(102, 252, 241, 0.05)' }}
        />
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <span
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--primary)',
                borderColor: 'rgba(102, 252, 241, 0.2)',
              }}
            >
              Newsroom
            </span>
            <h1 className="mb-4 text-4xl font-bold leading-tight text-white md:text-5xl">
              All published articles
            </h1>
            <p className="max-w-2xl text-lg" style={{ color: 'var(--text)', opacity: 0.8 }}>
              Moderated stories collected from the draft pipeline.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div
          className="rounded-3xl border p-6 md:p-8"
          style={{
            backgroundColor: 'rgba(31, 40, 51, 0.45)',
            borderColor: 'rgba(31, 40, 51, 0.75)',
          }}
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span
                className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(102, 252, 241, 0.08)',
                  color: 'var(--primary)',
                  borderColor: 'rgba(102, 252, 241, 0.18)',
                }}
              >
                Newsroom Live
              </span>
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                Latest moderated story
              </h2>
            </div>
            <div
              className="rounded-full border px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#34d399',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              }}
            >
              Ready for review
            </div>
          </div>

          {featuredArticle ? (
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] items-start">
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--secondary)' }}>
                  {featuredArticle.category}
                </span>
                <h3 className="mb-3 text-2xl font-bold text-white md:text-3xl">
                  {featuredArticle.title}
                </h3>
                <p className="mb-4 text-sm leading-relaxed md:text-base" style={{ color: 'var(--text)', opacity: 0.88 }}>
                  {featuredArticle.summary}
                </p>
                <div className="flex items-center gap-3 text-xs md:text-sm" style={{ color: 'var(--text)', opacity: 0.7 }}>
                  <span>{formatPublishedAt(featuredArticle.publishedAt)}</span>
                  <span>•</span>
                  <span>{featuredArticle.readTime}</span>
                </div>
              </div>

              <div
                className="rounded-2xl border p-5"
                style={{
                  backgroundColor: 'rgba(11, 12, 16, 0.5)',
                  borderColor: 'rgba(102, 252, 241, 0.12)',
                }}
              >
                <p className="mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--secondary)' }}>
                  Featured article
                </p>
                <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--text)', opacity: 0.9 }}>
                  {featuredArticle.summary}
                </p>
                <Link
                  href={`/articles/${featuredArticle.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'var(--primary)' }}
                >
                  Open article
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text)', opacity: 0.8 }}>
              No articles have been approved yet.
            </p>
          )}
        </div>
      </section>

      <LiveFeedSection />

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-white">Published stories</h2>
          <span className="text-sm" style={{ color: 'var(--text)', opacity: 0.7 }}>
            {articles.length} items
          </span>
        </div>

        {articles.length === 0 ? (
          <p style={{ color: 'var(--text)', opacity: 0.8 }}>
            Moderate drafts to populate this page.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {articles.map((article, index) => (
              <Link key={article.slug} href={`/articles/${article.slug}`} className="block">
                <article
                  className="group h-full cursor-pointer rounded-xl border p-6 glow-card"
                  style={{ backgroundColor: 'rgba(31, 40, 51, 0.5)', borderColor: 'var(--surface)' }}
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="rounded-lg border p-2" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--surface)' }}>
                      {iconMap[iconKeys[index % iconKeys.length]]}
                    </div>
                    <span
                      className="rounded border px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'rgba(102, 252, 241, 0.1)',
                        color: 'var(--primary)',
                        borderColor: 'rgba(102, 252, 241, 0.2)',
                      }}
                    >
                      {article.readTime}
                    </span>
                  </div>

                  <span className="mb-2 block text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--secondary)' }}>
                    {article.category}
                  </span>

                  <h2 className="mb-3 text-xl font-bold text-white transition-opacity group-hover:opacity-80">
                    {article.title}
                  </h2>

                  <div className="mb-4 flex items-center gap-3 text-xs" style={{ color: 'var(--text)', opacity: 0.7 }}>
                    <span>{formatPublishedAt(article.publishedAt)}</span>
                  </div>

                  <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--text)', opacity: 0.8 }}>
                    {article.summary}
                  </p>

                  <div className="flex items-center text-sm font-medium transition-all group-hover:gap-2" style={{ color: 'var(--primary)' }}>
                    Open article <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-20 border-t py-12" style={{ borderColor: 'rgba(31, 40, 51, 0.5)', backgroundColor: 'var(--background)' }}>
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm" style={{ color: 'var(--text)', opacity: 0.5 }}>
            SmartProto newsroom.
          </p>
        </div>
      </footer>
    </main>
  );
}
