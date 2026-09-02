import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribeToken } from '@/lib/retention/unsubscribe';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = verifyUnsubscribeToken(url.searchParams.get('token') || '');
  if (!userId) return new NextResponse('This preference link is invalid or expired.', { status: 400 });
  const db = createAdminClient();
  await db.from('prospecting_routines').update({ reminder_emails_enabled: false, unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
  return NextResponse.redirect(new URL('/dashboard/settings?reminders=off', process.env.NEXT_PUBLIC_APP_URL || url.origin));
}
