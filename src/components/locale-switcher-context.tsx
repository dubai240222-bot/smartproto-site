'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppLocale } from '@/lib/i18n/locales';
import { localeHomePath } from '@/lib/i18n/locales';

export type LocaleLinkMap = Record<AppLocale, string | null>;

type Ctx = {
  links: LocaleLinkMap;
  setArticleLinks: (links: Partial<LocaleLinkMap> | null) => void;
};

const LocaleSwitcherContext = createContext<Ctx | null>(null);

const HOME_LINKS: LocaleLinkMap = {
  ru: localeHomePath('ru'),
  en: localeHomePath('en'),
  tr: localeHomePath('tr'),
};

export function LocaleSwitcherProvider({ children }: { children: ReactNode }) {
  const [articleLinks, setArticleLinksState] = useState<Partial<LocaleLinkMap> | null>(null);

  const setArticleLinks = useCallback((links: Partial<LocaleLinkMap> | null) => {
    setArticleLinksState(links);
  }, []);

  const links = useMemo<LocaleLinkMap>(() => {
    if (!articleLinks) return HOME_LINKS;
    return {
      ru: articleLinks.ru ?? null,
      en: articleLinks.en ?? null,
      tr: articleLinks.tr ?? null,
    };
  }, [articleLinks]);

  const value = useMemo(() => ({ links, setArticleLinks }), [links, setArticleLinks]);

  return (
    <LocaleSwitcherContext.Provider value={value}>{children}</LocaleSwitcherContext.Provider>
  );
}

export function useLocaleSwitcher() {
  const ctx = useContext(LocaleSwitcherContext);
  if (!ctx) {
    return {
      links: HOME_LINKS,
      setArticleLinks: () => undefined,
    };
  }
  return ctx;
}
