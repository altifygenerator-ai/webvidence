import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
