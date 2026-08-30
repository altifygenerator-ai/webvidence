import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/009_habit_retention.sql', import.meta.url), 'utf8');
const lower = migration.toLowerCase();

describe('habit retention migration', () => {
  it('is additive and preserves existing production data', () => {
    expect(lower).toContain('add column if not exists last_reviewed_at');
    expect(lower).toContain('create table if not exists public.prospecting_routines');
    expect(lower).toContain('create table if not exists public.prospecting_sessions');
    expect(lower).toContain('create table if not exists public.watched_markets');
    expect(lower).toContain('create table if not exists public.lead_contact_paths');
    expect(lower).toContain('create table if not exists public.reminder_deliveries');
    expect(lower).not.toContain('drop table');
    expect(lower).not.toContain('truncate ');
    expect(lower).not.toMatch(/delete\s+from\s+public\./);
  });

  it('defaults sessions to three and makes reminder claims race-safe', () => {
    expect(lower).toContain('session_size smallint not null default 3');
    expect(lower).toContain('target_size smallint not null default 3');
    expect(lower).toContain('unique(user_id, dedupe_key)');
    expect(lower).toContain("where status = 'active'");
    expect(lower).toContain('on public.prospecting_sessions(user_id, workspace_id)');
  });

  it('keeps private contact discoveries and reminder delivery rows server-only', () => {
    expect(lower).toContain('revoke all on public.lead_contact_paths from anon, authenticated');
    expect(lower).toContain('revoke all on public.reminder_deliveries from anon, authenticated');
    expect(lower).toContain('grant all privileges on public.lead_contact_paths to service_role');
  });
});
