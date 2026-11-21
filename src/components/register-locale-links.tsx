'use client';

import { useEffect } from 'react';
import { useLocaleSwitcher } from '@/components/locale-switcher-context';

/** Register RU/EN/TR equivalents for the language switcher on static chrome pages. */
export function RegisterLocaleLinks({
  ru,
  en,
  tr,
}: {
  ru: string;
  en: string;
  tr: string;
}) {
  const { setArticleLinks } = useLocaleSwitcher();
  useEffect(() => {
    setArticleLinks({ ru, en, tr });
    return () => setArticleLinks(null);
  }, [ru, en, tr, setArticleLinks]);
  return null;
}
