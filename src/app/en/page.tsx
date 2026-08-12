import type { Metadata } from 'next';
import { LocalizedHome } from '@/components/localized-home';
import { LOCALE_UI } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SmartProto — English',
  description: LOCALE_UI.en.siteDescription,
  alternates: {
    canonical: '/en',
    languages: {
      'x-default': '/',
      ru: '/',
      en: '/en',
      tr: '/tr',
    },
  },
};

export default function EnglishHomePage() {
  return <LocalizedHome language="en" />;
}
