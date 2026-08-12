/**
 * SP-A-097F1 — hreflang map for a canonical RU article + published localizations only.
 */
import type { Metadata } from 'next';
import { getLocalization } from '@/data/localizations';
import { localeArticlePath, type AppLocale } from '@/lib/i18n/locales';

export function buildArticleLanguageAlternates(opts: {
  articleId: string;
  ruSlug: string;
}): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {
    'x-default': localeArticlePath('ru', opts.ruSlug),
    ru: localeArticlePath('ru', opts.ruSlug),
  };

  const en = getLocalization(opts.articleId, 'en');
  if (en?.translationStatus === 'published') {
    languages.en = localeArticlePath('en', en.localizedSlug);
  }
  const tr = getLocalization(opts.articleId, 'tr');
  if (tr?.translationStatus === 'published') {
    languages.tr = localeArticlePath('tr', tr.localizedSlug);
  }

  return {
    canonical: languages.ru,
    languages,
  };
}

export function articleSwitcherLinks(opts: {
  articleId: string;
  ruSlug: string;
}): Record<AppLocale, string | null> {
  const en = getLocalization(opts.articleId, 'en');
  const tr = getLocalization(opts.articleId, 'tr');
  return {
    ru: localeArticlePath('ru', opts.ruSlug),
    en:
      en?.translationStatus === 'published'
        ? localeArticlePath('en', en.localizedSlug)
        : null,
    tr:
      tr?.translationStatus === 'published'
        ? localeArticlePath('tr', tr.localizedSlug)
        : null,
  };
}
