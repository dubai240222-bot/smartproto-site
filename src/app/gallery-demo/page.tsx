import { ArticleGallery } from '@/components/article-gallery';
import type { ArticleMediaSlide } from '@/lib/article-media';

/** Internal QA — Bianchi-style gallery with 5 pilot images (not linked in nav). */
const DEMO_SLIDES: ArticleMediaSlide[] = [
  {
    url: '/api/media/pilot-dry-all-in-one-polychrom/hero.jpg',
    alt: 'Polychromatic LED display — hero view',
    caption: 'Общий вид: polychromatic LED module',
    credit: 'Pilot / SmartProto gallery QA',
  },
  {
    url: '/api/media/pilot-dry-all-in-one-polychrom/secondary.jpg',
    alt: 'Side angle',
    caption: 'Вид сбоку',
  },
  {
    url: '/api/media/pilot-dry-all-in-one-polychrom/gallery-01.jpg',
    alt: 'Detail — optics',
    caption: 'Оптика / subpixel structure',
  },
  {
    url: '/api/media/pilot-dry-all-in-one-polychrom/gallery-02.jpg',
    alt: 'Lab demo',
    caption: 'Демо в лаборатории',
  },
  {
    url: '/api/media/pilot-dry-all-in-one-polychrom/gallery-03.jpg',
    alt: 'Comparison panel',
    caption: 'Сравнение с conventional RGB',
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
        QA — Bianchi-style gallery (5 images)
      </p>
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text)]">
        Polychromatic LEDs — gallery demo
      </h1>
      <ArticleGallery slides={DEMO_SLIDES} fallbackAlt="Gallery demo" priority />
      <p className="mt-8 text-sm text-[var(--muted)]">
        Click a thumbnail: selected image rises to hero; previous hero takes its place. Swipe hero on
        mobile.
      </p>
    </main>
  );
}
