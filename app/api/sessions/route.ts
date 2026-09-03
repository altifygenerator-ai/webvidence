import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { rankActionableLead } from '@/lib/retention/session';
import { logApiUsage } from '@/lib/data/api-usage';
import { sessionLeadHref } from '@/lib/navigation/prospect-flow';
import { distanceFromProspectingArea, getProspectingArea, leadInsideProspectingArea, shortProspectingAreaLabel } from '@/lib/retention/prospecting-area';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  source: z.enum(['today', 'search']).default('today'),
  campaignId: z.string().uuid().optional(),
});

type SessionLead = {
  id: string;
  campaign_id: string | null;
  opportunity_score: number | null;
  reviews: number | null;
  rating: number | null;
  website: string | null;
  phone: string | null;
  business_status: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
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

    const { data: routine, error: routineError } = await db.from('prospecting_routines')
      .select('session_size,prospecting_area_location,prospecting_area_center_lat,prospecting_area_center_lng,prospecting_area_radius_miles')
      .eq('user_id', user.id)
      .eq('workspace_id', user.workspaceId)
      .maybeSingle();
    if (routineError) throw routineError;

    const area = explicitSearchCampaignId ? null : getProspectingArea(routine);

    const { data: existing } = await db.from('prospecting_sessions')
      .select('id,status,campaign_id,source,started_at')
      .eq('user_id', user.id)
      .eq('workspace_id', user.workspaceId)
      .in('status', ['ready', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: remainingItems } = await db.from('prospecting_session_items')
        .select('lead_id,status,position,leads(latitude,longitude)')
        .eq('session_id', existing.id)
        .eq('workspace_id', user.workspaceId)
        .in('status', ['ready', 'working'])
        .order('position', { ascending: true });

      const firstRemaining = (remainingItems || [])[0];
      const existingFitsArea = !area || (remainingItems || []).every((item) => {
        const lead = Array.isArray(item.leads) ? item.leads[0] ?? null : item.leads;
        return Boolean(lead && leadInsideProspectingArea(lead, area));
      });

      // Replace only untouched prepared work when its geography no longer matches
      // Today, or when the user explicitly starts a different saved market. Never
      // discard an active/in-progress session.
      const replaceStaleReadyAutomaticSession = requestInput.source === 'today'
        && ['today', 'watched_market', 'reminder'].includes(existing.source)
        && existing.status === 'ready'
        && ((area && !existingFitsArea) || !area);
      const replaceReadySessionForExplicitMarket = Boolean(explicitSearchCampaignId)
        && existing.status === 'ready'
        && existing.campaign_id !== explicitSearchCampaignId;

      if (replaceStaleReadyAutomaticSession || replaceReadySessionForExplicitMarket) {
        await db.from('prospecting_sessions').update({
          status: 'abandoned',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id).eq('workspace_id', user.workspaceId).eq('status', 'ready');
      } else {
        return NextResponse.json({
          session: existing,
          href: firstRemaining?.lead_id
            ? sessionLeadHref({ leadId: firstRemaining.lead_id, sessionId: existing.id, campaignId: existing.campaign_id })
            : '/dashboard',
        });
      }
    }

    // Today should never silently pull from every location the account has ever
    // searched. A manual Find session is already scoped to its saved market;
    // automatic Today sessions require an explicit geographic guardrail.
    if (!explicitSearchCampaignId && !area) {
      return NextResponse.json({
        error: 'Set your automatic prospecting area before starting a Today session. Manual Find sessions can still use any market.',
        caughtUp: false,
        needsProspectingArea: true,
      }, { status: 409 });
    }

    let candidateQuery = db.from('leads')
      .select('id,campaign_id,opportunity_score,reviews,rating,website,phone,business_status,created_at,latitude,longitude')
      .eq('workspace_id', user.workspaceId)
      .in('status', ['new', 'reviewing', 'ready_to_contact'])
      .is('passed_at', null)
      .is('first_contacted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (explicitSearchCampaignId) candidateQuery = candidateQuery.eq('campaign_id', explicitSearchCampaignId);

    const [{ data: priorSessions }, { data: candidates, error: leadError }] = await Promise.all([
      db.from('prospecting_sessions').select('id').eq('user_id', user.id).eq('workspace_id', user.workspaceId).limit(1000),
      candidateQuery,
    ]);

    if (leadError) return NextResponse.json({ error: 'Prospects could not be loaded.' }, { status: 400 });

    const priorSessionIds = (priorSessions || []).map((session) => session.id);
    const { data: workedItems } = priorSessionIds.length
      ? await db.from('prospecting_session_items')
        .select('lead_id')
        .in('session_id', priorSessionIds)
        .in('status', ['contacted', 'passed'])
        .limit(5000)
      : { data: [] };

    const worked = new Set((workedItems || []).map((item) => item.lead_id));
    const size = Math.max(1, Math.min(Number(routine?.session_size || 3), 10));
    const selected = ((candidates || []) as SessionLead[])
      .filter((lead) => !worked.has(lead.id))
      .filter((lead) => !area || leadInsideProspectingArea(lead, area))
      .sort((a, b) => {
        const actionability = rankActionableLead(b) - rankActionableLead(a);
        if (actionability !== 0 || !area) return actionability;
        return distanceFromProspectingArea(a, area) - distanceFromProspectingArea(b, area);
      })
      .slice(0, size);

    if (!selected.length) {
      const error = explicitSearchCampaignId
        ? 'No unworked prospects remain in this search. Try another market or return to Today.'
        : `You're caught up inside ${shortProspectingAreaLabel(area!.location)} (${area!.radiusMiles} mi). Watch a saved market or run Find when you want Webvidence to surface more businesses there.`;
      return NextResponse.json({ error, caughtUp: true, prospectingArea: area?.location || null }, { status: 409 });
    }

    // A session can only promise a "Back to market" destination when every
    // prospect came from that same market. Today sessions may pull eligible
    // work across markets, so do not attach the first prospect's campaign to
    // an otherwise mixed session.
    const selectedCampaignIds = new Set(selected.map((lead) => lead.campaign_id).filter(Boolean));
    const sessionCampaignId = explicitSearchCampaignId
      || (selectedCampaignIds.size === 1 && selected.every((lead) => lead.campaign_id) ? selected[0].campaign_id : null);

    const { data: session, error: sessionError } = await db.from('prospecting_sessions').insert({
      workspace_id: user.workspaceId,
      user_id: user.id,
      campaign_id: sessionCampaignId,
      status: 'ready',
      source: requestInput.source,
      target_size: selected.length,
    }).select('id,status,campaign_id').single();

    if (sessionError) {
      const { data: raced } = await db.from('prospecting_sessions').select('id,status,campaign_id')
        .eq('user_id', user.id).eq('workspace_id', user.workspaceId).in('status', ['ready', 'active']).limit(1).maybeSingle();
      if (raced) {
        const { data: racedItem } = await db.from('prospecting_session_items').select('lead_id')
          .eq('session_id', raced.id).eq('workspace_id', user.workspaceId).in('status', ['ready', 'working']).order('position').limit(1).maybeSingle();
        return NextResponse.json({ session: raced, href: racedItem?.lead_id ? sessionLeadHref({ leadId: racedItem.lead_id, sessionId: raced.id, campaignId: raced.campaign_id }) : '/dashboard' });
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
      href: sessionLeadHref({ leadId: selected[0].id, sessionId: session.id, campaignId: session.campaign_id }),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid session request.' }, { status: 400 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Session preparation failed:', error);
    return NextResponse.json({ error: 'The session could not be prepared.' }, { status: 500 });
  }
}
