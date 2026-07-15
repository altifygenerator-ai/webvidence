import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/security/redirects';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'), '/dashboard');
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();

  let errorMessage = '';
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message || '';
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    errorMessage = error?.message || '';
  } else {
    errorMessage = 'The authentication link is missing required information.';
  }

  if (!errorMessage) return NextResponse.redirect(new URL(next, request.url));

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', `The authentication link could not be completed: ${errorMessage}`);
  loginUrl.searchParams.set('next', next);
  return NextResponse.redirect(loginUrl);
}
