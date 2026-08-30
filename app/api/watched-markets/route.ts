import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({ campaignId: z.string().uuid(), action: z.enum(['watch', 'unwatch']) });

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from('watched_markets')
    .select('id,campaign_id,status,last_refreshed_at,next_refresh_at,last_new_prospect_count')
    .eq('user_id', user.id).eq('workspace_id', user.workspaceId).eq('status', 'active');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ watchedMarkets: data || [], freeLimit: user.plan === 'free' && !user.isAdmin ? 1 : null }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const db = createAdminClient();

    if (input.action === 'unwatch') {
      await db.from('watched_markets').delete().eq('campaign_id', input.campaignId).eq('user_id', user.id).eq('workspace_id', user.workspaceId);
      return NextResponse.json({ watched: false });
    }

    const { data: campaign } = await db.from('campaigns').select('id,status')
      .eq('id', input.campaignId).eq('workspace_id', user.workspaceId).maybeSingle();
    if (!campaign || campaign.status === 'archived') return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

    if (user.plan === 'free' && !user.isAdmin) {
      const { count } = await db.from('watched_markets').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('workspace_id', user.workspaceId).eq('status', 'active').neq('campaign_id', input.campaignId);
      if (Number(count || 0) >= 1) return NextResponse.json({ error: 'Free includes one watched market. Unwatch the current market before choosing another.' }, { status: 402 });
    }

    const { data, error } = await db.from('watched_markets').upsert({
      workspace_id: user.workspaceId, user_id: user.id, campaign_id: input.campaignId,
      status: 'active', next_refresh_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,campaign_id' }).select('id,campaign_id,status,next_refresh_at').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ watched: true, watchedMarket: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid watched-market request.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update watched market.' }, { status: 500 });
  }
}
