import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('automatic prospecting area', () => {
  it('adds an additive, nullable geographic guardrail to prospecting routines', () => {
    const migration = source('supabase/011_prospecting_area.sql').toLowerCase();
    expect(migration).toContain('alter table public.prospecting_routines');
    expect(migration).toContain('prospecting_area_location');
    expect(migration).toContain('prospecting_area_center_lat');
    expect(migration).toContain('prospecting_area_center_lng');
    expect(migration).toContain('prospecting_area_radius_miles');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('delete from');
  });

  it('geocodes the saved area once and keeps compact routine saves from clearing it', () => {
    const route = source('app/api/routine/route.ts');
    const form = source('components/routine-settings-form.tsx');
    expect(route).toContain('geocodeLocation(requestedArea');
    expect(route).toContain('input.prospectingArea !== undefined');
    expect(route).toContain('prospecting_area_center_lat');
    expect(route).toContain('reminder_emails_enabled: input.reminderEmailEnabled');
    expect(form).toContain('Automatic prospecting area');
    expect(form).toContain('Manual Find searches can still use any location');
    expect(form).toContain('does not guess your market from old searches');
    expect(form).toContain('if (!compact)');
  });

  it('requires an explicit area before Today can pull across saved searches', () => {
    const route = source('app/api/sessions/route.ts');
    const today = source('components/today-session.tsx');
    expect(route).toContain('needsProspectingArea: true');
    expect(route).toContain('Set your automatic prospecting area before starting a Today session');
    expect(route).toContain(".filter((lead) => !area || leadInsideProspectingArea(lead, area))");
    expect(today).toContain('Choose where Today should prospect');
    expect(today).toContain('Automatic area: not set');
    expect(today).toContain('Set prospecting area');
  });

  it('uses validated real coordinates and distance for automatic sessions', () => {
    const route = source('app/api/sessions/route.ts');
    const helper = source('lib/retention/prospecting-area.ts');
    const session = source('lib/retention/session.ts');
    expect(route).toContain("import { rankActionableLead } from '@/lib/retention/session'");
    expect(route).toContain("from '@/lib/retention/prospecting-area'");
    expect(session).toContain('export function rankActionableLead');
    expect(session).toContain('input.opportunityScore ?? input.opportunity_score');
    expect(session).toContain('input.businessStatus ?? input.business_status');
    expect(helper).toContain("import { distanceMiles } from '@/lib/providers/google-places'");
    expect(helper).toContain('Number.isFinite(latitude)');
    expect(helper).toContain('leadInsideProspectingArea');
    expect(route).toContain('distanceFromProspectingArea(a, area)');
    expect(route).toContain("workspace_id: user.workspaceId");
    expect(route).toContain('sessionLeadHref({ leadId: selected[0].id');
    expect(route).toContain("You're caught up inside");
  });

  it('lets an explicit Find market replace an untouched ready session from another market', () => {
    const route = source('app/api/sessions/route.ts');
    expect(route).toContain('replaceReadySessionForExplicitMarket');
    expect(route).toContain('existing.campaign_id !== explicitSearchCampaignId');
    expect(route).toContain("existing.status === 'ready'");
  });

  it('does not permanently exclude prospects merely because an abandoned session queued them', () => {
    const route = source('app/api/sessions/route.ts');
    const dashboard = source('app/dashboard/page.tsx');
    expect(route).toContain(".in('status', ['contacted', 'passed'])");
    expect(dashboard).toContain(".in('status', ['contacted','passed'])");
    expect(route).toContain("status: 'abandoned'");
  });

  it('does not reuse already-contacted leads even if their status is stale', () => {
    const route = source('app/api/sessions/route.ts');
    expect(route).toContain(".is('first_contacted_at', null)");
    expect(route).toContain(".is('passed_at', null)");
  });

  it('keeps watched markets geographically faithful and only feeds Today with area-matching leads', () => {
    const job = source('lib/jobs/retention.ts');
    expect(job).toContain("db.from('watched_markets')");
    expect(job).toContain('const centerLat = campaign.center_lat');
    expect(job).toContain('const centerLng = campaign.center_lng');
    expect(job).not.toContain('const centerLat = area?.latitude ?? campaign.center_lat');
    expect(job).toContain('inserted.filter((lead) => leadInsideProspectingArea(lead, area))');
    expect(job).toContain(': [];');
    expect(job).toContain('todayEligible');
    expect(job).toContain("source: 'watched_market'");
    expect(job).toContain('session.campaign_id === watchedMarket.campaign_id');
  });

  it('abandons untouched automatic sessions that predate or fall outside the saved area', () => {
    const route = source('app/api/sessions/route.ts');
    const dashboard = source('app/dashboard/page.tsx');
    const routine = source('app/api/routine/route.ts');
    expect(route).toContain("['today', 'watched_market', 'reminder'].includes(existing.source)");
    expect(route).toContain('&& ((area && !existingFitsArea) || !area)');
    expect(dashboard).toContain("['today', 'watched_market', 'reminder'].includes(currentActiveSession.source)");
    expect(dashboard).toContain('const shouldAbandon = !prospectingArea');
    expect(routine).toContain(".in('source', ['today', 'watched_market', 'reminder'])");
    expect(routine).toContain('const outsideArea = savedArea');
  });

  it('keeps Start another session visible when an area exists and gives a safe setup action otherwise', () => {
    const today = source('components/today-session.tsx');
    const css = source('app/application.css');
    expect(today).toContain('Start another session');
    expect(today).toContain('Checking your area…');
    expect(today).toContain('Automatic area: {areaSummary(props.routine)}');
    expect(today).toContain('Set prospecting area');
    expect(css).toContain('.app-frame .today-start-another{width:100%}');
  });
});
