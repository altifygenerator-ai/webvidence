import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const patchSchema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(['active', 'paused', 'archived']),
});

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from('campaigns')
    .select('id,name,category,location,radius_miles,status,created_at,updated_at')
    .eq('workspace_id', user.workspaceId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaigns: data || [] });
}

export async function PATCH(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = patchSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db.from('campaigns')
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq('id', input.campaignId)
      .eq('workspace_id', user.workspaceId)
      .select('id,name,category,location,radius_miles,status,created_at,updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaign: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
