import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { rankActionableLead } from '@/lib/retention/session';
import { logApiUsage } from '@/lib/data/api-usage';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req);
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const db = createAdminClient();

    const { data: existing } = await db.from('prospecting_sessions')
      .select('id,status')
      .eq('user_id', user.id)
      .in('status', ['ready', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return NextResponse.json({ session: existing });

    const [{ data: routine }, { data: priorSessions }, { data: candidates, error: leadError }] = await Promise.all([
      db.from('prospecting_routines').select('session_size').eq('user_id', user.id).maybeSingle(),
      db.from('prospecting_sessions').select('id').eq('user_id', user.id).limit(1000),
      db.from('leads')
        .select('id,campaign_id,opportunity_score,reviews,rating,website,phone,business_status,created_at')
        .eq('workspace_id', user.workspaceId)
        .in('status', ['new', 'reviewing', 'ready_to_contact'])
        .is('passed_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    if (leadError) return NextResponse.json({ error: 'Prospects could not be loaded.' }, { status: 400 });
    const priorSessionIds = (priorSessions || []).map((session) => session.id);
    const { data: usedItems } = priorSessionIds.length
      ? await db.from('prospecting_session_items').select('lead_id').in('session_id', priorSessionIds).limit(5000)
      : { data: [] };
    const used = new Set((usedItems || []).map((item) => item.lead_id));
    const size = Math.max(1, Math.min(Number(routine?.session_size || 3), 10));
    const selected = (candidates || [])
      .filter((lead) => !used.has(lead.id))
      .sort((a, b) => rankActionableLead(b) - rankActionableLead(a))
      .slice(0, size);

    if (!selected.length) {
      return NextResponse.json({ error: 'No unworked prospects are ready. Find a market to prepare the next session.' }, { status: 409 });
    }

    const { data: session, error: sessionError } = await db.from('prospecting_sessions').insert({
      workspace_id: user.workspaceId,
      user_id: user.id,
      campaign_id: selected[0]?.campaign_id || null,
      status: 'ready',
      target_size: selected.length,
    }).select('id,status').single();
    if (sessionError) {
      const { data: raced } = await db.from('prospecting_sessions').select('id,status')
        .eq('user_id', user.id).in('status', ['ready', 'active']).limit(1).maybeSingle();
      if (raced) return NextResponse.json({ session: raced });
      throw sessionError;
    }

    const { error: itemError } = await db.from('prospecting_session_items').insert(
      selected.map((lead, index) => ({ session_id: session.id, lead_id: lead.id, position: index + 1 })),
    );
    if (itemError) {
      await db.from('prospecting_sessions').delete().eq('id', session.id);
      throw itemError;
    }

    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: 'session_prepared',
      metadata: { sessionId: session.id, size: selected.length },
    }).catch(() => undefined);

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Session preparation failed:', error);
    return NextResponse.json({ error: 'The session could not be prepared.' }, { status: 500 });
  }
}
