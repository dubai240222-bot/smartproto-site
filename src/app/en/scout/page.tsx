import type { Metadata } from 'next';
import { ScoutTipForm } from '@/components/scout-tip-form';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';

const ui = CONTACT_SCOUT_UI.en;

export const metadata: Metadata = {
  title: `${ui.scoutTitle} | SmartProto`,
  description: ui.scoutLead,
  alternates: {
    canonical: '/en/scout',
    languages: {
      'x-default': '/scout',
      ru: '/scout',
      en: '/en/scout',
      tr: '/tr/scout',
    },
  },
};

export default function ScoutEnPage() {
  return <ScoutTipForm locale="en" />;
}
