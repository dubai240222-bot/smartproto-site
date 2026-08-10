import Link from 'next/link';
import { ArrowRight, Clock, Calendar, Sparkles } from 'lucide-react';
import type { Article } from '@/data/articles';
import { formatPublishedAt } from '@/lib/article-utils';
import { formatAuthorByline, resolveAuthorForArticle } from '@/lib/authors';
import { MediaPlaceholder, MediaThumb } from '@/components/media-placeholder';
import { toPublicCategory } from '@/lib/public-labels';
import { displayHeroUrl } from '@/lib/homepage-editorial-mix';

export function CategoryTags({
  category,
  className = '',
  tone = 'subtle',
}: {
  category: string;
  className?: string;
  /** subtle = near-muted meta; hash = soft hashtag under title */
  tone?: 'subtle' | 'hash';
}) {
  // SP-A-050: never show КИТАЙ / Qwen / factory marks on cards.
  const publicCat = toPublicCategory(category);
  const parts = publicCat ? [publicCat] : [];
  if (parts.length === 0) return null;

  if (tone === 'hash') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {parts.map((tag) => (
          <Link
            key={tag}
            href={`/?category=${encodeURIComponent(tag)}`}
            className="text-[11px] font-normal text-[var(--muted)]/70 transition-colors hover:text-[var(--accent)]"
          >
            #{tag.toLowerCase().replace(/\s+/g, '')}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {parts.map((tag, idx) => (
        <span key={tag} className="inline-flex items-center">
          {idx > 0 && <span className="mr-1.5 text-[var(--muted)]/40">·</span>}
          <Link
            href={`/?category=${encodeURIComponent(tag)}`}
            className="text-[10px] font-normal uppercase tracking-wide text-[var(--muted)]/55 transition-colors hover:text-[var(--muted)]"
          >
            {tag}
          </Link>
        </span>
      ))}
    </div>
  );
}

/** SP-A-050: factory-origin badge removed from public UI. */
export function ChinaSourceBadge(_props: { article: Article }) {
  return null;
}

/** Card meta: author persona · published time (China desk resolves to Линь Цзе). */
function cardByline(article: Article): string {
  return formatAuthorByline(
    resolveAuthorForArticle(article).name,
    formatPublishedAt(article.publishedAt),
  );
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function articleHeroUrl(article: { imageUrl?: string; images?: { url: string; role: string }[] }): string | undefined {
  return article.images?.find((i) => i.role === 'hero')?.url || article.imageUrl;
}

function hasHeroImage(article: Article): boolean {
  const url = articleHeroUrl(article);
  return Boolean(url && String(url).trim());
}

/* -------------------------------------------------------------------------- */
/* SP-A-066 — Homepage editorial levels: LEAD / CARD / QUICK                  */
/* -------------------------------------------------------------------------- */

/** LEAD: large hero story — shorter image, skip weak logo tiles. */
export function LeadStory({ article }: { article: Article }) {
  const hero = displayHeroUrl(article);
  return (
    <article className="group space-y-1.5">
      <Link href={`/articles/${article.slug}`} className="block overflow-hidden" aria-label={article.title}>
        <MediaPlaceholder
          category={article.category}
          title={article.title}
          tags={article.tags}
          summary={article.summary}
          imageUrl={hero}
          aspectRatio="aspect-[2/1] sm:aspect-[21/9]"
          compactFallback
          className="rounded-sm"
        />
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-0.5">
        <time className="text-[11px] font-normal tabular-nums text-[var(--muted)]">
          {formatPublishedAt(article.publishedAt)}
        </time>
        <CategoryTags category={article.category} tone="hash" />
      </div>
      <h1 className="text-[1.25rem] font-semibold leading-[1.2] tracking-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)] sm:text-[1.65rem] lg:text-[1.85rem]">
        <Link href={`/articles/${article.slug}`}>{article.title}</Link>
      </h1>
      <p className="line-clamp-2 text-[13px] font-normal leading-snug text-[var(--muted)] sm:text-sm">
        {article.summary}
      </p>
    </article>
  );
}

/** LEAD rail / past feed: compact row with small thumb. */
export function LeadRailItem({ article }: { article: Article }) {
  const hero = displayHeroUrl(article);
  return (
    <article className="group flex items-start gap-2.5 border-b border-[var(--border)] py-2 last:border-b-0 last:pb-0 first:pt-0">
      <Link href={`/articles/${article.slug}`} className="shrink-0" aria-label={article.title}>
        <MediaThumb
          imageUrl={hero}
          title={article.title}
          category={article.category}
          tags={article.tags}
          summary={article.summary}
          className="h-[52px] w-[72px] sm:h-[56px] sm:w-[80px]"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <time className="mb-0.5 block text-[10px] font-normal tabular-nums text-[var(--muted)]">
          {formatPublishedAt(article.publishedAt)}
        </time>
        <h2 className="text-[13px] font-medium leading-snug tracking-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)] sm:text-[14px]">
          <Link href={`/articles/${article.slug}`} className="line-clamp-3">
            {article.title}
          </Link>
        </h2>
      </div>
    </article>
  );
}

/** CARD: equal grid cell — skip weak logos; denser meta. */
export function GridStoryCard({ article }: { article: Article }) {
  const hero = displayHeroUrl(article);

  return (
    <article className="group flex flex-col">
      <Link href={`/articles/${article.slug}`} className="block" aria-label={article.title}>
        <MediaPlaceholder
          category={article.category}
          title={article.title}
          tags={article.tags}
          summary={article.summary}
          imageUrl={hero}
          aspectRatio="aspect-[16/10]"
          compactFallback={!hero}
          className="rounded-sm"
        />
      </Link>
      <time className="mt-1.5 text-[10px] font-normal tabular-nums text-[var(--muted)]">
        {formatPublishedAt(article.publishedAt)}
      </time>
      <h3 className="mt-0.5 text-[13px] font-medium leading-snug tracking-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)] sm:text-[14px]">
        <Link href={`/articles/${article.slug}`} className="line-clamp-3">
          {article.title}
        </Link>
      </h3>
      <CategoryTags category={article.category} tone="hash" className="mt-1" />
    </article>
  );
}

/** QUICK: short note with small photo. */
export function QuickNewsBlock({ article }: { article: Article }) {
  const hero = displayHeroUrl(article);
  return (
    <article className="group flex h-full gap-2.5 border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-2.5">
      <Link href={`/articles/${article.slug}`} className="shrink-0" aria-label={article.title}>
        <MediaThumb
          imageUrl={hero}
          title={article.title}
          category={article.category}
          tags={article.tags}
          summary={article.summary}
          className="h-[64px] w-[88px] sm:h-[72px] sm:w-[96px]"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <time className="mb-1 block text-[10px] font-normal tabular-nums text-[var(--muted)]">
          {formatPublishedAt(article.publishedAt)}
        </time>
        <h3 className="text-[13px] font-medium leading-snug tracking-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)] sm:text-sm">
          <Link href={`/articles/${article.slug}`} className="line-clamp-3">
            {article.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Standard Article Card (Refreshed for light/dark theme CSS variables)   */
/* -------------------------------------------------------------------------- */
type ArticleCardVariant = 'default' | 'featured' | 'compact';

interface ArticleCardProps {
  article: Article;
  variant?: ArticleCardVariant;
  eyebrow?: string;
  className?: string;
}

export function ArticleCard({ article, variant = 'default', eyebrow, className }: ArticleCardProps) {
  const badgeLabel = eyebrow ?? formatPublishedAt(article.publishedAt);
  const hero = articleHeroUrl(article);
  if (variant === 'featured') {
    return (
      <article
        className={`group relative flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 transition duration-200 hover:border-[var(--accent)] ${
          className ?? ''
        }`}
      >
        <div className="space-y-3">
          <MediaPlaceholder
            category={article.category}
            title={article.title}
            tags={article.tags}
            summary={article.summary}
            imageUrl={hero}
            aspectRatio="aspect-[16/9]"
            className="mb-4"
          />
          <CategoryTags category={article.category} />
          <h3 className="font-serif text-xl sm:text-2xl font-bold leading-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          </h3>
          <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-3">
            {article.summary}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          <span>{cardByline(article)}</span>
          <span className="flex items-center gap-1 text-[var(--accent)] font-medium">
            {article.readTime}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </article>
    );
  }

  if (variant === 'compact') {
    return (
      <article
        className={`group flex items-start gap-4 pb-4 border-b border-[var(--border)] last:border-b-0 ${
          className ?? ''
        }`}
      >
        <div className="flex-1 space-y-1 min-w-0">
          <CategoryTags category={article.category} />
          <h3 className="font-serif text-base font-bold text-[var(--text)] transition-colors group-hover:text-[var(--accent)] leading-snug">
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          </h3>
          <div className="text-[11px] text-[var(--muted)] pt-1 flex items-center gap-2">
            <span>{cardByline(article)}</span>
            <span>•</span>
            <span>{article.readTime}</span>
          </div>
        </div>
        <MediaThumb
          imageUrl={hero}
          title={article.title}
          category={article.category}
          tags={article.tags}
          summary={article.summary}
          className="w-20 h-16"
        />
      </article>
    );
  }

  return (
    <article
      className={`group flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 transition duration-200 hover:border-[var(--accent)] ${
        className ?? ''
      }`}
    >
      <div className="space-y-2.5">
        <MediaPlaceholder
          category={article.category}
          title={article.title}
          tags={article.tags}
          summary={article.summary}
          imageUrl={hero}
          aspectRatio="aspect-[16/9]"
          className="mb-3"
        />
        <CategoryTags category={article.category} />
        <h3 className="font-serif text-lg font-bold text-[var(--text)] transition-colors group-hover:text-[var(--accent)] leading-snug">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-2">
          {article.summary}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
        <span>{cardByline(article)}</span>
        <span>{article.readTime}</span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. The Verge Style: Numbered Pick Item (1-5 Editorial Selection)          */
/* -------------------------------------------------------------------------- */
export function VergeNumberedItem({
  index,
  article,
}: {
  index: number;
  article: Article;
}) {
  const formattedIndex = String(index).padStart(2, '0');
  const hero = articleHeroUrl(article);

  return (
    <article className="group flex items-center gap-3 sm:gap-4 py-3.5 border-b border-[var(--border)] last:border-b-0">
      <span className="font-serif text-2xl sm:text-3xl font-black text-[var(--accent)] shrink-0 select-none w-8 text-right leading-none">
        {formattedIndex}
      </span>
      <div className="flex-1 space-y-1 min-w-0">
        <CategoryTags category={article.category} />
        <h3 className="font-serif text-sm sm:text-base font-bold text-[var(--text)] transition-colors group-hover:text-[var(--accent)] leading-snug">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-[var(--muted)] pt-0.5">
          <span>{cardByline(article)}</span>
          <span>•</span>
          <span>{article.readTime}</span>
        </div>
      </div>
      <MediaThumb
        imageUrl={hero}
        title={article.title}
        category={article.category}
        tags={article.tags}
        summary={article.summary}
        className="w-16 h-16 sm:w-20 sm:h-16"
      />
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Ars Technica Style: Visual Feature Block                                */
/* -------------------------------------------------------------------------- */
export function ArsTechnicaCard({ article }: { article: Article }) {
  const hero = articleHeroUrl(article);
  return (
    <article className="group flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-[var(--accent)] hover:shadow-md">
      <div>
        <div className="p-3 bg-[var(--bg)] border-b border-[var(--border)]">
          <MediaPlaceholder
            category={article.category}
            title={article.title}
            tags={article.tags}
            summary={article.summary}
            imageUrl={hero}
            aspectRatio="aspect-[16/10]"
          />
        </div>
        <div className="p-5 space-y-2.5">
          <CategoryTags category={article.category} />
          <h3 className="font-serif text-lg font-bold text-[var(--text)] transition-colors group-hover:text-[var(--accent)] leading-snug">
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          </h3>
          <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-3">
            {article.summary}
          </p>
        </div>
      </div>
      <div className="px-5 pb-4 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 text-[var(--accent)]" />
          {cardByline(article)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-[var(--accent)]" />
          {article.readTime}
        </span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Quick Update Item: Minimal Chronological Feed Row (No heavy card)       */
/* -------------------------------------------------------------------------- */
export function QuickUpdateItem({ article }: { article: Article }) {
  const hero = articleHeroUrl(article);
  return (
    <article className="group py-3.5 border-b border-[var(--border)] last:border-b-0 flex items-start gap-3 sm:gap-5">
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-mono font-semibold text-[var(--muted)]">
            {cardByline(article)}
          </span>
          <span className="text-[var(--muted)] opacity-40">•</span>
          <CategoryTags category={article.category} />
        </div>

        <h3 className="font-serif text-base sm:text-lg font-bold text-[var(--text)] transition-colors group-hover:text-[var(--accent)] leading-snug">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>

        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed line-clamp-2 max-w-4xl">
          {article.summary}
        </p>
      </div>
      <Link href={`/articles/${article.slug}`} className="shrink-0" aria-label={article.title}>
        <MediaThumb
          imageUrl={hero}
          title={article.title}
          category={article.category}
          tags={article.tags}
          summary={article.summary}
          className="w-[112px] h-[84px] sm:w-[180px] sm:h-[120px] md:w-[200px] md:h-[132px]"
        />
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Stratechery Style: Calm Deep Dive Reading Column                        */
/* -------------------------------------------------------------------------- */
export function StratecheryDeepDive({ article }: { article: Article }) {
  const hero = articleHeroUrl(article);
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-10 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--accent)]">
            Глубокий разбор / Longform
          </span>
        </div>
        <CategoryTags category={article.category} />
      </div>

      <div className="space-y-4 max-w-3xl">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold leading-tight text-[var(--text)] hover:text-[var(--accent)] transition-colors">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h2>

        <MediaPlaceholder
          category={article.category}
          title={article.title}
          tags={article.tags}
          summary={article.summary}
          imageUrl={hero}
          aspectRatio="aspect-[21/9]"
          className="rounded-lg my-4"
        />

        <div className="border-l-2 border-[var(--accent)] pl-4 py-1 my-3 bg-[var(--bg)] rounded-r">
          <p className="font-serif italic text-sm sm:text-base text-[var(--text)] leading-relaxed">
            "{article.summary}"
          </p>
        </div>

        <p className="text-sm sm:text-base text-[var(--muted)] leading-relaxed line-clamp-4">
          {article.content}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4 text-xs">
        <div className="flex items-center gap-3 text-[var(--muted)]">
          <span>{cardByline(article)}</span>
          <span>•</span>
          <span>Время чтения: {article.readTime}</span>
        </div>

        <Link
          href={`/articles/${article.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline hover:text-[var(--accent-hover)] transition-colors"
        >
          Читать разбор полностью
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
