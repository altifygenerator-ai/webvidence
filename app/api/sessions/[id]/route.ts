import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { PASS_REASONS } from '@/lib/retention/session';
import { logApiUsage } from '@/lib/data/api-usage';
import { completeSessionIfDone } from '@/lib/retention/progress';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('open'), itemId: z.string().uuid() }),
  z.object({ action: z.literal('pass'), itemId: z.string().uuid(), reason: z.enum(PASS_REASONS) }),
]);

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const { id } = await context.params;
    const db = createAdminClient();
    const { data: session } = await db.from('prospecting_sessions')
      .select('id,status,user_id')
      .eq('id', id).eq('workspace_id', user.workspaceId).eq('user_id', user.id).maybeSingle();
    if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    if (session.status === 'completed') return NextResponse.json({ session, completed: true });

    const now = new Date().toISOString();
    if (input.action === 'start') {
      const { data, error } = await db.from('prospecting_sessions').update({
        status: 'active', started_at: now, updated_at: now,
      }).eq('id', id).in('status', ['ready', 'active']).select('id,status').single();
      if (error) throw error;
      await event(db, { id: user.id, workspaceId: user.workspaceId! }, 'session_started', { sessionId: id });
      return NextResponse.json({ session: data });
    }

    const { data: item } = await db.from('prospecting_session_items')
      .select('id,lead_id,status').eq('id', input.itemId).eq('session_id', id).maybeSingle();
    if (!item) return NextResponse.json({ error: 'Session prospect not found.' }, { status: 404 });

    if (input.action === 'open') {
      if (item.status === 'ready') {
        await db.from('prospecting_session_items').update({ status: 'working', opened_at: now }).eq('id', item.id);
        await db.from('leads').update({
          first_reviewed_at: now, last_worked_at: now, updated_at: now,
        }).eq('id', item.lead_id).is('first_reviewed_at', null);
        await db.from('lead_work_events').insert({
          workspace_id: user.workspaceId, user_id: user.id, lead_id: item.lead_id,
          session_id: id, event_type: 'reviewed',
        });
        await event(db, { id: user.id, workspaceId: user.workspaceId! }, 'lead_work_started', { sessionId: id, leadId: item.lead_id });
      }
      return NextResponse.json({ ok: true });
    }

    if (item.status === 'contacted' || item.status === 'passed') return NextResponse.json({ ok: true });
    await db.from('prospecting_session_items').update({
      status: 'passed', pass_reason: input.reason, completed_at: now,
    }).eq('id', item.id);
    await db.from('leads').update({
      pass_reason: input.reason, passed_at: now, last_worked_at: now, status: 'archived', updated_at: now,
    }).eq('id', item.lead_id).eq('workspace_id', user.workspaceId);
    await db.from('lead_work_events').insert({
      workspace_id: user.workspaceId, user_id: user.id, lead_id: item.lead_id,
      session_id: id, event_type: 'passed', metadata: { reason: input.reason },
    });
    await event(db, { id: user.id, workspaceId: user.workspaceId! }, 'lead_passed', { sessionId: id, leadId: item.lead_id, reason: input.reason });

    const completed = await completeSessionIfDone(db, id, { id: user.id, workspaceId: user.workspaceId! });
    return NextResponse.json({ ok: true, completed });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid session action.' }, { status: 400 });
    console.error('Session update failed:', error);
    return NextResponse.json({ error: 'The session could not be updated.' }, { status: 500 });
  }
}

async function event(db: ReturnType<typeof createAdminClient>, user: { id: string; workspaceId: string }, operation: string, metadata: Record<string, unknown>) {
  await logApiUsage({
    workspaceId: user.workspaceId, userId: user.id, provider: 'webvidence_event', operation, metadata,
  }).catch(() => undefined);
}
