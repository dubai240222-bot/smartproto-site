'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { detectLocaleFromPath } from '@/components/language-switcher';
import { LOCALE_UI } from '@/lib/i18n/locales';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';
import { localePath } from '@/lib/site-contact';

export function SiteFooter() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPath(pathname);
  const ui = LOCALE_UI[locale];
  const links = CONTACT_SCOUT_UI[locale];

  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)] py-8 text-xs text-[var(--muted)]">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <p className="font-serif text-sm font-bold text-[var(--text)]">SMARTPROTO</p>
        <p className="mt-1">{ui.tagline}</p>
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {ui.footerEditorial}
          </p>
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[var(--text)]"
            aria-label="Footer"
          >
            <Link
              href={localePath(locale, '/about')}
              className="transition hover:text-[var(--accent)]"
            >
              {links.footerAbout}
            </Link>
            <Link
              href={localePath(locale, '/contact')}
              className="transition hover:text-[var(--accent)]"
            >
              {links.footerContact}
            </Link>
            <Link
              href={localePath(locale, '/scout')}
              className="transition hover:text-[var(--accent)]"
            >
              {links.footerScout}
            </Link>
          </nav>
        </div>
        <p className="mt-4 text-[11px]">
          © {new Date().getFullYear()} SmartProto. {ui.footerRights}
        </p>
      </div>
    </footer>
  );
}
