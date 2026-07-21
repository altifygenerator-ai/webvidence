import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFeedbackEmailText, feedbackSchema, feedbackSubject } from '@/lib/feedback';

const validFeedback = {
  name: 'Ethan',
  email: 'ethan@example.com',
  businessName: 'Arctikdev',
  website: 'https://example.com',
  usageFrequency: 'several_weekly',
  featuresUsed: ['business_search', 'website_audits', 'outreach_drafts'],
  previousWorkflow: 'Google Maps and a spreadsheet.',
  easeImpact: 'a_lot',
  timeSavingDetail: 'It cuts down the research.',
  contactedCount: 'six_to_fifteen',
  noContactReason: '',
  repliesCount: 'a_few',
  replyTypes: ['normal_conversation', 'pricing'],
  outcome: 'quote_or_proposal',
  projectRange: 'not_applicable',
  workflowMostHelpful: 'Knowing where to start.',
  roughOrConfusing: 'Nothing yet.',
  wouldUseMore: 'More follow-up help.',
  usefulnessRating: 8,
  testimonialText: 'It helps me get from a search to a real message faster.',
  additionalMessage: '',
  permissionLevel: 'name_business',
  allowWrittenQuote: true,
  allowOutcomeDetails: true,
  allowBusinessIdentity: true,
  allowLightEditing: true,
  allowAnonymousStats: true,
  complimentaryAccess: true,
  contactPage: '',
} as const;

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('feedback submission', () => {
  it('validates a complete feedback response', () => {
    const result = feedbackSchema.parse(validFeedback);
    expect(result.usefulnessRating).toBe(8);
    expect(result.featuresUsed).toContain('website_audits');
  });

  it('rejects an invalid rating', () => {
    expect(() => feedbackSchema.parse({ ...validFeedback, usefulnessRating: 11 })).toThrow();
  });

  it('protects the public submission route and keeps feedback server-only', () => {
    const route = source('app/api/feedback/route.ts');
    const migration = source('supabase/006_feedback_submissions.sql');
    expect(route).toContain('assertTrustedMutation');
    expect(route).toContain('RATE_LIMITS.feedback');
    expect(route).toContain('contactPage');
    expect(route).toContain(".from('feedback_submissions')");
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.feedback_submissions from anon, authenticated');
  });

  it('builds a readable notification with permission details', () => {
    const input = feedbackSchema.parse(validFeedback);
    const text = buildFeedbackEmailText(input, { submittedAt: '2026-07-21T12:00:00.000Z' });
    expect(feedbackSubject(input)).toBe('New Webvidence feedback from Ethan');
    expect(text).toContain('Best outcome: A quote or proposal');
    expect(text).toContain('Permission level: May use name and business');
    expect(text).toContain('Complimentary tester access disclosed: Yes');
  });
});
