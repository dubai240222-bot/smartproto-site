import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Header } from '@/components/header';
import { HtmlLang } from '@/components/html-lang';
import { LocaleSwitcherProvider } from '@/components/locale-switcher-context';
import { SiteFooter } from '@/components/site-footer';
import { getAllArticles } from '@/data/articles';
import { toLocaleSearchItems } from '@/data/localizations';
import { getPublicSiteUrl } from '@/lib/site-url';
import { isAppLocale, LOCALE_UI, type AppLocale } from '@/lib/i18n/locales';
import './globals.css';

const siteUrl = getPublicSiteUrl();
const ruUi = LOCALE_UI.ru;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: ruUi.siteTitle,
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
    title: ruUi.siteTitle,
    description: ruUi.siteDescription,
    url: '/',
    siteName: 'SmartProto',
    type: 'website',
    locale: ruUi.ogLocale,
    images: [{ url: '/brand/smartproto-logo.png', alt: 'SmartProto' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: ruUi.siteTitle,
    description: ruUi.siteDescription,
    images: ['/brand/smartproto-logo.png'],
  },
};

async function requestLocale(): Promise<AppLocale> {
  try {
    const h = await headers();
    const raw = (h.get('x-smartproto-locale') || 'ru').toLowerCase();
    return isAppLocale(raw) ? raw : 'ru';
  } catch {
    return 'ru';
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await requestLocale();
  const ui = LOCALE_UI[locale];
  const articles = getAllArticles();
  const byId = new Map(
    articles.map((a) => [a.id, { category: a.category, publishedAt: a.publishedAt }]),
  );

  // SP-A-099 — ship only the active locale search corpus (no cross-language HTML payload).
  const ruArticles = locale === 'ru' ? articles : [];
  const enItems = locale === 'en' ? toLocaleSearchItems('en', byId) : [];
  const trItems = locale === 'tr' ? toLocaleSearchItems('tr', byId) : [];

  return (
    <html lang={ui.htmlLang} className="h-full antialiased" suppressHydrationWarning data-locale={locale}>
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
          <HtmlLang />
          <Header ruArticles={ruArticles} enItems={enItems} trItems={trItems} />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </LocaleSwitcherProvider>
      </body>
    </html>
  );
}
