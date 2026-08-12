import type { Metadata } from 'next';
import { LocalizedHome } from '@/components/localized-home';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SmartProto — Türkçe',
  description: LOCALE_UI.tr.siteDescription,
  alternates: {
    canonical: '/tr',
    languages: {
      'x-default': '/',
      ru: '/',
      en: '/en',
      tr: '/tr',
    },
  },
};

export default function TurkishHomePage() {
  return <LocalizedHome language="tr" />;
}
