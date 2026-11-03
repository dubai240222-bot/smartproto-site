import type { Metadata } from 'next';
import { LocalizedHome } from '@/components/localized-home';
import { listPublishedLocalizations } from '@/data/localizations';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

const ui = LOCALE_UI.tr;

export async function generateMetadata(): Promise<Metadata> {
  const hasContent = listPublishedLocalizations('tr').length > 0;
  return {
    title: ui.siteTitle,
    description: ui.siteDescription,
    robots: hasContent ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: '/tr',
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
      url: '/tr',
      siteName: 'SmartProto',
      locale: ui.ogLocale,
      type: 'website',
    },
  };
}

export default function TurkishHomePage() {
  return <LocalizedHome language="tr" />;
}
