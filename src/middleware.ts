import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CANONICAL_HOST = 'www.smartproto.net';

/**
 * SP-A-099 — expose request locale for SSR chrome.
 * SP-A-103 — apex → www permanent redirect so Google sees one host.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();

  // Production host split: smartproto.net and www must not both serve 200.
  if (host === 'smartproto.net') {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    return NextResponse.redirect(url, 308);
  }

  const p = request.nextUrl.pathname || '/';
  const locale =
    p === '/en' || p.startsWith('/en/')
      ? 'en'
      : p === '/tr' || p.startsWith('/tr/')
        ? 'tr'
        : 'ru';
  const response = NextResponse.next();
  response.headers.set('x-smartproto-locale', locale);
  // Hint for proxies / Search Console debugging
  if (host === CANONICAL_HOST || host.endsWith('.smartproto.net')) {
    response.headers.set('x-smartproto-canonical-host', CANONICAL_HOST);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|api/media|.*\\..*).*)'],
};
