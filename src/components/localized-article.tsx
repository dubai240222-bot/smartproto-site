import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { getAllArticles } from '@/data/articles';
import {
  getPublishedLocalizationBySlug,
  listPublishedLocalizations,
} from '@/data/localizations';
import { LanguageSwitcher } from '@/components/language-switcher';
import { articleSwitcherLinks, buildArticleLanguageAlternates } from '@/lib/i18n/article-alternates';
import {
  LOCALE_UI,
  formatBylineLocale,
  formatPublishedAtLocale,
  localeHomePath,
  localizeCategoryLabel,
  localizeReadTime,
  type LocalizationLanguage,
} from '@/lib/i18n/locales';
import { inferPublicCategory } from '@/lib/public-labels';
import { disclosureSources } from '@/lib/source-label';
import { resolveAuthorForArticle } from '@/lib/authors';

export const dynamic = 'force-dynamic';

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
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="article-text-link">$1</a>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>');
}

function renderParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => (
      <p
        key={i}
        className="mb-5"
        dangerouslySetInnerHTML={{ __html: formatInlineText(p.replace(/\n/g, ' ')) }}
      />
    ));
}

export async function localizedArticleMetadata(
  language: LocalizationLanguage,
  slug: string,
): Promise<Metadata> {
  const loc = getPublishedLocalizationBySlug(language, slug);
  if (!loc) return { title: 'Not found' };
  const articles = getAllArticles();
  const canon = articles.find((a) => a.id === loc.articleId);
  if (!canon) return { title: 'Not found' };

  const alternates = buildArticleLanguageAlternates({
    articleId: canon.id,
    ruSlug: canon.slug,
  });
  // Override canonical to THIS locale URL.
  alternates.canonical = `/${language}/articles/${loc.localizedSlug}`;

  return {
    title: `${loc.localizedTitle} | SmartProto`,
    description: loc.localizedExcerpt,
    alternates,
    openGraph: {
      title: loc.localizedTitle,
      description: loc.localizedExcerpt,
      locale: LOCALE_UI[language].ogLocale,
      type: 'article',
    },
  };
}

export function LocalizedArticlePage({
  language,
  slug,
}: {
  language: LocalizationLanguage;
  slug: string;
}) {
  const ui = LOCALE_UI[language];
  const loc = getPublishedLocalizationBySlug(language, slug);
  if (!loc) notFound();

  const articles = getAllArticles();
  const canon = articles.find((a) => a.id === loc.articleId);
  if (!canon) notFound();

  // Never serve RU body under EN/TR — content comes only from localization.
  const category = localizeCategoryLabel(inferPublicCategory(canon), language);
  const sources = disclosureSources({ sourceUrl: canon.sourceUrl });
  const switcher = articleSwitcherLinks({ articleId: canon.id, ruSlug: canon.slug });

  const related = listPublishedLocalizations(language)
    .filter((l) => l.localizedSlug !== loc.localizedSlug)
    .slice(0, 3);

  const readTime = localizeReadTime(canon.readTime, language);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={localeHomePath(language)}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {ui.backHome}
        </Link>
        <LanguageSwitcher activeLocale={language} articleLinks={switcher} />
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
        {category}
      </p>
      <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
        {loc.localizedTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{loc.localizedExcerpt}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
        <span>
          {formatBylineLocale(
            resolveAuthorForArticle(canon).name,
            formatPublishedAtLocale(canon.publishedAt, language),
            language,
          )}
        </span>
        {readTime ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {readTime}
          </span>
        ) : null}
      </div>

      <div className="article-body mt-8">{renderParagraphs(loc.localizedContent)}</div>

      <div className="mt-8 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        <span>
          {ui.category}:{' '}
          <strong className="font-semibold text-[var(--text)]">{category}</strong>
        </span>
      </div>

      {sources.length > 0 ? (
        <details className="source-disclosure mt-8 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
          <summary className="cursor-pointer list-none select-none text-[13px] text-[var(--muted)] hover:text-[var(--text)] [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5">
              {ui.sources}
              <span aria-hidden className="source-disclosure-chevron text-[10px] leading-none opacity-70">
                ▾
              </span>
            </span>
          </summary>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
            {sources.map((src) => (
              <li key={src.url}>
                <span className="text-[var(--text)]">
                  {ui.sourceLabel}: {src.label}
                </span>
                <br />
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                >
                  {ui.originalPublication} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-12 border-t border-[var(--border)] pt-6">
          <h2 className="font-serif text-lg font-bold text-[var(--text)]">{ui.related}</h2>
          <ul className="mt-4 space-y-4">
            {related.map((r) => (
              <li key={r.localizedSlug}>
                <Link
                  href={`/${language}/articles/${r.localizedSlug}`}
                  className="font-serif text-base font-semibold text-[var(--text)] transition hover:text-[var(--accent)]"
                >
                  {r.localizedTitle}
                </Link>
                <p className="mt-1 text-xs text-[var(--muted)]">{r.localizedExcerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
