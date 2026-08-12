import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { LocaleSwitcherProvider } from '@/components/locale-switcher-context';
import { getAllArticles } from '@/data/articles';
import { toLocaleSearchItems } from '@/data/localizations';
import { getPublicSiteUrl } from '@/lib/site-url';
import { LOCALE_UI } from '@/lib/i18n/locales';
import './globals.css';

const siteUrl = getPublicSiteUrl();
const ruUi = LOCALE_UI.ru;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'SmartProto — Цифровая газета о технологиях',
  description: ruUi.siteDescription,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'SmartProto — Цифровая газета о технологиях',
    description: ruUi.siteDescription,
    url: '/',
    siteName: 'SmartProto',
    type: 'website',
    locale: ruUi.ogLocale,
    images: [{ url: '/brand/smartproto-logo.png', alt: 'SmartProto' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmartProto — Цифровая газета о технологиях',
    description: ruUi.siteDescription,
    images: ['/brand/smartproto-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const articles = getAllArticles();
  const byId = new Map(articles.map((a) => [a.id, { category: a.category, publishedAt: a.publishedAt }]));
  const enItems = toLocaleSearchItems('en', byId);
  const trItems = toLocaleSearchItems('tr', byId);

  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme') || 'system';
                  var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-150">
        <LocaleSwitcherProvider>
          <Header ruArticles={articles} enItems={enItems} trItems={trItems} />
          <div className="flex-1">{children}</div>
          <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)] py-8 text-xs text-[var(--muted)]">
            <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
              <p className="font-serif text-sm font-bold text-[var(--text)]">SMARTPROTO</p>
              <p className="mt-1">{ruUi.tagline}</p>
              <div className="mt-4 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  {ruUi.footerEditorial}
                </p>
                <p>
                  <a href="/scout" className="text-[var(--text)] transition hover:text-[var(--accent)]">
                    {ruUi.footerScout}
                  </a>
                </p>
              </div>
              <p className="mt-4 text-[11px]">
                © {new Date().getFullYear()} SmartProto. {ruUi.footerRights}
              </p>
            </div>
          </footer>
        </LocaleSwitcherProvider>
      </body>
    </html>
  );
}
