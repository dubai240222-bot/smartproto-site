import Link from 'next/link';
import { getAllArticles } from '@/data/articles';
import { listPublishedLocalizations } from '@/data/localizations';
import { MediaThumb } from '@/components/media-placeholder';
import {
  LOCALE_UI,
  formatPublishedAtLocale,
  localizeCategoryLabel,
  localizeReadTime,
  type LocalizationLanguage,
} from '@/lib/i18n/locales';
import { displayHeroUrl } from '@/lib/homepage-editorial-mix';
import { inferPublicCategory } from '@/lib/public-labels';

export const dynamic = 'force-dynamic';

export function LocalizedHome({ language }: { language: LocalizationLanguage }) {
  const ui = LOCALE_UI[language];
  const locs = listPublishedLocalizations(language);
  const articles = getAllArticles();
  const byId = new Map(articles.map((a) => [a.id, a]));

  const rows = locs
    .map((loc) => {
      const canon = byId.get(loc.articleId);
      if (!canon) return null;
      return { loc, canon };
    })
    .filter(Boolean) as Array<{
    loc: (typeof locs)[number];
    canon: (typeof articles)[number];
  }>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        SmartProto · {language.toUpperCase()}
      </p>
      <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[var(--text)]">
        {ui.homeFeed}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{ui.tagline}</p>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--muted)]">{ui.emptyHome}</p>
      ) : (
        <ul className="mt-8 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {rows.map(({ loc, canon }) => {
            const category = localizeCategoryLabel(inferPublicCategory(canon), language);
            const readTime = localizeReadTime(canon.readTime, language);
            const href = `/${language}/articles/${loc.localizedSlug}`;
            // Same story → same media: reuse RU canonical hero (SP-A-100F).
            const hero = displayHeroUrl(canon);
            return (
              <li key={`${language}:${loc.localizedSlug}`} className="py-5">
                <article className="group flex items-start gap-3 sm:gap-4">
                  <Link href={href} className="shrink-0" aria-label={loc.localizedTitle}>
                    <MediaThumb
                      imageUrl={hero}
                      slug={canon.slug}
                      title={loc.localizedTitle}
                      category={canon.category}
                      tags={canon.tags}
                      summary={loc.localizedExcerpt || canon.summary}
                      agentId={canon.agentId}
                      className="h-[72px] w-[100px] sm:h-[88px] sm:w-[124px]"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                      {category}
                    </p>
                    <Link
                      href={href}
                      className="mt-1 block font-serif text-xl font-bold text-[var(--text)] transition hover:text-[var(--accent)]"
                    >
                      {loc.localizedTitle}
                    </Link>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
                      {loc.localizedExcerpt}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--muted)]">
                      {formatPublishedAtLocale(canon.publishedAt, language)}
                      {readTime ? ` · ${readTime}` : ''}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
