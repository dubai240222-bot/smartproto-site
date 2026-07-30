import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import articles, { type Article } from '@/data/articles';

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);

  if (!article) {
    return {
      title: 'Article not found',
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
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">$1</a>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>');
}

function renderBlock(block: string, index: number): ReactElement | null {
  const trimmedBlock = block.trim();

  if (!trimmedBlock) {
    return null;
  }

  if (trimmedBlock.startsWith('## ')) {
    return (
      <h2 key={index} className="text-2xl font-semibold text-white mt-10 mb-4">
        {trimmedBlock.replace('## ', '')}
      </h2>
    );
  }

  const lines = trimmedBlock.split('\n');
  const isBulletList = lines.every((line) => /^[-*]\s/.test(line));
  const isNumberedList = lines.every((line) => /^\d+\.\s/.test(line));

  if (isBulletList || isNumberedList) {
    const ListTag = isNumberedList ? 'ol' : 'ul';

    return (
      <ListTag key={index} className="text-gray-300 space-y-2 my-6 list-disc pl-6">
        {lines.map((line, lineIndex) => (
          <li
            key={lineIndex}
            className="text-gray-300"
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
      className="text-gray-300 text-base leading-7 mb-6"
      dangerouslySetInnerHTML={{
        __html: formatInlineText(trimmedBlock).replace(/\n/g, '<br />'),
      }}
    />
  );
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article: Article | undefined = articles.find((item) => item.slug === slug);

  if (!article) {
    notFound();
  }

  const contentBlocks = article.content.split('\n\n').filter(Boolean);

  return (
    <article className="min-h-screen bg-[#0a0a0a] text-gray-100 antialiased">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-10 space-y-5">
          <Link href="/" className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-block bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded text-[10px] font-mono uppercase">
              Published
            </span>
            <div className="text-cyan-400 font-mono text-xs uppercase tracking-wider flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>{article.category}</span>
              <span>{formatPublishedAt(article.publishedAt)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {article.readTime}
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">{article.title}</h1>
          <p className="text-gray-300 text-base leading-7 mb-6">{article.summary}</p>
        </header>

        <section>
          {contentBlocks.map((block, index) => renderBlock(block, index))}
        </section>

        <section className="mt-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="mb-4 text-cyan-400 font-mono text-xs uppercase tracking-wider">
            Source links
          </h2>
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-2"
          >
            Open original source
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>
      </div>
    </article>
  );
}
