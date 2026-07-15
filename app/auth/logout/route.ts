import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/?signedOut=1', request.url), 303);
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Logout failed.' }, { status: 500 });
  }
}
