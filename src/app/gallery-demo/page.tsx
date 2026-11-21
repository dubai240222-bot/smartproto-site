import { ArticleGallery } from '@/components/article-gallery';
import type { ArticleMediaSlide } from '@/lib/article-media';

/**
 * Internal QA — Bianchi-style gallery.
 * Uses existing production media that already has hero + secondary (no new assets).
 */
const DEMO_SLIDES: ArticleMediaSlide[] = [
  {
    url: '/api/media/a-game-studio-in-minutes-jiyi-soon-aims-to-redefine-game-creation-with-ai/hero.jpg',
    alt: 'Hero view',
    caption: 'Главный кадр',
  },
  {
    url: '/api/media/a-game-studio-in-minutes-jiyi-soon-aims-to-redefine-game-creation-with-ai/secondary.png',
    alt: 'Secondary angle',
    caption: 'Дополнительный ракурс',
  },
  {
    url: '/api/media/a-bamboo-armchair-glows-after-dark-without-electricity/hero.jpg',
    alt: 'Bamboo armchair',
    caption: 'Другой exact product frame (QA only)',
  },
];

export const metadata = {
  title: 'Gallery demo | SmartProto',
  robots: { index: false, follow: false },
};

export default function GalleryDemoPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        QA — Bianchi-style gallery
      </p>
      <h1 className="mb-6 font-serif text-2xl font-semibold text-[var(--text)]">
        Gallery interaction demo
      </h1>
      <ArticleGallery slides={DEMO_SLIDES} fallbackAlt="Gallery demo" priority />
      <p className="mt-8 text-sm text-[var(--muted)]">
        Hover thumbnails, click/tap to swap with hero (FLIP). Swipe hero on mobile. Not linked in
        public nav.
      </p>
    </main>
  );
}
