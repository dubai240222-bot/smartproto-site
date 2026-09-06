import type { Metadata } from 'next';
import { EditorialHome } from '@/components/editorial-home';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

const ui = LOCALE_UI.tr;

export const metadata: Metadata = {
  title: ui.siteTitle,
  description: ui.siteDescription,
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

export default async function TurkishHomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  return <EditorialHome locale="tr" searchParams={params} />;
}
