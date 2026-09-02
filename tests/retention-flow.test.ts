import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionSummary, PASS_REASONS, rankActionableLead } from '@/lib/retention/session';
import { extractPublicContactPaths } from '@/lib/providers/audit';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('prepared prospecting sessions', () => {
  it('defaults to a three-prospect routine and allows every pass reason', () => {
    const migration = source('supabase/009_habit_retention.sql');
    expect(migration).toContain('session_size smallint not null default 3');
    expect(PASS_REASONS).toHaveLength(6);
    expect(getSessionSummary([{ status: 'contacted' }, { status: 'passed' }, { status: 'passed' }])).toEqual({ reviewed: 3, contacted: 1, passed: 2 });
  });

  it('ranks active reachable businesses above raw audit ugliness alone', () => {
    const active = rankActionableLead({ opportunityScore: 60, reviews: 40, rating: 4.5, website: 'https://example.com', phone: '555', businessStatus: 'OPERATIONAL' });
    const ugly = rankActionableLead({ opportunityScore: 75, reviews: 0, rating: null, website: null, phone: null, businessStatus: null });
    expect(active).toBeGreaterThan(ugly);
  });

  it('stops recommending work after every session item is decided', () => {
    const progress = source('lib/retention/progress.ts');
    expect(progress).toContain("status: 'completed'");
    expect(progress).toContain("in('status', ['ready', 'working'])");
    expect(source('components/prospect-session.tsx')).toContain('You’re done for today.');
  });

  it('scopes session reads and mutations to the signed-in user and workspace', () => {
    const create = source('app/api/sessions/route.ts');
    const update = source('app/api/sessions/[id]/route.ts');
    const page = source('app/dashboard/session/[id]/page.tsx');
    expect(create).toContain(".eq('user_id', user.id)");
    expect(create).toContain(".eq('workspace_id', user.workspaceId)");
    expect(update).toContain(".eq('workspace_id', user.workspaceId).eq('user_id', user.id)");
    expect(page).toContain(".eq('workspace_id', user.workspaceId).eq('user_id', user.id)");
  });
});

describe('private contact discovery and reminders', () => {
  it('extracts only public links and does not guess addresses', () => {
    const contacts = extractPublicContactPaths('<a href="mailto:hello@example.com">Email</a><a href="https://facebook.com/example">Facebook</a><a href="/request-a-quote">Quote</a>', new URL('https://example.com'));
    expect(contacts.map((item) => item.kind)).toEqual(['email', 'facebook', 'quote_form']);
    expect(contacts.some((item) => item.value.includes('guessed'))).toBe(false);
  });

  it('keeps contacts server-only and reminder delivery race-safe', () => {
    const migration = source('supabase/009_habit_retention.sql');
    const audits = source('lib/data/audits.ts');
    const cron = source('app/api/cron/retention/route.ts');
    expect(migration).toContain('unique (user_id, dedupe_key)');
    expect(migration).toContain('revoke all on public.prospecting_routines');
    expect(audits).toContain('const { contactPaths: _privateContactPaths, ...publicAudit }');
    expect(cron).toContain('authorization');
    expect(cron).toContain('Bearer ${secret}');
  });
});

describe('mobile-sensitive session UI', () => {
  it('contains explicit narrow-phone and tablet layouts without competing app navigation', () => {
    const css = source('app/retention.css');
    for (const width of [320, 375, 390, 430, 760, 900]) expect(css).toContain(`max-width:${width}px`);
    expect(css).toContain('.app-frame-focused .app-sidebar');
    expect(css).toContain('.app-frame-focused .mobile-quick-nav');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('.session-primary-actions{position:sticky');
  });
});
