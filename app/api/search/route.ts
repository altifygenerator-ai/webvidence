import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { consumeSearch, refundUsage } from '@/lib/security/entitlements';
import { demoSearch } from '@/lib/providers/demo';
import { geocodeLocation, searchBusinesses, type GoogleBusiness, type SearchResultMode } from '@/lib/providers/google-places';
import { createAdminClient } from '@/lib/supabase/admin';
import { flags } from '@/lib/env';
import { PLANS } from '@/lib/plans';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';
import { queueLeadAudits, processAuditJobs } from '@/lib/jobs/audits';
import { logApiUsage } from '@/lib/data/api-usage';
import { countryName, isCountryCode } from '@/lib/countries';

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
  status: string;
  audit: null | Record<string, unknown>;
  auditStatus?: 'queued' | 'running' | 'completed' | 'failed' | 'limit_reached' | 'already_queued';
  auditJobId?: string | null;
};

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().max(max).optional(),
);

const schema = z.object({
  category: z.string().trim().min(2).max(80),
  // `location` remains supported for older clients and previously deployed forms.
  location: optionalText(240),
  city: optionalText(120),
  region: optionalText(120),
  countryCode: optionalText(2),
  radiusMiles: z.coerce.number().int().min(5).max(100).default(50),
  maxResults: z.coerce.number().int().min(5).max(40).default(20),
  auditCount: z.coerce.number().int().min(0).max(10).default(5),
  resultMode: z.enum(['mixed', 'best_match', 'hidden', 'closest']).default('mixed'),
}).superRefine((value, ctx) => {
  if (value.location) return;
  if (!value.city) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'Enter a city or postal code.' });
  }
  if (!value.countryCode || !isCountryCode(value.countryCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['countryCode'], message: 'Choose a valid country.' });
  }
});


const DISCOVERY_COVERAGE = {
  free: { requestBudget: 2, poolSize: 30 },
  starter: { requestBudget: 3, poolSize: 50 },
  freelancer: { requestBudget: 5, poolSize: 80 },
  studio: { requestBudget: 8, poolSize: 120 },
  admin: { requestBudget: 8, poolSize: 120 },
} as const;

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
    const countryCode = input.countryCode?.toUpperCase();
    const requestedLocation = input.location || [
      input.city,
      input.region,
      countryCode ? countryName(countryCode) : undefined,
    ].filter(Boolean).join(', ');

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
        leads: demoSearch(input.category, requestedLocation),
        mode: 'demo',
        warning: 'DEMO_MODE is true. Set DEMO_MODE=false and restart the server to use Google Places.',
      });
    }

    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    const geocodingKey = process.env.GOOGLE_GEOCODING_API_KEY || placesKey;
    if (!placesKey || !geocodingKey) {
      throw new SearchHttpError('Google API key is missing. Add the Google API values to the server environment.', 500);
    }
    if (!user.workspaceId) {
      throw new SearchHttpError('Your account does not have a workspace. Run the Supabase setup and sign in again.', 500);
    }

    await consumeSearch(user);
    searchCharged = true;

    const geocoded = await geocodeLocation(requestedLocation, geocodingKey, countryCode);
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
            `Your ${PLANS[user.plan].name} plan allows ${PLANS[user.plan].campaigns} active campaigns. Archive an existing campaign or upgrade to search a new market.`,
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

    let effectiveMaxResults = user.plan === 'free' && !user.isAdmin
      ? Math.min(input.maxResults, 10)
      : input.maxResults;
    let resultCapNotice = user.plan === 'free' && input.maxResults > 10
      ? 'Free searches return up to 10 businesses so all five monthly searches remain usable.'
      : '';

    if (!user.isAdmin) {
      const { count: savedLeadCount } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', user.workspaceId)
        .neq('status', 'archived');
      const remaining = Math.max(0, PLANS[user.plan].saved - (savedLeadCount || 0));
      if (remaining === 0) {
        throw new SearchHttpError(
          `Your ${PLANS[user.plan].name} plan has reached its ${PLANS[user.plan].saved}-lead storage limit. Archive leads or upgrade before saving more.`,
          402,
        );
      }
      if (effectiveMaxResults > remaining) {
        effectiveMaxResults = remaining;
        resultCapNotice = `Only ${remaining} open lead slot${remaining === 1 ? '' : 's'} remained, so this search was capped.`;
      }
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
      const { data: priorCampaignLeads } = await db
        .from('leads')
        .select('google_place_id')
        .eq('workspace_id', user.workspaceId)
        .eq('campaign_id', campaign.id)
        .not('google_place_id', 'is', null)
        .limit(1000);
      const previousPlaceIds = (priorCampaignLeads || [])
        .map((lead) => lead.google_place_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const coverage = DISCOVERY_COVERAGE[user.isAdmin ? 'admin' : user.plan];

      const googleResult = await searchBusinesses({
        category: input.category,
        center: geocoded.coordinates,
        radiusMiles: input.radiusMiles,
        maxResults: effectiveMaxResults,
        apiKey: placesKey,
        countryCode,
        resultMode: input.resultMode,
        requestBudget: coverage.requestBudget,
        poolSize: coverage.poolSize,
        seed: `${searchRun.id}:${input.category}:${geocoded.formattedAddress}`,
        excludePlaceIds: previousPlaceIds,
      });

      const savedLeads = await saveBusinesses({
        businesses: googleResult.businesses,
        workspaceId: user.workspaceId,
        campaignId: campaign.id,
        searchRunId: searchRun.id,
      });

      const requestedAuditCount = Math.min(input.auditCount, savedLeads.length);
      const auditTargets = prioritizeForAudit(savedLeads, input.resultMode).slice(0, requestedAuditCount);
      let auditQueueError = '';
      let queued: Awaited<ReturnType<typeof queueLeadAudits>> = { results: [], jobIds: [], limitReached: false };
      if (requestedAuditCount > 0) {
        try {
          queued = await queueLeadAudits({
            id: user.id,
            workspaceId: user.workspaceId,
            plan: user.plan,
            isAdmin: user.isAdmin,
          }, auditTargets);
        } catch (error) {
          auditQueueError = error instanceof Error ? error.message : 'Selected website analyses could not be queued.';
          console.error('Business search completed but audit queueing failed:', error);
        }
      }

      const auditByLead = new Map(queued.results.map((item) => [item.leadId, item]));
      const leads = savedLeads.map((lead) => {
        const job = auditByLead.get(lead.id);
        return job ? {
          ...lead,
          audit: job.audit || null,
          opportunityScore: job.audit?.score ?? lead.opportunityScore,
          auditStatus: job.status === 'already_queued' ? 'queued' : job.status,
          auditJobId: job.jobId,
        } : lead;
      });

      if (queued.jobIds.length) {
        after(async () => {
          await processAuditJobs(queued.jobIds, 2);
        });
      }

      await db.from('search_runs').update({
        status: 'completed',
        result_count: savedLeads.length,
        billable_requests: googleResult.requests + 1,
        completed_at: new Date().toISOString(),
        raw: {
          formattedLocation: geocoded.formattedAddress,
          auditJobsQueued: queued.jobIds.length,
          resultMode: input.resultMode,
          searchAreas: googleResult.areasSearched,
          candidatesConsidered: googleResult.candidatesConsidered,
          unseenCandidates: googleResult.unseenCandidates,
        },
      }).eq('id', searchRun.id);

      await Promise.all([
        logApiUsage({
          workspaceId: user.workspaceId,
          userId: user.id,
          provider: 'google_geocoding',
          operation: 'geocode',
          units: 1,
          metadata: { location: requestedLocation, countryCode: countryCode || null, formattedAddress: geocoded.formattedAddress },
        }),
        logApiUsage({
          workspaceId: user.workspaceId,
          userId: user.id,
          provider: 'google_places',
          operation: 'text_search',
          units: googleResult.requests,
          metadata: { category: input.category, radiusMiles: input.radiusMiles, countryCode: countryCode || null, resultMode: input.resultMode, searchAreas: googleResult.areasSearched, candidatesConsidered: googleResult.candidatesConsidered, businessesReturned: savedLeads.length },
        }),
      ]);

      const discoveryNotice = input.resultMode === 'best_match'
        ? ''
        : `${resultModeLabel(input.resultMode)} checked ${googleResult.areasSearched} part${googleResult.areasSearched === 1 ? '' : 's'} of the market and selected from ${googleResult.candidatesConsidered} matching listing${googleResult.candidatesConsidered === 1 ? '' : 's'}.`;
      const notices = [resultCapNotice, discoveryNotice];
      if (queued.limitReached) notices.push('Your monthly analysis limit was reached. The remaining businesses were saved without analysis.');
      if (auditQueueError) notices.push(`The businesses were saved, but the selected analyses could not start: ${auditQueueError}`);
      if (queued.jobIds.length) notices.push(`${queued.jobIds.length} website analysis${queued.jobIds.length === 1 ? ' is' : 'es are'} running in the background. You can leave this page and return later.`);

      return NextResponse.json({
        mode: 'live',
        provider: 'google_places',
        center: geocoded,
        campaignId: campaign.id,
        searchRunId: searchRun.id,
        count: leads.length,
        auditWarning: notices.filter(Boolean).join(' ') || null,
        auditJobIds: queued.jobIds,
        leads,
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
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from('leads')
      .select('id,opportunity_score,status')
      .eq('workspace_id', options.workspaceId)
      .eq('google_place_id', business.id)
      .maybeSingle();

    let leadId: string;
    let opportunityScore: number | null = existing?.opportunity_score ?? null;
    const status = existing?.status === 'archived' ? 'new' : (existing?.status || 'new');
    if (existing) {
      const { error } = await db.from('leads').update({
        ...record,
        status,
      }).eq('id', existing.id);
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
      status,
      audit: null,
    });
  }

  return saved;
}

function prioritizeForAudit<T extends { website: string | null; reviews: number }>(
  leads: T[],
  resultMode: SearchResultMode,
) {
  return [...leads].sort((a, b) => {
    if (!a.website && b.website) return -1;
    if (a.website && !b.website) return 1;
    if (resultMode === 'mixed' || resultMode === 'hidden') return a.reviews - b.reviews;
    return b.reviews - a.reviews;
  });
}

function resultModeLabel(mode: SearchResultMode) {
  if (mode === 'hidden') return 'Hidden-opportunity search';
  if (mode === 'closest') return 'Closest-first search';
  if (mode === 'mixed') return 'Mixed search';
  return 'Best-match search';
}
