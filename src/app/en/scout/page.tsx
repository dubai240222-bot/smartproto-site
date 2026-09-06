import type { Metadata } from 'next';
import { ScoutSubmitPage } from '@/components/scout-submit-page';
import { LOCALE_UI } from '@/lib/i18n/locales';

const ui = LOCALE_UI.en;

export const metadata: Metadata = {
  title: `${ui.scoutTitle} · SmartProto`,
  description: ui.scoutIntro,
};

export default function EnglishScoutPage() {
  return <ScoutSubmitPage locale="en" />;
}
