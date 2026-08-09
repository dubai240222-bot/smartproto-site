import type { ImageMatchLevel } from '@/lib/collectors/image-match';
import { labelForMatchLevel } from '@/lib/collectors/image-match';

/** Small honest caption when illustration is not the exact product. */
export function ImageMatchCaption({
  level,
  label,
  className = '',
}: {
  level?: ImageMatchLevel | null;
  label?: string | null;
  className?: string;
}) {
  const text = label || labelForMatchLevel(level || undefined);
  if (!text) return null;
  return (
    <p
      className={`mt-2 text-[11px] font-medium tracking-wide text-[var(--muted)] ${className}`}
    >
      {text}
    </p>
  );
}
