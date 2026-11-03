import Link from 'next/link';
import { StringerBoardSection } from '@/components/stringer-board';
import { TipCtaBanner } from '@/components/tip-cta-banner';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Внештатные журналисты — SmartProto',
  description:
    'Рейтинг внештатных корреспондентов и читателей-разведчиков SmartProto по опубликованным находкам.',
};

export default function StringersPage() {
  return (
    <>
      <TipCtaBanner locale="ru" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--accent)]">
            ← SmartProto
          </Link>
        </p>
        <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
          Рейтинг внештатных
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          В список попадают только те, чьи находки или материалы прошли редакцию и были
          опубликованы. Сырой спам и отклонённые ссылки сюда не считаются.
        </p>
        <div className="mt-8">
          <StringerBoardSection limit={40} compact={false} />
        </div>
      </main>
    </>
  );
}
