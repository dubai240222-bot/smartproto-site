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
        <footer className="mt-10 border-t border-[var(--border)] bg-[var(--surface)] py-5 text-xs text-[var(--muted)]">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-2 text-center sm:flex-row sm:px-4 lg:px-5 sm:text-left">
            <div>
              <p className="text-sm font-semibold tracking-tight text-[var(--text)]">SMARTPROTO</p>
              <p className="mt-0.5 font-normal">Технологии раньше мейнстрима</p>
            </div>
            <p className="text-[11px] font-normal">© {new Date().getFullYear()} SmartProto</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
