import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** SP-A-099 — expose request locale for SSR chrome (html lang + search corpus). */
export function middleware(request: NextRequest) {
  const p = request.nextUrl.pathname || '/';
  const locale =
    p === '/en' || p.startsWith('/en/')
      ? 'en'
      : p === '/tr' || p.startsWith('/tr/')
        ? 'tr'
        : 'ru';
  const response = NextResponse.next();
  response.headers.set('x-smartproto-locale', locale);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|api/media|.*\\..*).*)'],
};
