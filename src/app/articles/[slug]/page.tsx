import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { getAllArticles, getArticleBySlug } from '@/data/articles';
import { MediaPlaceholder, MediaThumb } from '@/components/media-placeholder';
import { CategoryTags } from '@/components/article-card';
import { InterestRating } from '@/components/interest-rating';
import { formatPublishedAt, getRelatedArticles } from '@/lib/article-utils';
import { resolveAuthorForArticle } from '@/lib/authors';
import { displayHeroUrl } from '@/lib/homepage-editorial-mix';
import { toPublicCategory } from '@/lib/public-labels';

// SP-A-056: render per request (both storage modes) so a newly published
// article — from SQLite on Hetzner, or freshly rebuilt JSON on Vercel — is
// always served without relying on a stale static prerender.
export const dynamic = 'force-dynamic';
const USE_SQLITE = process.env.ARTICLES_STORE === 'sqlite';

export async function generateStaticParams() {
  if (USE_SQLITE) return [];
  return getAllArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    return {
      title: 'Материал не найден',
    };
  }

  return {
    title: `${article.title} | SmartProto`,
    description: article.summary,
    alternates: {
      canonical: `/articles/${article.slug}`,
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineText(text: string): string {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="article-text-link">$1</a>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>');
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

function extractHeadings(content: string): HeadingItem[] {
  const lines = content.split('\n');
  const headings: HeadingItem[] = [];
  let index = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      headings.push({
        id: `heading-${index++}`,
        text: trimmed.replace(/^##\s+/, ''),
        level: 2,
      });
    } else if (trimmed.startsWith('### ')) {
      headings.push({
        id: `heading-${index++}`,
        text: trimmed.replace(/^###\s+/, ''),
        level: 3,
      });
    }
  }

  return headings;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = getRelatedArticles(article.slug, 3, getAllArticles());
  const headings = extractHeadings(article.content);
  const showToc = headings.length >= 3;

  let headingCounter = 0;

  const renderBlock = (block: string, index: number): ReactElement | null => {
    const trimmedBlock = block.trim();

    if (!trimmedBlock) {
      return null;
    }

    if (trimmedBlock.startsWith('## ')) {
      const headingText = trimmedBlock.replace(/^##\s+/, '');
      const headingId = `heading-${headingCounter++}`;
      return (
        <h2
          key={index}
          id={headingId}
          className="mt-8 mb-3 scroll-mt-6 text-xl font-semibold tracking-tight text-[var(--text)] sm:text-[1.35rem]"
        >
          {headingText}
        </h2>
      );
    }

    if (trimmedBlock.startsWith('### ')) {
      const headingText = trimmedBlock.replace(/^###\s+/, '');
      const headingId = `heading-${headingCounter++}`;
      return (
        <h3
          key={index}
          id={headingId}
          className="mt-6 mb-2.5 scroll-mt-6 text-lg font-semibold tracking-tight text-[var(--text)]"
        >
          {headingText}
        </h3>
      );
    }

    const lines = trimmedBlock.split('\n');
    const isBulletList = lines.every((line) => /^[-*]\s/.test(line));
    const isNumberedList = lines.every((line) => /^\d+\.\s/.test(line));

    if (isBulletList || isNumberedList) {
      const ListTag = isNumberedList ? 'ol' : 'ul';

      return (
        <ListTag
          key={index}
          className={`my-4 space-y-2 pl-6 text-[var(--text)] ${isNumberedList ? 'list-decimal' : 'list-disc'}`}
        >
          {lines.map((line, lineIndex) => (
            <li
              key={lineIndex}
              dangerouslySetInnerHTML={{
                __html: formatInlineText(line.replace(/^[-*]\s|^\d+\.\s/, '')),
              }}
            />
          ))}
        </ListTag>
      );
    }

    return (
      <p
        key={index}
        className="mb-5 text-[16px] leading-[1.65] text-[var(--text)] sm:text-[17px]"
        dangerouslySetInnerHTML={{
          __html: formatInlineText(trimmedBlock).replace(/\n/g, '<br />'),
        }}
      />
    );
  };

  const contentBlocks = article.content.split('\n\n').filter(Boolean);
  const hero = displayHeroUrl(article);
  const extras = (article.images || []).filter((i) => i.role !== 'hero');
  const publicCategory = toPublicCategory(article.category);

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors">
      <div className="mx-auto max-w-[1440px] px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <div className="mb-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            На главную
          </Link>
        </div>

        <article className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <time className="text-[11px] font-normal tabular-nums text-[var(--muted)]">
              {formatPublishedAt(article.publishedAt)}
            </time>
            <CategoryTags category={article.category} tone="hash" />
          </div>

          <h1 className="mt-2 max-w-3xl text-[1.45rem] font-semibold leading-[1.2] tracking-tight text-[var(--text)] sm:text-[1.85rem] lg:text-[2.1rem]">
            {article.title}
          </h1>

          <p className="mt-3 max-w-3xl text-[14px] font-normal leading-relaxed text-[var(--muted)] sm:text-[15px]">
            {article.summary}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] pb-3 text-[11px] text-[var(--muted)]">
            <span>Автор: {resolveAuthorForArticle(article).name}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {article.readTime}
            </span>
          </div>

          <div className={hero ? 'my-5' : 'my-4'}>
            <MediaPlaceholder
              category={article.category}
              title={article.title}
              tags={article.tags}
              summary={article.summary}
              imageUrl={hero}
              description={hero ? 'Иллюстрация к материалу' : undefined}
              aspectRatio={hero ? 'aspect-[16/8]' : 'aspect-[16/7]'}
              compactFallback={!hero}
              className="rounded-sm"
            />
          </div>

          {extras.length > 0 ? (
            <div className="mb-6 space-y-3 lg:hidden">
              {extras.map((img) => (
                <div
                  key={img.url}
                  className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--surface)]"
                >
                  <img src={img.url} alt={article.title} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 max-w-3xl">
              {showToc ? (
                <div className="mb-6 border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[12px]">
                  <h2 className="mb-2 text-[12px] font-medium tracking-wide text-[var(--muted)]">
                    Содержание
                  </h2>
                  <ul className="space-y-1.5 pl-4 list-disc text-[var(--muted)]">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className="text-[var(--text)] transition hover:text-[var(--accent)]"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="article-body">
                {contentBlocks.map((block, index) => renderBlock(block, index))}
              </div>

              <InterestRating
                slug={article.slug}
                title={article.title}
                summary={article.summary}
              />

              {publicCategory ? (
                <div className="mt-6 flex items-center border-t border-[var(--border)] pt-3 text-[12px] text-[var(--muted)]">
                  <CategoryTags category={article.category} tone="hash" />
                </div>
              ) : null}

              {article.sourceUrl ? (
                <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="text-[11px] font-medium tracking-wide text-[var(--muted)]">
                    Первоисточник
                  </h3>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[13px] font-medium text-[var(--text)]">
                      {getDomain(article.sourceUrl)}
                    </span>
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
                    >
                      Открыть оригинал ↗
                    </a>
                  </div>
                </div>
              ) : null}
            </div>

            {(() => {
              if (!extras.length && relatedArticles.length === 0) return null;
              return (
                <aside className="lg:sticky lg:top-16 lg:self-start">
                  {extras.length > 0 ? (
                    <div className="mb-6 hidden space-y-3 lg:block">
                      {extras.map((img) => (
                        <div
                          key={img.url}
                          className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--surface)]"
                        >
                          <img
                            src={img.url}
                            alt={article.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {relatedArticles.length > 0 ? (
                    <>
                      <h2 className="mb-2 text-[12px] font-medium tracking-wide text-[var(--muted)]">
                        Читайте также
                      </h2>
                      <div className="space-y-0">
                        {relatedArticles.map((rel) => (
                          <Link
                            key={rel.slug}
                            href={`/articles/${rel.slug}`}
                            className="group flex gap-2.5 border-b border-[var(--border)] py-2.5 last:border-b-0"
                          >
                            <MediaThumb
                              imageUrl={displayHeroUrl(rel)}
                              title={rel.title}
                              category={rel.category}
                              tags={rel.tags}
                              summary={rel.summary}
                              className="h-[52px] w-[72px]"
                            />
                            <div className="min-w-0">
                              <time className="mb-0.5 block text-[10px] font-normal tabular-nums text-[var(--muted)]">
                                {formatPublishedAt(rel.publishedAt)}
                              </time>
                              <h3 className="line-clamp-3 text-[13px] font-medium leading-snug text-[var(--text)] transition group-hover:text-[var(--accent)]">
                                {rel.title}
                              </h3>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : null}
                </aside>
              );
            })()}
          </div>
        </article>
      </div>
    </main>
  );
}
