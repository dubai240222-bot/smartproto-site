'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import { Expand } from 'lucide-react';
import type { ArticleMediaSlide } from '@/lib/article-media';

type ArticleGalleryProps = {
  slides: ArticleMediaSlide[];
  /** Shown when slide has no caption (accessibility). */
  fallbackAlt: string;
  priority?: boolean;
};

const SWAP_MS = 220;
const THUMB_MS = '180ms';

function swapSlides(list: ArticleMediaSlide[], thumbIndex: number): ArticleMediaSlide[] {
  const swapAt = thumbIndex + 1;
  if (swapAt >= list.length) return list;
  const next = [...list];
  [next[0], next[swapAt]] = [next[swapAt], next[0]];
  return next;
}

/** FLIP animation for images keyed by stable url. */
function useFlipAnimation(flipTick: number) {
  const nodeMap = useRef(new Map<string, HTMLElement>());
  const firstRects = useRef(new Map<string, DOMRect>());
  const flipPending = useRef(false);
  const animating = useRef(false);

  const register =
    (url: string): RefCallback<HTMLElement> =>
    (node) => {
      if (node) nodeMap.current.set(url, node);
      else nodeMap.current.delete(url);
    };

  const capture = useCallback(() => {
    firstRects.current.clear();
    for (const [url, node] of nodeMap.current) {
      firstRects.current.set(url, node.getBoundingClientRect());
    }
  }, []);

  const play = useCallback(() => {
    if (animating.current) return;
    animating.current = true;
    window.setTimeout(() => {
      animating.current = false;
    }, SWAP_MS + 40);

    for (const [url, node] of nodeMap.current) {
      const first = firstRects.current.get(url);
      if (!first) continue;
      const last = node.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = first.width / Math.max(last.width, 1);
      const sy = first.height / Math.max(last.height, 1);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) {
        continue;
      }
      node.style.transformOrigin = 'top left';
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      node.offsetHeight;
      node.style.transition = `transform ${SWAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      node.style.transform = '';
      const cleanup = () => {
        node.style.transition = '';
        node.style.transformOrigin = '';
        node.removeEventListener('transitionend', cleanup);
      };
      node.addEventListener('transitionend', cleanup);
    }
    firstRects.current.clear();
  }, []);

  const markFlip = useCallback(() => {
    flipPending.current = true;
  }, []);

  useLayoutEffect(() => {
    if (!flipPending.current) return;
    flipPending.current = false;
    play();
  }, [flipTick, play]);

  return { register, capture, markFlip, isAnimating: () => animating.current };
}

/**
 * SP-A-102 / Bianchi-style gallery — hero + tight thumbnail strip.
 * Click/tap thumbnail → images swap places (FLIP), not just src swap.
 * Single image: parent renders ArticleHeroImage; this returns null for ≤1 slide.
 */
export function ArticleGallery({ slides, fallbackAlt, priority = false }: ArticleGalleryProps) {
  const [items, setItems] = useState(slides);
  const [flipTick, setFlipTick] = useState(0);
  const [activeThumb, setActiveThumb] = useState<number | null>(null);
  const heroTouchX = useRef<number | null>(null);
  const { register, capture, markFlip, isAnimating } = useFlipAnimation(flipTick);

  useEffect(() => {
    setItems(slides);
  }, [slides]);

  const total = items.length;
  const hero = items[0];
  const thumbs = items.slice(1);

  const selectThumb = useCallback(
    (thumbIndex: number) => {
      if (isAnimating()) return;
      capture();
      markFlip();
      setFlipTick((t) => t + 1);
      setItems((prev) => swapSlides(prev, thumbIndex));
      setActiveThumb(null);
    },
    [capture, isAnimating, markFlip],
  );

  const swipeHero = useCallback(
    (deltaX: number) => {
      if (total <= 2 || isAnimating()) return;
      if (Math.abs(deltaX) < 48) return;
      if (deltaX < 0) {
        selectThumb(0);
      } else {
        selectThumb(thumbs.length - 1);
      }
    },
    [isAnimating, selectThumb, thumbs.length, total],
  );

  useEffect(() => {
    if (total <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') swipeHero(48);
      if (e.key === 'ArrowRight') swipeHero(-48);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swipeHero, total]);

  if (total <= 1 || !hero) return null;

  return (
    <figure className="article-gallery my-6 w-full">
      <div className="gallery-panel overflow-hidden bg-[var(--surface)]">
        {/* Hero — minimal gap to thumb strip */}
        <div
          className="gallery-hero relative w-full overflow-hidden"
          onTouchStart={(e) => {
            heroTouchX.current = e.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = heroTouchX.current;
            const end = e.changedTouches[0]?.clientX;
            heroTouchX.current = null;
            if (start == null || end == null) return;
            swipeHero(end - start);
          }}
        >
          <div
            ref={register(hero.url)}
            className="gallery-hero-inner aspect-[16/10] w-full sm:aspect-[16/9]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.url}
              alt={hero.alt || fallbackAlt}
              width={1600}
              height={900}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/10"
            aria-hidden
          />
        </div>

        {/* Thumbnails — flush under hero, shared panel */}
        <div className="relative">
          <p
            className="pointer-events-none absolute -top-5 right-0 z-10 hidden text-[10px] font-medium tracking-wide text-[var(--muted)] opacity-70 sm:block"
            aria-hidden
          >
            Посмотреть фото
          </p>
          <div
            className={`gallery-thumbs flex gap-px bg-black/10 sm:gap-0.5 ${
              thumbs.length > 4 ? 'overflow-x-auto snap-x snap-mandatory' : ''
            }`}
            role="list"
            aria-label="Gallery thumbnails — click to swap with hero"
          >
            {thumbs.map((slide, i) => (
              <button
                key={slide.url}
                type="button"
                role="listitem"
                aria-label={`Открыть фото ${i + 2} из ${total}`}
                aria-pressed={activeThumb === i}
                onClick={() => selectThumb(i)}
                onPointerDown={() => setActiveThumb(i)}
                onPointerUp={() => setActiveThumb((prev) => (prev === i ? null : prev))}
                onPointerLeave={() => setActiveThumb((prev) => (prev === i ? null : prev))}
                onPointerCancel={() => setActiveThumb((prev) => (prev === i ? null : prev))}
                className={`gallery-thumb group relative block h-16 min-w-0 shrink-0 cursor-pointer overflow-hidden bg-[var(--surface)] transition-[transform,box-shadow,filter] duration-[180ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] motion-reduce:transition-none md:h-[5.5rem] sm:h-20 ${
                  thumbs.length > 4 ? 'w-[28%] min-w-[5.5rem] snap-start' : 'min-w-0 flex-1'
                } hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:brightness-105 active:scale-[0.97] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.15)] active:brightness-95`}
                style={{ transitionDuration: THUMB_MS }}
              >
                <div
                  ref={register(slide.url)}
                  className="h-full w-full transition-transform duration-[180ms] ease-out group-hover:scale-[1.02] group-active:scale-[0.98] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span
                  className="pointer-events-none absolute inset-0 ring-inset ring-black/0 transition-[box-shadow,ring-color] duration-[180ms] group-hover:ring-1 group-hover:ring-white/40 group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)] group-active:ring-black/20 motion-reduce:transition-none"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-sm bg-black/45 text-white opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:opacity-70"
                  aria-hidden
                >
                  <Expand className="h-3 w-3" strokeWidth={2.25} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(hero.caption || hero.credit) && (
        <figcaption className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          {hero.caption}
          {hero.credit ? (
            <span className="mt-0.5 block text-[11px] opacity-80">{hero.credit}</span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}

/** Single hero when gallery has only one slide. */
export function ArticleHeroImage({
  slide,
  fallbackAlt,
  priority = false,
  compactFallback = false,
}: {
  slide: ArticleMediaSlide;
  fallbackAlt: string;
  priority?: boolean;
  compactFallback?: boolean;
}) {
  return (
    <figure className={compactFallback ? 'my-5' : 'my-6'}>
      <div className="overflow-hidden bg-[var(--surface)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.url}
          alt={slide.alt || fallbackAlt}
          width={1600}
          height={compactFallback ? 700 : 800}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`w-full object-cover ${compactFallback ? 'aspect-[16/7]' : 'aspect-[16/9]'}`}
        />
      </div>
      {slide.caption ? (
        <figcaption className="mt-2 text-[12px] text-[var(--muted)]">{slide.caption}</figcaption>
      ) : null}
    </figure>
  );
}
