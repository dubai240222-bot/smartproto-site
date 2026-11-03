import type { MetadataRoute } from 'next';
import { getPublicSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

/**
 * SP-A-103 — allow article heroes under /api/media/ while keeping other /api/ private.
 * Google uses the longest matching prefix; Allow /api/media/ must coexist with Disallow /api/.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/media/'],
        disallow: ['/api/', '/editorial', '/editorial/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: new URL(baseUrl).host,
  };
}
