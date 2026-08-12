'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppLocale } from '@/lib/i18n/locales';
import { isAppLocale, localeHomePath, LOCALE_UI } from '@/lib/i18n/locales';
import { useLocaleSwitcher, type LocaleLinkMap } from '@/components/locale-switcher-context';

function detectLocale(pathname: string): AppLocale {
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/tr' || pathname.startsWith('/tr/')) return 'tr';
  return 'ru';
}

export function LanguageSwitcher({
  activeLocale,
  articleLinks,
}: {
  activeLocale?: AppLocale;
  /** When provided (article pages), registers same-story links for the header switcher. */
  articleLinks?: Partial<LocaleLinkMap>;
}) {
  const pathname = usePathname() || '/';
  const locale = activeLocale || detectLocale(pathname);
  const { links, setArticleLinks } = useLocaleSwitcher();

  useEffect(() => {
    if (!articleLinks) {
      setArticleLinks(null);
      return;
    }
    setArticleLinks(articleLinks);
    return () => setArticleLinks(null);
  }, [articleLinks, setArticleLinks]);

  const effective = articleLinks
    ? {
        ru: articleLinks.ru ?? null,
        en: articleLinks.en ?? null,
        tr: articleLinks.tr ?? null,
      }
    : links;

  const items: AppLocale[] = ['ru', 'en', 'tr'];
  const unavailable = LOCALE_UI[locale].localizationUnavailable;

  return (
    <nav
      className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg)] p-0.5 text-[11px] font-semibold"
      aria-label="Language"
    >
      {items.map((code) => {
        const href = effective[code];
        const active = code === locale;
        if (!href) {
          return (
            <span
              key={code}
              title={unavailable}
              className="cursor-not-allowed select-none px-1.5 py-0.5 uppercase text-[var(--muted)] opacity-40"
            >
              {code}
            </span>
          );
        }
        return (
          <Link
            key={code}
            href={href}
            className={
              active
                ? 'rounded px-1.5 py-0.5 uppercase text-[var(--accent)]'
                : 'rounded px-1.5 py-0.5 uppercase text-[var(--muted)] transition hover:text-[var(--text)]'
            }
            aria-current={active ? 'page' : undefined}
          >
            {code}
          </Link>
        );
      })}
    </nav>
  );
}

/** Home-level fallback links for non-article pages. */
export function homeLocaleLinks(): LocaleLinkMap {
  return {
    ru: localeHomePath('ru'),
    en: localeHomePath('en'),
    tr: localeHomePath('tr'),
  };
}

export function detectLocaleFromPath(pathname: string): AppLocale {
  return detectLocale(pathname);
}

export { isAppLocale };
