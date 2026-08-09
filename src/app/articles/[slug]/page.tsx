import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { getAllArticles, getArticleBySlug, type Article } from '@/data/articles';
import { MediaPlaceholder, MediaThumb } from '@/components/media-placeholder';
import { InterestRating } from '@/components/interest-rating';
import { formatPublishedAt, getRelatedArticles } from '@/lib/article-utils';
import { formatAuthorCredit, resolveAuthorForArticle } from '@/lib/authors';

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
        <h2 key={index} id={headingId} className="scroll-mt-6 font-serif text-2xl font-bold text-[var(--text)] mt-8 mb-4">
          {headingText}
        </h2>
      );
    }

    if (trimmedBlock.startsWith('### ')) {
      const headingText = trimmedBlock.replace(/^###\s+/, '');
      const headingId = `heading-${headingCounter++}`;
      return (
        <h3 key={index} id={headingId} className="scroll-mt-6 font-serif text-xl font-bold text-[var(--text)] mt-6 mb-3">
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
        className="mb-6 text-[18px] leading-[1.68] text-[var(--text)]"
        dangerouslySetInnerHTML={{
          __html: formatInlineText(trimmedBlock).replace(/\n/g, '<br />'),
        }}
      />
    );
  };

  const contentBlocks = article.content.split('\n\n').filter(Boolean);

  // SP-A-060: desktop container widened from 680px to a modern editorial
  // width; body copy still caps out at a comfortable reading measure inside
  // the left column, right rail holds the visual/related column so wide
  // screens don't just show empty gutters either side of a narrow strip.
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] py-8 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Navigation back button */}
        <div className="mb-6 max-w-5xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            На главную
          </Link>
        </div>

        {/* Wide editorial column (was 680px) */}
        <article className="max-w-5xl mx-auto">
          {/* 1. Category */}
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            {article.category}
          </div>

          {/* 2. Title */}
          <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
            {article.title}
          </h1>

          {/* 3. Lead */}
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--muted)]">
            {article.summary}
          </p>

          {/* 4. Byline · date · read time */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-6 text-xs text-[var(--muted)]">
            <span>{formatAuthorCredit(resolveAuthorForArticle(article).name, formatPublishedAt(article.publishedAt))}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {article.readTime}
            </span>
          </div>

          {/* 5. Hero image — SP-A-061: only rendered when a real,
              entity-confirmed photo exists. No giant empty placeholder when
              there isn't one (no image beats a wrong/unconfirmed one). */}
          {(() => {
            const hero = article.images?.find((i) => i.role === 'hero')?.url || article.imageUrl;
            return hero ? (
              <div className="my-8">
                <MediaPlaceholder
                  category={article.category}
                  title={article.title}
                  imageUrl={hero}
                  description="Иллюстрация к материалу"
                  aspectRatio="aspect-[16/8]"
                />
              </div>
            ) : (
              <div className="my-6" />
            );
          })()}

          {/* Two-column body: text (~68%) + visual/related rail (~32%).
              Collapses to a single column on mobile/tablet. */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_336px]">
            <div className="min-w-0 max-w-3xl">
              {/* 6. Table of Contents (TOC) - ONLY if at least 3 headings */}
              {showToc && (
                <div className="mb-8 rounded border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                  <h2 className="font-serif text-sm font-bold text-[var(--text)] mb-2">
                    Содержание
                  </h2>
                  <ul className="space-y-1.5 pl-4 list-disc text-[var(--muted)]">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className="text-[var(--text)] hover:text-[var(--accent)] hover:underline"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 7. Article Body */}
              <div className="article-body">
                {contentBlocks.map((block, index) => renderBlock(block, index))}
              </div>

              {/* Post-read reader feedback (SP-A-052) */}
              <InterestRating
                slug={article.slug}
                title={article.title}
                summary={article.summary}
              />

              {/* 8. Tags / Topic */}
              <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted)]">
                <span>
                  Категория: <strong className="text-[var(--text)] font-semibold">{article.category}</strong>
                </span>
              </div>

              {/* 9. Source Block */}
              {article.sourceUrl && (
                <div className="mt-8 rounded border border-[var(--border)] bg-[var(--surface)] p-5">
                  <h3 className="font-serif text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Первоисточник
                  </h3>
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text)]">
                      {getDomain(article.sourceUrl)}
                    </span>
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      Открыть оригинал ↗
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* 10. Right rail — related articles (visual column). On mobile
                this simply stacks below the body since the grid collapses
                to one column; on desktop it sits alongside the text and
                sticks while scrolling. Reserved for a 2nd/3rd product photo
                slot once the image pipeline collects more than one shot. */}
            {(() => {
              const extraImages = (article.images || []).filter((i) => i.role !== 'hero');
              if (!extraImages.length && relatedArticles.length === 0) return null;
              return (
                <aside className="lg:sticky lg:top-20 lg:self-start">
                  {extraImages.length > 0 && (
                    <div className="mb-8 space-y-4">
                      {extraImages.map((img) => (
                        <div key={img.url} className="overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
                          <img src={img.url} alt={article.title} className="h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  {relatedArticles.length > 0 && (
                    <>
                      <h2 className="font-serif text-lg font-bold text-[var(--text)] mb-4">
                        Читайте также
                      </h2>
                      <div className="space-y-5">
                        {relatedArticles.map((rel) => (
                          <Link
                            key={rel.slug}
                            href={`/articles/${rel.slug}`}
                            className="group flex gap-3 border-b border-[var(--border)] pb-5 last:border-b-0"
                          >
                            <MediaThumb imageUrl={rel.imageUrl} title={rel.title} className="h-16 w-16 aspect-square" />
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                                {rel.category}
                              </div>
                              <h3 className="mt-0.5 font-serif text-sm font-bold leading-snug text-[var(--text)] group-hover:text-[var(--accent)] line-clamp-2">
                                {rel.title}
                              </h3>
                              <div className="mt-1 text-[10px] text-[var(--muted)]">
                                {formatPublishedAt(rel.publishedAt)} • {rel.readTime}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
              );
            })()}
          </div>
        </article>
      </div>
    </main>
  );
}
