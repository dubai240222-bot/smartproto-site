import type { Metadata } from 'next';
import { AboutPage } from '@/components/about-page';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';

const ui = CONTACT_SCOUT_UI.ru;

export const metadata: Metadata = {
  title: `${ui.aboutTitle} | SmartProto`,
  description: ui.aboutBody,
  alternates: {
    canonical: '/about',
    languages: {
      'x-default': '/about',
      ru: '/about',
      en: '/en/about',
      tr: '/tr/about',
    },
  },
};

export default function AboutRuPage() {
  return <AboutPage locale="ru" />;
}
