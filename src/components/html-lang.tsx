'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { detectLocaleFromPath } from '@/components/language-switcher';
import { LOCALE_UI } from '@/lib/i18n/locales';

/** Keeps <html lang> in sync with /en|/tr|RU routes (root layout defaults to ru). */
export function HtmlLang() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPath(pathname);

  useEffect(() => {
    const ui = LOCALE_UI[locale];
    document.documentElement.lang = ui.htmlLang;
    document.documentElement.setAttribute('data-locale', locale);
  }, [locale]);

  return null;
}
