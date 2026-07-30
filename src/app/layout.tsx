import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'SmartProto - техно-новости и AI-дайджест',
  description:
    'SmartProto — редакционный сайт о ранних технологиях, прототипах, инженерных находках и AI-новостях.',
  openGraph: {
    title: 'SmartProto - техно-новости и AI-дайджест',
    description:
      'SmartProto — редакционный сайт о ранних технологиях, прототипах, инженерных находках и AI-новостях.',
    url: '/',
    siteName: 'SmartProto',
    type: 'website',
    locale: 'ru_RU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmartProto - техно-новости и AI-дайджест',
    description:
      'SmartProto — редакционный сайт о ранних технологиях, прототипах, инженерных находках и AI-новостях.',
  },
};

const marqueeText = 'Идут технические работы. SmartProto обновляется...';

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="min-h-screen bg-[#0a0a0a] text-gray-100">
        <div className="top-banner" role="status" aria-live="polite">
          <div className="top-banner__track" aria-hidden="true">
            <span>{marqueeText}</span>
            <span>{marqueeText}</span>
            <span>{marqueeText}</span>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
