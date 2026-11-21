import type { Metadata } from 'next';
import { ContactPage } from '@/components/contact-page';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';

const ui = CONTACT_SCOUT_UI.ru;

export const metadata: Metadata = {
  title: `${ui.contactTitle} | SmartProto`,
  description: ui.contactLead,
  alternates: {
    canonical: '/contact',
    languages: {
      'x-default': '/contact',
      ru: '/contact',
      en: '/en/contact',
      tr: '/tr/contact',
    },
  },
};

export default function ContactRuPage() {
  return <ContactPage locale="ru" />;
}
