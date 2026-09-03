import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { rankActionableLead } from '@/lib/retention/session';
import { logApiUsage } from '@/lib/data/api-usage';
import { distanceMiles } from '@/lib/providers/google-places';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  source: z.enum(['today', 'search']).default('today'),
  campaignId: z.string().uuid().optional(),
});

type ProspectingArea = {
  location: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
};

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req);
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const db = createAdminClient();
    const requestInput = requestSchema.parse(await req.json().catch(() => ({})));
    const explicitSearchCampaignId = requestInput.source === 'search' ? requestInput.campaignId : undefined;

    const { data: existing } = await db.from('prospecting_sessions')
      .select('id,status')
      .eq('user_id', user.id)
      .eq('workspace_id', user.workspaceId)
      .in('status', ['ready', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: nextItem } = await db.from('prospecting_session_items')
        .select('lead_id')
        .eq('session_id', existing.id)
        .eq('workspace_id', user.workspaceId)
        .in('status', ['ready', 'working'])
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({
        session: existing,
        href: nextItem?.lead_id ? `/dashboard/leads/${nextItem.lead_id}?session=${existing.id}#outreach` : '/dashboard',
      });
    }

    let candidateQuery = db.from('leads')
      .select('id,campaign_id,opportunity_score,reviews,rating,website,phone,business_status,created_at,latitude,longitude')
      .eq('workspace_id', user.workspaceId)
      .in('status', ['new', 'reviewing', 'ready_to_contact'])
      .is('passed_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (explicitSearchCampaignId) candidateQuery = candidateQuery.eq('campaign_id', explicitSearchCampaignId);

    const [{ data: routine }, { data: priorSessions }, { data: candidates, error: leadError }] = await Promise.all([
      db.from('prospecting_routines')
        .select('session_size,prospecting_area_location,prospecting_area_center_lat,prospecting_area_center_lng,prospecting_area_radius_miles')
        .eq('user_id', user.id)
        .eq('workspace_id', user.workspaceId)
        .maybeSingle(),
      db.from('prospecting_sessions').select('id').eq('user_id', user.id).eq('workspace_id', user.workspaceId).limit(1000),
      candidateQuery,
    ]);

    if (leadError) return NextResponse.json({ error: 'Prospects could not be loaded.' }, { status: 400 });

    const priorSessionIds = (priorSessions || []).map((session) => session.id);
    const { data: usedItems } = priorSessionIds.length
      ? await db.from('prospecting_session_items').select('lead_id').in('session_id', priorSessionIds).limit(5000)
      : { data: [] };

    const used = new Set((usedItems || []).map((item) => item.lead_id));
    const size = Math.max(1, Math.min(Number(routine?.session_size || 3), 10));
    const area = explicitSearchCampaignId ? null : getProspectingArea(routine);
    const selected = (candidates || [])
      .filter((lead) => !used.has(lead.id))
      .filter((lead) => !area || leadInsideArea(lead, area))
      .sort((a, b) => rankActionableLead(b) - rankActionableLead(a))
      .slice(0, size);

    if (!selected.length) {
      const error = explicitSearchCampaignId
        ? 'No unworked prospects remain in this search. Try another market or return to Today.'
        : area
          ? `You're caught up inside ${shortAreaLabel(area.location)} (${area.radiusMiles} mi). Webvidence will keep watching that area for new prospects.`
          : 'No unworked prospects are ready. Find a market to prepare the next session.';
      return NextResponse.json({ error, caughtUp: true, prospectingArea: area?.location || null }, { status: 409 });
    }

    const { data: session, error: sessionError } = await db.from('prospecting_sessions').insert({
      workspace_id: user.workspaceId,
      user_id: user.id,
      campaign_id: selected[0]?.campaign_id || null,
      status: 'ready',
      source: requestInput.source,
      target_size: selected.length,
    }).select('id,status').single();

    if (sessionError) {
      const { data: raced } = await db.from('prospecting_sessions').select('id,status')
        .eq('user_id', user.id).eq('workspace_id', user.workspaceId).in('status', ['ready', 'active']).limit(1).maybeSingle();
      if (raced) {
        const { data: racedItem } = await db.from('prospecting_session_items').select('lead_id')
          .eq('session_id', raced.id).eq('workspace_id', user.workspaceId).in('status', ['ready', 'working']).order('position').limit(1).maybeSingle();
        return NextResponse.json({ session: raced, href: racedItem?.lead_id ? `/dashboard/leads/${racedItem.lead_id}?session=${raced.id}#outreach` : '/dashboard' });
      }
      throw sessionError;
    }

    const { error: itemError } = await db.from('prospecting_session_items').insert(
      selected.map((lead, index) => ({
        session_id: session.id,
        workspace_id: user.workspaceId,
        user_id: user.id,
        lead_id: lead.id,
        position: index + 1,
        status: 'ready',
      })),
    );

    if (itemError) {
      await db.from('prospecting_sessions').delete().eq('id', session.id).eq('workspace_id', user.workspaceId);
      throw itemError;
    }

    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: 'session_prepared',
      metadata: {
        sessionId: session.id,
        size: selected.length,
        prospectingArea: area?.location || null,
        prospectingRadiusMiles: area?.radiusMiles || null,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      session,
      href: `/dashboard/leads/${selected[0].id}?session=${session.id}#outreach`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid session request.' }, { status: 400 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Session preparation failed:', error);
    return NextResponse.json({ error: 'The session could not be prepared.' }, { status: 500 });
  }
}

function getProspectingArea(routine: Record<string, unknown> | null): ProspectingArea | null {
  if (!routine) return null;
  const location = typeof routine.prospecting_area_location === 'string' ? routine.prospecting_area_location : '';
  const latitude = Number(routine.prospecting_area_center_lat);
  const longitude = Number(routine.prospecting_area_center_lng);
  const radiusMiles = Number(routine.prospecting_area_radius_miles || 25);
  if (!location || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusMiles)) return null;
  return { location, latitude, longitude, radiusMiles };
}

function leadInsideArea(lead: { latitude?: number | null; longitude?: number | null }, area: ProspectingArea) {
  if (typeof lead.latitude !== 'number' || typeof lead.longitude !== 'number') return false;
  return distanceMiles(
    { latitude: area.latitude, longitude: area.longitude },
    { latitude: lead.latitude, longitude: lead.longitude },
  ) <= area.radiusMiles + 0.25;
}

function shortAreaLabel(value: string) {
  return value.split(',').slice(0, 2).join(',').trim() || value;
}
