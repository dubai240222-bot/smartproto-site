'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AppLocale } from '@/lib/i18n/locales';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';
import { localePath, publicEditorialEmail, publicEditorialMailto } from '@/lib/site-contact';
import { RegisterLocaleLinks } from '@/components/register-locale-links';

export function ContactPage({ locale }: { locale: AppLocale }) {
  const ui = CONTACT_SCOUT_UI[locale];
  const email = publicEditorialEmail();
  const [copied, setCopied] = useState(false);

  const topics = [
    {
      title: ui.topicEditorial,
      desc: ui.topicEditorialDesc,
      subject:
        locale === 'en'
          ? 'Editorial question'
          : locale === 'tr'
            ? 'Editöryel soru'
            : 'Редакционный вопрос',
    },
    {
      title: ui.topicDev,
      desc: ui.topicDevDesc,
      subject:
        locale === 'en'
          ? 'Developer / startup tip'
          : locale === 'tr'
            ? 'Geliştirici / girişim'
            : 'Разработка / стартап',
    },
    {
      title: ui.topicPartner,
      desc: ui.topicPartnerDesc,
      subject:
        locale === 'en' ? 'Partnership' : locale === 'tr' ? 'Ortaklık' : 'Партнёрство',
    },
    {
      title: ui.topicAds,
      desc: ui.topicAdsDesc,
      subject:
        locale === 'en'
          ? 'Advertising / commercial'
          : locale === 'tr'
            ? 'Reklam / ticari'
            : 'Реклама / коммерция',
    },
  ];

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <RegisterLocaleLinks
        ru={localePath('ru', '/contact')}
        en={localePath('en', '/contact')}
        tr={localePath('tr', '/contact')}
      />
      <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
        <Link href={localePath(locale, '/')} className="hover:text-[var(--accent)]">
          {ui.backHome}
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
        {ui.contactTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">{ui.contactLead}</p>

      <section className="mt-8 border-t border-[var(--border)] pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {ui.contactEmailLabel}
        </p>
        <p className="mt-2 font-serif text-xl text-[var(--text)] sm:text-2xl">{email}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={copyEmail}
            className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
          >
            {copied ? ui.contactCopied : ui.contactCopy}
          </button>
          <a
            href={publicEditorialMailto()}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {ui.contactOpenMail}
          </a>
        </div>
      </section>

      <section className="mt-10 space-y-6">
        {topics.map((t) => (
          <div key={t.title} className="border-t border-[var(--border)] pt-5">
            <h2 className="font-serif text-lg font-semibold text-[var(--text)]">{t.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{t.desc}</p>
            <a
              href={publicEditorialMailto(t.subject)}
              className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              {email}
            </a>
          </div>
        ))}

        <div className="border-t border-[var(--border)] pt-5">
          <h2 className="font-serif text-lg font-semibold text-[var(--text)]">{ui.topicTip}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{ui.topicTipDesc}</p>
          <Link
            href={localePath(locale, '/scout')}
            className="mt-3 inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {ui.topicTipCta}
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-[var(--muted)]">{ui.socialLater}</p>
    </main>
  );
}
