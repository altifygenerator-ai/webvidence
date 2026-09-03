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
    expect(form).toContain('Manual searches can still use any location');
    expect(form).toContain('if (!compact)');
  });

  it('limits automatic sessions by real coordinates and returns the first prospect directly', () => {
    const route = source('app/api/sessions/route.ts');
    const session = source('lib/retention/session.ts');
    expect(route).toContain("import { rankActionableLead } from '@/lib/retention/session'");
    expect(session).toContain('export function rankActionableLead');
    expect(session).toContain('input.opportunityScore ?? input.opportunity_score');
    expect(session).toContain('input.businessStatus ?? input.business_status');
    expect(route).toContain("import { distanceMiles } from '@/lib/providers/google-places'");
    expect(route).toContain('prospecting_area_center_lat');
    expect(route).toContain('leadInsideArea');
    expect(route).toContain("workspace_id: user.workspaceId");
    expect(route).toContain('href: `/dashboard/leads/${selected[0].id}?session=${session.id}#outreach`');
    expect(route).toContain("You're caught up inside");
  });

  it('uses watched_markets as the background source of truth and applies the saved area', () => {
    const job = source('lib/jobs/retention.ts');
    expect(job).toContain("db.from('watched_markets')");
    expect(job).toContain('automaticArea(routine)');
    expect(job).not.toContain(".not('watched_at', 'is', null)");
    expect(job).toContain('workspace_id: workspaceId');
    expect(job).toContain('user_id: userId');
    expect(job).toContain("status: 'ready'");
  });

  it('keeps Start another session visible on completed sessions including mobile', () => {
    const today = source('components/today-session.tsx');
    const css = source('app/application.css');
    expect(today).toContain('Start another session');
    expect(today).toContain('Checking your market…');
    expect(today).toContain('Automatic area: {areaSummary(props.routine)}');
    expect(css).toContain('.app-frame .today-start-another{width:100%}');
  });
});
