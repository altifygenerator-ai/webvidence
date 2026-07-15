import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  status: z.enum([
    'new', 'reviewing', 'ready_to_contact', 'contacted', 'replied', 'interested', 'follow_up',
    'quote_sent', 'won', 'lost', 'not_interested', 'do_not_contact', 'archived',
  ]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const { id } = await context.params;
    const input = schema.parse(await req.json());
    const db = createAdminClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) update.status = input.status;
    if (input.notes !== undefined) update.notes = input.notes;
    if (input.nextFollowUpAt !== undefined) update.next_follow_up_at = input.nextFollowUpAt;
    if (input.status === 'contacted') update.last_contacted_at = new Date().toISOString();

    const { data, error } = await db.from('leads')
      .update(update)
      .eq('id', id)
      .eq('workspace_id', user.workspaceId)
      .select('id,status,notes,next_follow_up_at,last_contacted_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ lead: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid lead update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
