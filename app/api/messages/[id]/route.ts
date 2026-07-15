import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(10000).optional(),
  status: z.enum(['draft', 'approved', 'sent', 'received', 'failed']).optional(),
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
    const update: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
    if (input.status === 'approved') update.approved_at = new Date().toISOString();
    if (input.status === 'sent') {
      update.sent_at = new Date().toISOString();
      update.direction = 'outbound';
    }

    const db = createAdminClient();
    const { data, error } = await db.from('messages')
      .update(update)
      .eq('id', id)
      .eq('workspace_id', user.workspaceId)
      .select('id,lead_id,channel,subject,body,status,created_at,updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (input.status === 'sent') {
      await db.from('leads').update({
        status: 'contacted',
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', data.lead_id).eq('workspace_id', user.workspaceId);
    }

    return NextResponse.json({ message: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid message update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
