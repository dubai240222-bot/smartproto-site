import type { Metadata } from 'next';
import { LocalizedHome } from '@/components/localized-home';
import { listPublishedLocalizations } from '@/data/localizations';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

const ui = LOCALE_UI.en;

export async function generateMetadata(): Promise<Metadata> {
  const hasContent = listPublishedLocalizations('en').length > 0;
  return {
    title: ui.siteTitle,
    description: ui.siteDescription,
    robots: hasContent ? { index: true, follow: true } : { index: false, follow: true },
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
}

export default function EnglishHomePage() {
  return <LocalizedHome language="en" />;
}
