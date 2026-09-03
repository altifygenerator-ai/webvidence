import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('retention workflow', () => {
  it('uses one three-prospect Today session instead of the old sent-count target', () => {
    const today = source('components/today-session.tsx');
    const campaigns = source('app/dashboard/campaigns/page.tsx');
    const composer = source('components/outreach-composer.tsx');
    expect(today).toContain('actionsReady');
    expect(today).toContain('sessionsCompleted');
    expect(today).toContain('Start another session');
    expect(today).toContain('reviewed');
    expect(today).toContain('passed');
    expect(campaigns).not.toContain('0 of 5 contacted today');
    expect(campaigns).not.toContain('dailyTarget');
    expect(composer).not.toContain('dailyTarget');
  });

  it('does not interrupt the first draft with the outreach profile', () => {
    const composer = source('components/outreach-composer.tsx');
    const generateStart = composer.indexOf('async function requestGenerate');
    const generateEnd = composer.indexOf('async function updateMessage', generateStart);
    const generateBlock = composer.slice(generateStart, generateEnd);
    expect(generateBlock).not.toContain('setShowProfileModal(true)');
    expect(composer).toContain('Personalize future drafts');
  });

  it('supports optional pass reasons and advances directly to the next prospect', () => {
    const bar = source('components/lead-session-bar.tsx');
    const route = source('app/api/sessions/work/route.ts');
    expect(bar).toContain('Optional reason for passing');
    expect(bar).toContain('pass-reason-chips');
    expect(bar).toContain('Skip reason');
    expect(bar).toContain('data.nextLeadId');
    expect(route).toContain('passReason: z.enum(PASS_REASONS).nullable().optional()');
  });

  it('keeps follow-up sends from being classified as contacted session work', () => {
    const messages = source('app/api/messages/[id]/route.ts');
    expect(messages).toContain("data.intent === 'follow_up'");
    expect(messages).toContain("isFollowUp ? 'follow_up_cleared' : 'contacted'");
  });

  it('stops a completed session cleanly and offers routine setup after first confirmed send', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('firstSendConfirmed');
    expect(composer).toContain('setShowRoutineSetup(true)');
    expect(composer).toContain('Finish session');
  });

  it('gives Free one watched market and feeds unseen businesses into new leads', () => {
    const route = source('app/api/watched-markets/route.ts');
    const markets = source('lib/jobs/retention.ts');
    expect(route).toContain("user.plan === 'free'");
    expect(route).toContain('Free includes one watched market');
    expect(markets).toContain("db.from('watched_markets')");
    expect(markets).toContain('excludePlaceIds:');
    expect(markets).toContain("'new_prospects_surfaced'");
  });

  it('uses source-of-truth activity for weekly counts instead of session-only reply/contact stats', () => {
    const dashboard = source('app/dashboard/page.tsx');
    expect(dashboard).toContain('lead.first_contacted_at');
    expect(dashboard).toContain("message.direction === 'inbound'");
    expect(dashboard).toContain("message.intent === 'follow_up'");
  });

  it('deep-links external reminders to exact work where possible', () => {
    const reminders = source('lib/jobs/retention.ts');
    expect(reminders).toContain('nextSessionPath');
    expect(reminders).toContain('?session=${sessionId}#outreach');
    expect(reminders).toContain('Open the task: ${taskUrl}');
  });
});
