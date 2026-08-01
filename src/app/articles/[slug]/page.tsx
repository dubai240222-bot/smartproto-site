import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import articles, { getArticleBySlug, type Article } from '@/data/articles';
import { MediaPlaceholder } from '@/components/media-placeholder';
import { formatPublishedAt, getRelatedArticles } from '@/lib/article-utils';

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
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

  const relatedArticles = getRelatedArticles(article.slug, 3, articles);
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

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] py-8 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Navigation back button */}
        <div className="mb-6 max-w-[680px] mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            На главную
          </Link>
        </div>

        {/* Quiet center column (max 680px) */}
        <article className="max-w-[680px] mx-auto">
          {/* 1. Category */}
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            {article.category}
          </div>

          {/* 2. Title */}
          <h1 className="mt-3 font-serif text-3xl font-bold leading-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
            {article.title}
          </h1>

          {/* 3. Lead */}
          <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
            {article.summary}
          </p>

          {/* 4. Date & Read time */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-6 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatPublishedAt(article.publishedAt)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {article.readTime}
            </span>
          </div>

          {/* 5. Cover/Image placeholder */}
          <div className="my-8">
            <MediaPlaceholder
              category={article.category}
              title={article.title}
              imageUrl={article.imageUrl}
              description="Иллюстрация к материалу"
            />
          </div>

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

          {/* 10. Related Articles */}
          {relatedArticles.length > 0 && (
            <section className="mt-12 pt-8 border-t border-[var(--border)]">
              <h2 className="font-serif text-2xl font-bold text-[var(--text)] mb-6">
                Читайте также
              </h2>
              <div className="space-y-6">
                {relatedArticles.map((rel) => (
                  <div key={rel.slug} className="pb-6 border-b border-[var(--border)] last:border-b-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                      {rel.category}
                    </div>
                    <h3 className="mt-1 font-serif text-lg font-bold text-[var(--text)] hover:text-[var(--accent)]">
                      <Link href={`/articles/${rel.slug}`}>{rel.title}</Link>
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                      {rel.summary}
                    </p>
                    <div className="mt-2 text-[10px] text-[var(--muted)]">
                      {formatPublishedAt(rel.publishedAt)} • {rel.readTime}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
    </main>
  );
}
