import { EditorialHome } from '@/components/editorial-home';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  return <EditorialHome locale="ru" searchParams={params} />;
}
