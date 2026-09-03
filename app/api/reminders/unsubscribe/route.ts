import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyReminderUnsubscribeToken } from '@/lib/retention/reminder-token';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('u') || '';
  const signature = url.searchParams.get('sig') || '';
  if (!userId || !signature || !verifyReminderUnsubscribeToken(userId, signature)) {
    return new NextResponse('This unsubscribe link is invalid.', { status: 400 });
  }
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from('prospecting_routines')
    .update({
      reminder_email_enabled: false,
      reminder_emails_enabled: false,
      unsubscribed_at: now,
      updated_at: now,
    })
    .eq('user_id', userId);
  if (error) return new NextResponse('Could not update reminder preferences.', { status: 500 });
  return new NextResponse('Webvidence email reminders are now turned off. You can turn them back on from Settings.', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export const POST = GET;
