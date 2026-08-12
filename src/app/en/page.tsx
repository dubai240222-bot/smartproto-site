import type { Metadata } from 'next';
import { LocalizedHome } from '@/components/localized-home';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

const ui = LOCALE_UI.en;

export const metadata: Metadata = {
  title: ui.siteTitle,
  description: ui.siteDescription,
  alternates: {
    canonical: '/en',
    languages: {
      'x-default': '/',
      ru: '/',
      en: '/en',
      tr: '/tr',
    },
  },
  openGraph: {
    title: ui.siteTitle,
    description: ui.siteDescription,
    url: '/en',
    siteName: 'SmartProto',
    locale: ui.ogLocale,
    type: 'website',
  },
};

export default function EnglishHomePage() {
  return <LocalizedHome language="en" />;
}
