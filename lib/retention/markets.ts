import { createAdminClient } from '@/lib/supabase/admin';
import { searchBusinesses } from '@/lib/providers/google-places';
import { logApiUsage } from '@/lib/data/api-usage';
import { PLANS, type PlanId } from '@/lib/plans';

export async function refreshDueWatchedMarkets(now = new Date()) {
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { checked: 0, refreshed: 0, surfaced: 0, skipped: 'GOOGLE_PLACES_API_KEY is not configured.' };
  const db = createAdminClient();
  const { data, error } = await db.from('watched_markets')
    .select('id,user_id,workspace_id,campaign_id,refresh_interval_hours,next_refresh_at,campaigns!inner(id,category,location,radius_miles,center_lat,center_lng,status)')
    .eq('status', 'active').lte('next_refresh_at', now.toISOString()).limit(50);
  if (error) throw new Error(`Could not load watched markets: ${error.message}`);

  let refreshed = 0;
  let surfaced = 0;
  for (const watch of data || []) {
    const campaign = Array.isArray(watch.campaigns) ? watch.campaigns[0] : watch.campaigns;
    const nextRefresh = new Date(now.getTime() + Number(watch.refresh_interval_hours || 24) * 3600_000).toISOString();
    // Claim this refresh by moving next_refresh_at first. A concurrent cron run must match the old value to proceed.
    const { data: claimed } = await db.from('watched_markets').update({ next_refresh_at: nextRefresh, updated_at: now.toISOString() })
      .eq('id', watch.id).eq('next_refresh_at', watch.next_refresh_at).select('id').maybeSingle();
    if (!claimed) continue;
    if (!campaign || campaign.status !== 'active' || typeof campaign.center_lat !== 'number' || typeof campaign.center_lng !== 'number') {
      await db.from('watched_markets').update({ next_refresh_at: nextRefresh, last_new_prospect_count: 0, updated_at: now.toISOString() }).eq('id', watch.id);
      continue;
    }

    try {
      const [{ data: prior }, { data: profile }] = await Promise.all([
        db.from('leads').select('google_place_id').eq('workspace_id', watch.workspace_id).not('google_place_id', 'is', null).limit(5000),
        db.from('profiles').select('plan,is_admin').eq('id', watch.user_id).maybeSingle(),
      ]);
      const seen = new Set((prior || []).map((lead) => lead.google_place_id).filter((value): value is string => Boolean(value)));
      const plan = (profile?.plan || 'free') as PlanId;
      const isAdmin = Boolean(profile?.is_admin) || plan === 'admin';
      let maxResults = 6;
      if (!isAdmin) {
        const { count } = await db.from('leads').select('id', { count: 'exact', head: true })
          .eq('workspace_id', watch.workspace_id).neq('status', 'archived');
        maxResults = Math.min(maxResults, Math.max(0, PLANS[plan].saved - Number(count || 0)));
      }
      if (maxResults <= 0) {
        await db.from('watched_markets').update({ last_refreshed_at: now.toISOString(), next_refresh_at: nextRefresh, last_new_prospect_count: 0, updated_at: now.toISOString() }).eq('id', watch.id);
        refreshed += 1;
        continue;
      }

      const result = await searchBusinesses({
        category: campaign.category,
        center: { latitude: campaign.center_lat, longitude: campaign.center_lng },
        radiusMiles: campaign.radius_miles,
        maxResults,
        apiKey: placesKey,
        resultMode: 'mixed',
        requestBudget: 2,
        poolSize: 30,
        seed: `watch:${watch.id}:${now.toISOString().slice(0, 10)}`,
        excludePlaceIds: seen,
      });
      const newBusinesses = result.businesses.filter((business) => !seen.has(business.id));

      let searchRunId: string | null = null;
      if (newBusinesses.length) {
        const { data: run, error: runError } = await db.from('search_runs').insert({
          workspace_id: watch.workspace_id,
          campaign_id: watch.campaign_id,
          user_id: watch.user_id,
          provider: 'google_places',
          category: campaign.category,
          location: campaign.location,
          radius_miles: campaign.radius_miles,
          center_lat: campaign.center_lat,
          center_lng: campaign.center_lng,
          status: 'completed',
          result_count: newBusinesses.length,
          billable_requests: result.requests,
          started_at: now.toISOString(), completed_at: now.toISOString(),
          raw: { source: 'watched_market', watchId: watch.id, areasSearched: result.areasSearched, candidatesConsidered: result.candidatesConsidered },
        }).select('id').single();
        if (runError) throw new Error(runError.message);
        searchRunId = run.id;
      }

      let inserted = 0;
      for (const business of newBusinesses) {
        const { data: already } = await db.from('leads').select('id').eq('workspace_id', watch.workspace_id).eq('google_place_id', business.id).maybeSingle();
        if (already) continue;
        const { error: insertError } = await db.from('leads').insert({
          workspace_id: watch.workspace_id,
          campaign_id: watch.campaign_id,
          search_run_id: searchRunId,
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
          website_source: 'google_places',
          website_verification_status: business.website ? 'google_linked' : 'not_linked',
          phone: business.phone,
          google_maps_url: business.googleMapsUrl,
          reviews: business.reviews,
          rating: business.rating,
          business_status: business.businessStatus,
          raw_provider_data: { ...((business.raw as Record<string, unknown>) || {}), distanceMiles: business.distanceMiles, surfacedByWatch: watch.id },
        });
        if (!insertError) inserted += 1;
      }

      await db.from('watched_markets').update({
        last_refreshed_at: now.toISOString(), next_refresh_at: nextRefresh,
        last_new_prospect_count: inserted, updated_at: now.toISOString(),
      }).eq('id', watch.id);
      await logApiUsage({ workspaceId: watch.workspace_id, userId: watch.user_id, provider: 'webvidence_event', operation: 'market_refreshed', metadata: { watchId: watch.id, campaignId: watch.campaign_id, newProspects: inserted } });
      if (inserted) await logApiUsage({ workspaceId: watch.workspace_id, userId: watch.user_id, provider: 'webvidence_event', operation: 'new_prospects_surfaced', metadata: { watchId: watch.id, campaignId: watch.campaign_id, count: inserted } });
      refreshed += 1;
      surfaced += inserted;
    } catch (error) {
      console.error('Watched market refresh failed:', error);
      await db.from('watched_markets').update({ next_refresh_at: nextRefresh, last_new_prospect_count: 0, updated_at: now.toISOString() }).eq('id', watch.id);
    }
  }
  return { checked: data?.length || 0, refreshed, surfaced };
}
