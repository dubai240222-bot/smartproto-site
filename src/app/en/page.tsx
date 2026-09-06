import type { Metadata } from 'next';
import { EditorialHome } from '@/components/editorial-home';
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

export default async function EnglishHomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  return <EditorialHome locale="en" searchParams={params} />;
}
