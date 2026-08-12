'use client';

import { usePathname } from 'next/navigation';
import { detectLocaleFromPath } from '@/components/language-switcher';
import { LOCALE_UI } from '@/lib/i18n/locales';

export function SiteFooter() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPath(pathname);
  const ui = LOCALE_UI[locale];

  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)] py-8 text-xs text-[var(--muted)]">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <p className="font-serif text-sm font-bold text-[var(--text)]">SMARTPROTO</p>
        <p className="mt-1">{ui.tagline}</p>
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {ui.footerEditorial}
          </p>
          <p>
            <a href="/scout" className="text-[var(--text)] transition hover:text-[var(--accent)]">
              {ui.footerScout}
            </a>
          </p>
        </div>
        <p className="mt-4 text-[11px]">
          © {new Date().getFullYear()} SmartProto. {ui.footerRights}
        </p>
      </div>
    </footer>
  );
}
