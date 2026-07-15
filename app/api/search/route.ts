import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { consumeAudit, consumeSearch, refundUsage } from '@/lib/security/entitlements';
import { demoSearch } from '@/lib/providers/demo';
import { auditWebsite } from '@/lib/providers/audit';
import { geocodeLocation, searchBusinesses, type GoogleBusiness } from '@/lib/providers/google-places';
import { saveLeadAudit } from '@/lib/data/audits';
import { createAdminClient } from '@/lib/supabase/admin';
import { flags } from '@/lib/env';
import { PLANS } from '@/lib/plans';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';

export const runtime = 'nodejs';
export const maxDuration = 300;

type SavedLead = {
  id: string;
  googlePlaceId: string;
  name: string;
  category: string;
  address: string;
  city: string;
  state: string;
  website: string | null;
  phone: string | null;
  reviews: number;
  rating: number | null;
  googleMapsUrl: string | null;
  distanceMiles: number | null;
  opportunityScore: number | null;
  audit: Awaited<ReturnType<typeof saveLeadAudit>> | null;
};

const schema = z.object({
  category: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(160),
  radiusMiles: z.coerce.number().int().min(5).max(100).default(50),
  maxResults: z.coerce.number().int().min(5).max(40).default(20),
  auditCount: z.coerce.number().int().min(0).max(10).default(5),
});

class SearchHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let searchLock: OperationLock | null = null;
  let searchCharged = false;

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.search);
    const input = schema.parse(await req.json());

    searchLock = await acquireOperationLock({
      userId: user.id,
      operation: 'business-search',
      ttlSeconds: 360,
    });
    if (!searchLock) {
      throw new SearchHttpError('A search is already running for this account. Wait for it to finish before starting another.', 409);
    }

    if (flags.demo) {
      return NextResponse.json({
        leads: demoSearch(input.category, input.location),
        mode: 'demo',
        warning: 'DEMO_MODE is true. Set DEMO_MODE=false in .env.local and restart the server to use Google Places.',
      });
    }

    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    const geocodingKey = process.env.GOOGLE_GEOCODING_API_KEY || placesKey;
    if (!placesKey || !geocodingKey) {
      throw new SearchHttpError('Google API key is missing. Add the Google API values to .env.local.', 500);
    }
    if (!user.workspaceId) {
      throw new SearchHttpError('Your account does not have a workspace. Run the Supabase setup and sign in again.', 500);
    }

    // Reserve the monthly search allowance before any billable Google request.
    // Any failed search is refunded in the catch block.
    await consumeSearch(user);
    searchCharged = true;

    const geocoded = await geocodeLocation(input.location, geocodingKey);
    const db = createAdminClient();

    const { data: matchingCampaign } = await db
      .from('campaigns')
      .select('id')
      .eq('workspace_id', user.workspaceId)
      .eq('category', input.category)
      .eq('location', geocoded.formattedAddress)
      .eq('radius_miles', input.radiusMiles)
      .in('status', ['draft', 'active', 'paused'])
      .limit(1)
      .maybeSingle();

    let campaign = matchingCampaign;
    if (!campaign) {
      if (!user.isAdmin) {
        const { count: campaignCount } = await db
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', user.workspaceId)
          .in('status', ['draft', 'active', 'paused']);
        if ((campaignCount || 0) >= PLANS[user.plan].campaigns) {
          throw new SearchHttpError(
            `Your ${PLANS[user.plan].name} plan allows ${PLANS[user.plan].campaigns} active campaign${PLANS[user.plan].campaigns === 1 ? '' : 's'}. Archive an existing campaign or upgrade to search a new market.`,
            402,
          );
        }
      }

      const { data: createdCampaign, error: campaignError } = await db
        .from('campaigns')
        .insert({
          workspace_id: user.workspaceId,
          user_id: user.id,
          name: `${input.category} near ${geocoded.formattedAddress}`,
          category: input.category,
          location: geocoded.formattedAddress,
          radius_miles: input.radiusMiles,
          center_lat: geocoded.coordinates.latitude,
          center_lng: geocoded.coordinates.longitude,
          status: 'active',
        })
        .select('id')
        .single();
      if (campaignError) throw new Error(`Campaign could not be saved: ${campaignError.message}`);
      campaign = createdCampaign;
    }

    if (!campaign) throw new Error('Campaign could not be resolved.');

    let effectiveMaxResults = input.maxResults;
    if (!user.isAdmin) {
      const { count: savedLeadCount } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', user.workspaceId)
        .neq('status', 'archived');
      const remaining = Math.max(0, PLANS[user.plan].saved - (savedLeadCount || 0));
      if (remaining === 0) {
        throw new SearchHttpError(
          `Your ${PLANS[user.plan].name} plan has reached its ${PLANS[user.plan].saved}-lead storage limit. Upgrade or archive leads before saving more.`,
          402,
        );
      }
      effectiveMaxResults = Math.min(input.maxResults, remaining);
    }

    const { data: searchRun, error: runError } = await db
      .from('search_runs')
      .insert({
        workspace_id: user.workspaceId,
        campaign_id: campaign.id,
        user_id: user.id,
        provider: 'google_places',
        category: input.category,
        location: geocoded.formattedAddress,
        radius_miles: input.radiusMiles,
        center_lat: geocoded.coordinates.latitude,
        center_lng: geocoded.coordinates.longitude,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runError) throw new Error(`Search run could not be saved: ${runError.message}`);

    try {
      const googleResult = await searchBusinesses({
        category: input.category,
        center: geocoded.coordinates,
        radiusMiles: input.radiusMiles,
        maxResults: effectiveMaxResults,
        apiKey: placesKey,
      });

      const savedLeads = await saveBusinesses({
        businesses: googleResult.businesses,
        workspaceId: user.workspaceId,
        campaignId: campaign.id,
        searchRunId: searchRun.id,
      });

      const requestedAuditCount = Math.min(input.auditCount, savedLeads.length);
      const auditedLeads = [...savedLeads];
      const auditWarnings: string[] = [];

      if (requestedAuditCount > 0) {
        const auditTargets = prioritizeForAudit(savedLeads).slice(0, requestedAuditCount);
        const auditMap = new Map<string, Awaited<ReturnType<typeof saveLeadAudit>>>();

        for (const lead of auditTargets) {
          let auditLock: OperationLock | null = null;
          let auditCharged = false;
          try {
            auditLock = await acquireOperationLock({
              userId: user.id,
              operation: `audit:${lead.id}`,
              ttlSeconds: 180,
            });
            if (!auditLock) {
              auditWarnings.push(`${lead.name} was already being analyzed.`);
              continue;
            }

            await consumeAudit(user);
            auditCharged = true;
            const audit = await auditWebsite(lead.website, { runPageSpeed: true });
            const saved = await saveLeadAudit({
              workspaceId: user.workspaceId,
              userId: user.id,
              leadId: lead.id,
              audit,
              reviews: lead.reviews,
            });
            auditMap.set(lead.id, saved);
          } catch (error) {
            if (auditCharged) await refundUsage(user, 'audit');
            if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
              auditWarnings.push('Your monthly analysis limit was reached. Remaining businesses were saved without analysis.');
              break;
            }
            auditWarnings.push(`${lead.name} could not be analyzed right now.`);
          } finally {
            await releaseOperationLock(auditLock);
          }
        }

        for (let index = 0; index < auditedLeads.length; index += 1) {
          const audit = auditMap.get(auditedLeads[index].id);
          if (audit) {
            auditedLeads[index] = {
              ...auditedLeads[index],
              opportunityScore: audit.score,
              audit,
            };
          }
        }
      }

      await db.from('search_runs').update({
        status: 'completed',
        result_count: savedLeads.length,
        billable_requests: googleResult.requests + 1,
        completed_at: new Date().toISOString(),
        raw: { formattedLocation: geocoded.formattedAddress },
      }).eq('id', searchRun.id);

      await db.from('api_usage_log').insert([
        {
          workspace_id: user.workspaceId,
          user_id: user.id,
          provider: 'google_geocoding',
          operation: 'geocode',
          units: 1,
          metadata: { location: input.location },
        },
        {
          workspace_id: user.workspaceId,
          user_id: user.id,
          provider: 'google_places',
          operation: 'text_search',
          units: googleResult.requests,
          metadata: { category: input.category, radiusMiles: input.radiusMiles },
        },
      ]);

      return NextResponse.json({
        mode: 'live',
        provider: 'google_places',
        center: geocoded,
        campaignId: campaign.id,
        searchRunId: searchRun.id,
        count: auditedLeads.length,
        auditWarning: auditWarnings.length ? auditWarnings.join(' ') : null,
        leads: auditedLeads,
      });
    } catch (error) {
      await db.from('search_runs').update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Search failed',
        completed_at: new Date().toISOString(),
      }).eq('id', searchRun.id);
      throw error;
    }
  } catch (error) {
    if (searchCharged) await refundUsage(user, 'search');

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { 'retry-after': String(error.retryAfter) } },
      );
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SearchHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid search.' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
      return NextResponse.json({ error: `Monthly search limit reached for the ${PLANS[user.plan].name} plan.` }, { status: 402 });
    }
    const message = error instanceof Error ? error.message : 'Search failed.';
    console.error('Live business search failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseOperationLock(searchLock);
  }
}

async function saveBusinesses(options: {
  businesses: GoogleBusiness[];
  workspaceId: string;
  campaignId: string;
  searchRunId: string;
}) {
  const db = createAdminClient();
  const saved: SavedLead[] = [];

  for (const business of options.businesses) {
    const record = {
      workspace_id: options.workspaceId,
      campaign_id: options.campaignId,
      search_run_id: options.searchRunId,
      source: 'google_places',
      google_place_id: business.id,
      name: business.name,
      category: business.category,
      address: business.address,
      city: business.city,
      state: business.state,
      postal_code: business.postalCode,
      latitude: business.latitude,
      longitude: business.longitude,
      website: business.website,
      phone: business.phone,
      google_maps_url: business.googleMapsUrl,
      reviews: business.reviews,
      rating: business.rating,
      business_status: business.businessStatus,
      raw_provider_data: { ...((business.raw as Record<string, unknown>) || {}), distanceMiles: business.distanceMiles },
    };

    const { data: existing } = await db
      .from('leads')
      .select('id,opportunity_score')
      .eq('workspace_id', options.workspaceId)
      .eq('google_place_id', business.id)
      .maybeSingle();

    let leadId: string;
    let opportunityScore: number | null = existing?.opportunity_score ?? null;
    if (existing) {
      const { error } = await db.from('leads').update(record).eq('id', existing.id);
      if (error) throw new Error(`Could not update ${business.name}: ${error.message}`);
      leadId = existing.id;
    } else {
      const { data: inserted, error } = await db.from('leads').insert(record).select('id,opportunity_score').single();
      if (error) throw new Error(`Could not save ${business.name}: ${error.message}`);
      leadId = inserted.id;
      opportunityScore = inserted.opportunity_score;
    }

    saved.push({
      id: leadId,
      googlePlaceId: business.id,
      name: business.name,
      category: business.category,
      address: business.address,
      city: business.city,
      state: business.state,
      website: business.website,
      phone: business.phone,
      reviews: business.reviews,
      rating: business.rating,
      googleMapsUrl: business.googleMapsUrl,
      distanceMiles: business.distanceMiles,
      opportunityScore,
      audit: null,
    });
  }

  return saved;
}

function prioritizeForAudit<T extends { website: string | null; reviews: number }>(leads: T[]) {
  return [...leads].sort((a, b) => {
    if (!a.website && b.website) return -1;
    if (a.website && !b.website) return 1;
    return b.reviews - a.reviews;
  });
}
