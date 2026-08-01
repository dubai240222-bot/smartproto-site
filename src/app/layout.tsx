import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'SmartProto — Цифровая газета о технологиях',
  description:
    'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
  openGraph: {
    title: 'SmartProto — Цифровая газета о технологиях',
    description:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
    url: '/',
    siteName: 'SmartProto',
    type: 'website',
    locale: 'ru_RU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmartProto — Цифровая газета о технологиях',
    description:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
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
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)] py-8 text-xs text-[var(--muted)]">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <p className="font-serif text-sm font-bold text-[var(--text)]">SMARTPROTO</p>
            <p className="mt-1">Технологии раньше, чем они станут мейнстримом</p>
            <p className="mt-4 text-[11px]">© {new Date().getFullYear()} SmartProto. Все права защищены.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
