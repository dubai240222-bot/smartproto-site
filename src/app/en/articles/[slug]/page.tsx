import type { Metadata } from 'next';
import {
  LocalizedArticlePage,
  localizedArticleMetadata,
} from '@/components/localized-article';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return localizedArticleMetadata('en', slug);
}

export default async function EnglishArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LocalizedArticlePage language="en" slug={slug} />;
}
