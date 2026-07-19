import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalDayBounds, normalizeTimezoneOffset } from '@/lib/leads/timezone';

export async function GET(req: Request) {
  const user = await getViewer();
  if (!user || !user.workspaceId) return NextResponse.json({ count: 0 }, { status: user ? 400 : 401 });

  const url = new URL(req.url);
  const offset = normalizeTimezoneOffset(url.searchParams.get('tzOffset'));
  const { end } = getLocalDayBounds(new Date(), offset);

  const db = createAdminClient();
  const { count, error } = await db.from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', user.workspaceId)
    .lte('next_follow_up_at', end.toISOString())
    .not('next_follow_up_at', 'is', null)
    .not('status', 'in', '(archived,do_not_contact,not_interested,won,lost)')
    .is('lead_outcome', null)
    .is('follow_up_stopped_at', null);

  if (error) return NextResponse.json({ count: 0, error: 'Could not load the pipeline attention count.' }, { status: 500 });
  return NextResponse.json({ count: count || 0 }, { headers: { 'cache-control': 'no-store' } });
}
