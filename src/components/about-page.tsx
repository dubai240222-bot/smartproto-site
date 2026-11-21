'use client';

import Link from 'next/link';
import type { AppLocale } from '@/lib/i18n/locales';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';
import { localePath } from '@/lib/site-contact';
import { RegisterLocaleLinks } from '@/components/register-locale-links';

export function AboutPage({ locale }: { locale: AppLocale }) {
  const ui = CONTACT_SCOUT_UI[locale];
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <RegisterLocaleLinks
        ru={localePath('ru', '/about')}
        en={localePath('en', '/about')}
        tr={localePath('tr', '/about')}
      />
      <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
        <Link href={localePath(locale, '/')} className="hover:text-[var(--accent)]">
          {ui.backHome}
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
        {ui.aboutTitle}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">{ui.aboutBody}</p>
      <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href={localePath(locale, '/contact')} className="text-[var(--accent)] hover:underline">
          {ui.footerContact}
        </Link>
        <Link href={localePath(locale, '/scout')} className="text-[var(--accent)] hover:underline">
          {ui.footerScout}
        </Link>
      </div>
    </main>
  );
}
