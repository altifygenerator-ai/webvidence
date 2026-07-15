import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['archive', 'restore', 'delete', 'do_not_contact']),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const db = createAdminClient();

    if (input.action === 'delete') {
      const { data: owned } = await db.from('leads').select('id,status')
        .eq('workspace_id', user.workspaceId)
        .in('id', input.ids);
      const deletable = (owned || []).filter((lead) => lead.status === 'archived').map((lead) => lead.id);
      if (deletable.length !== input.ids.length) {
        return NextResponse.json({ error: 'Only archived leads can be permanently deleted.' }, { status: 409 });
      }
      const { error } = await db.from('leads').delete()
        .eq('workspace_id', user.workspaceId)
        .in('id', deletable);
      if (error) throw new Error(error.message);
      return NextResponse.json({ updated: deletable.length, action: input.action });
    }

    const status = input.action === 'archive'
      ? 'archived'
      : input.action === 'restore'
        ? 'new'
        : 'do_not_contact';
    const { data, error } = await db.from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('workspace_id', user.workspaceId)
      .in('id', input.ids)
      .select('id');
    if (error) throw new Error(error.message);

    return NextResponse.json({ updated: data?.length || 0, action: input.action });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Choose between 1 and 100 valid leads.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bulk update failed.' }, { status: 500 });
  }
}
