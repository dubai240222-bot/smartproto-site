import Link from 'next/link';
import {
  buildStringerBoard,
  stringerKindLabel,
  type StringerRank,
} from '@/lib/editorial/stringer-board';

function publishesWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'публикация';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'публикации';
  return 'публикаций';
}

export async function StringerBoardSection({
  limit = 5,
  compact = true,
}: {
  limit?: number;
  compact?: boolean;
}) {
  let ranks: StringerRank[] = [];
  try {
    ranks = await buildStringerBoard(limit);
  } catch {
    ranks = [];
  }

  return (
    <section
      aria-label="Рейтинг внештатных журналистов"
      className={compact ? 'border-b border-[var(--border)] pb-4 sm:pb-5' : ''}
    >
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
            Внештатные журналисты
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            Рейтинг по опубликованным находкам — после проверки редакции
          </p>
        </div>
        {compact ? (
          <Link
            href="/stringers"
            className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            Весь рейтинг →
          </Link>
        ) : null}
      </div>

      {ranks.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Пока пусто —{' '}
          <Link href="/scout" className="text-[var(--accent)] hover:underline">
            пришлите первую находку
          </Link>
          , и после публикации имя появится здесь.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {ranks.map((r, i) => (
            <li key={r.key} className="flex items-baseline gap-3 py-2.5">
              <span className="w-6 shrink-0 text-right font-serif text-lg font-bold tabular-nums text-[var(--accent)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--text)]">{r.displayName}</p>
                <p className="text-[11px] text-[var(--muted)]">
                  {stringerKindLabel(r.kind, 'ru')}
                </p>
              </div>
              <p className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]">
                {r.publishedCount} {publishesWord(r.publishedCount)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
