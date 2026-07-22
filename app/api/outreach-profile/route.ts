import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  serviceDescription: z.string().trim().min(1).max(2000),
  targetCustomer: z.string().trim().min(1).max(1000),
  baseLocation: z.string().trim().min(1).max(240),
  typicalProjectRange: z.string().trim().min(1).max(500),
  outreachStyle: z.string().trim().min(1).max(3000),
  preferredChannels: z.string().trim().max(200).optional(),
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
    const { data: existing } = await db
      .from('outreach_profiles')
      .select('id')
      .eq('workspace_id', user.workspaceId)
      .eq('is_default', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      workspace_id: user.workspaceId,
      user_id: user.id,
      name: 'Default offer',
      service_description: input.serviceDescription,
      target_customer: input.targetCustomer,
      base_location: input.baseLocation,
      typical_project_range: input.typicalProjectRange,
      outreach_style: input.outreachStyle,
      preferred_channels: input.preferredChannels || null,
      is_default: true,
      updated_at: new Date().toISOString(),
    };

    const result = existing
      ? await db.from('outreach_profiles').update(payload).eq('id', existing.id).eq('workspace_id', user.workspaceId)
      : await db.from('outreach_profiles').insert(payload);
    if (result.error) return NextResponse.json({ error: 'The outreach profile could not be saved.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Check the profile fields and try again.' }, { status: 400 });
    return NextResponse.json({ error: 'Could not save the outreach profile.' }, { status: 500 });
  }
}
