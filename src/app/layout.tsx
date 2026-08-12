import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { getAllArticles } from '@/data/articles';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'SmartProto — Цифровая газета о технологиях',
  description:
    'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
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
    description:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
    url: '/',
    siteName: 'SmartProto',
    type: 'website',
    locale: 'ru_RU',
    images: [{ url: '/brand/smartproto-logo.png', alt: 'SmartProto' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmartProto — Цифровая газета о технологиях',
    description:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
    images: ['/brand/smartproto-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const articles = getAllArticles();
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
        <Header articles={articles} />
        <div className="flex-1">{children}</div>
        <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)] py-8 text-xs text-[var(--muted)]">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <p className="font-serif text-sm font-bold text-[var(--text)]">SMARTPROTO</p>
            <p className="mt-1">Технологии раньше, чем они станут мейнстримом</p>
            {/* SP-A-095 — public editorial paths. Email omitted until HQ configures one. */}
            <div className="mt-4 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                Редакция и сотрудничество
              </p>
              <p>
                <a href="/scout" className="text-[var(--text)] transition hover:text-[var(--accent)]">
                  Прислать находку → /scout
                </a>
              </p>
            </div>
            <p className="mt-4 text-[11px]">© {new Date().getFullYear()} SmartProto. Все права защищены.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
