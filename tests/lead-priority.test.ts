import { describe, expect, it } from 'vitest';
import {
  buildOutcomeLeadUpdate,
  buildSentMessageLeadUpdate,
  getPriorityAction,
} from '../lib/leads/priority';
import { detectAutomatedAccessBlock } from '../lib/providers/audit';

describe('lead follow-up flow', () => {
  const firstSentAt = '2026-07-18T15:00:00.000Z';

  it('schedules the first follow-up three days after initial contact', () => {
    const update = buildSentMessageLeadUpdate({
      status: 'ready_to_contact',
      channel: 'email',
      sentAt: firstSentAt,
    });

    expect(update.status).toBe('contacted');
    expect(update.first_contacted_at).toBe(firstSentAt);
    expect(update.follow_up_step).toBe(0);
    expect(update.next_follow_up_at).toBe('2026-07-21T15:00:00.000Z');
    expect(update.follow_up_stopped_at).toBeNull();
  });

  it('uses the original first-contact date for the day 7 and day 14 schedule', () => {
    const firstFollowUp = buildSentMessageLeadUpdate({
      status: 'contacted',
      channel: 'follow_up',
      sentAt: '2026-07-21T16:00:00.000Z',
      firstContactedAt: firstSentAt,
      followUpStep: 0,
    });
    expect(firstFollowUp.follow_up_step).toBe(1);
    expect(firstFollowUp.next_follow_up_at).toBe('2026-07-25T15:00:00.000Z');

    const secondFollowUp = buildSentMessageLeadUpdate({
      status: 'follow_up',
      channel: 'follow_up',
      sentAt: '2026-07-25T17:00:00.000Z',
      firstContactedAt: firstSentAt,
      followUpStep: 1,
    });
    expect(secondFollowUp.follow_up_step).toBe(2);
    expect(secondFollowUp.next_follow_up_at).toBe('2026-08-01T15:00:00.000Z');
  });

  it('stops after the third follow-up without auto-sending anything', () => {
    const update = buildSentMessageLeadUpdate({
      status: 'follow_up',
      channel: 'follow_up',
      sentAt: '2026-08-01T18:00:00.000Z',
      firstContactedAt: firstSentAt,
      followUpStep: 2,
    });

    expect(update.follow_up_step).toBe(3);
    expect(update.next_follow_up_at).toBeNull();
    expect(update.follow_up_stopped_at).toBe('2026-08-01T18:00:00.000Z');
  });

  it('does not regress an advanced lead status when another message is marked sent', () => {
    const update = buildSentMessageLeadUpdate({
      status: 'interested',
      channel: 'follow_up',
      sentAt: '2026-07-22T15:00:00.000Z',
      firstContactedAt: firstSentAt,
      followUpStep: 0,
    });
    expect(update.status).toBe('interested');
  });

  it('maps outcomes to the existing pipeline without inventing a reply', () => {
    const changedAt = '2026-07-19T12:00:00.000Z';
    expect(buildOutcomeLeadUpdate('contacted', 'meeting_booked', changedAt).status).toBe('interested');
    expect(buildOutcomeLeadUpdate('contacted', 'proposal_sent', changedAt).status).toBe('quote_sent');
    expect(buildOutcomeLeadUpdate('contacted', 'closed_won', changedAt).status).toBe('won');
    expect(buildOutcomeLeadUpdate('contacted', 'no_response', changedAt).status).toBe('contacted');
  });
});

describe("Today's Work priority", () => {
  const now = new Date('2026-07-18T12:00:00.000Z');

  it('puts overdue follow-ups ahead of untouched opportunities', () => {
    const overdue = getPriorityAction({
      status: 'contacted',
      opportunity_score: 60,
      created_at: '2026-07-01T12:00:00.000Z',
      first_contacted_at: '2026-07-10T12:00:00.000Z',
      next_follow_up_at: '2026-07-17T12:00:00.000Z',
      follow_up_step: 1,
    }, now);
    const untouched = getPriorityAction({
      status: 'ready_to_contact',
      opportunity_score: 95,
      created_at: '2026-07-17T12:00:00.000Z',
    }, now);

    expect(overdue?.kind).toBe('overdue');
    expect(untouched?.kind).toBe('never_contacted');
    expect(overdue!.rank).toBeGreaterThan(untouched!.rank);
  });

  it('does not surface completed or outcome-marked work as due', () => {
    const action = getPriorityAction({
      status: 'interested',
      opportunity_score: 90,
      created_at: '2026-07-01T12:00:00.000Z',
      lead_outcome: 'interested',
      next_follow_up_at: '2026-07-17T12:00:00.000Z',
    }, now);
    expect(action?.kind).toBe('complete');
    expect(action?.rank).toBe(-1);
  });
});

describe('blocked website classification', () => {
  it('recognizes status-based bot and rate-limit blocks', () => {
    expect(detectAutomatedAccessBlock(403, '', new Headers())).toMatch(/HTTP 403/);
    expect(detectAutomatedAccessBlock(429, '', new Headers())).toMatch(/rate-limit/i);
  });

  it('recognizes common challenge pages without classifying a normal page', () => {
    expect(detectAutomatedAccessBlock(200, '<title>Just a moment...</title><p>Checking your browser before accessing</p>', new Headers())).toMatch(/bot-protection|browser-verification/i);
    expect(detectAutomatedAccessBlock(200, '<html><title>Local Plumber</title><p>Call us today.</p></html>', new Headers())).toBeNull();
  });
});

describe('local follow-up day boundaries', () => {
  it('uses the browser offset rather than the deployment server timezone', async () => {
    const { getLocalDayBounds, normalizeTimezoneOffset } = await import('../lib/leads/timezone');
    const now = new Date('2026-07-19T01:00:00.000Z');
    const { start, end } = getLocalDayBounds(now, 300);
    expect(start.toISOString()).toBe('2026-07-18T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-19T04:59:59.999Z');
    expect(normalizeTimezoneOffset('not-a-number')).toBe(0);
    expect(normalizeTimezoneOffset(5000)).toBe(840);
  });
});
