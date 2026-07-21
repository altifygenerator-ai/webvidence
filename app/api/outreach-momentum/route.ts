import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalDayBounds, normalizeTimezoneOffset } from '@/lib/leads/timezone';

export async function GET(req: Request) {
  const user = await getViewer();
  if (!user || !user.workspaceId) {
    return NextResponse.json({ sentToday: 0, sentThisWeek: 0 }, { status: user ? 400 : 401 });
  }

  const url = new URL(req.url);
  const offset = normalizeTimezoneOffset(url.searchParams.get('tzOffset'));
  const now = new Date();
  const { start: startToday, end: endToday } = getLocalDayBounds(now, offset);
  const localClock = new Date(now.getTime() - offset * 60_000);
  const dayOfWeek = localClock.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startWeek = new Date(startToday.getTime() - daysFromMonday * 86_400_000);

  const db = createAdminClient();
  const [todayResult, weekResult] = await Promise.all([
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', user.workspaceId)
      .eq('status', 'sent')
      .neq('direction', 'inbound')
      .gte('sent_at', startToday.toISOString())
      .lte('sent_at', endToday.toISOString()),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', user.workspaceId)
      .eq('status', 'sent')
      .neq('direction', 'inbound')
      .gte('sent_at', startWeek.toISOString())
      .lte('sent_at', endToday.toISOString()),
  ]);

  if (todayResult.error || weekResult.error) {
    return NextResponse.json(
      { sentToday: 0, sentThisWeek: 0, error: 'Could not load outreach progress.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      sentToday: todayResult.count || 0,
      sentThisWeek: weekResult.count || 0,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
