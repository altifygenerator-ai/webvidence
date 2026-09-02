import { describe, expect, it } from 'vitest';
import {
  getContactRecommendation,
  getTopContactRecommendations,
} from '@/lib/leads/recommendation';

const baseLead = {
  id: 'lead-1',
  name: 'Carter Tree Service',
  website: 'https://example.com',
  phone: '870-555-0101',
  googleMapsUrl: 'https://maps.example.com',
  reviews: 24,
  rating: 4.7,
  opportunityScore: 72,
  status: 'ready_to_contact',
  auditStatus: 'completed',
  audit: {
    status: 'completed',
    findings: [
      {
        code: 'performance',
        label: 'Mobile performance score is weak',
        severity: 'high' as const,
        evidence: 'Google PageSpeed returned 41/100 on mobile.',
      },
    ],
  },
};

describe('contact recommendations', () => {
  it('translates useful audit evidence into a plain reason', () => {
    const recommendation = getContactRecommendation(baseLead);
    expect(recommendation?.reason).toBe('The site appeared slow when checked on a phone.');
    expect(recommendation?.signals).toContain('Phone available');
  });

  it('does not recommend contacted, blocked, or still-running leads', () => {
    expect(getContactRecommendation({ ...baseLead, status: 'contacted' })).toBeNull();
    expect(getContactRecommendation({ ...baseLead, auditStatus: 'running', audit: null })).toBeNull();
    expect(
      getContactRecommendation({
        ...baseLead,
        audit: {
          status: 'partial',
          findings: [
            {
              code: 'automated_check_blocked',
              label: 'Automated check blocked',
              severity: 'medium',
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it('puts the strongest contactable leads first', () => {
    const top = getTopContactRecommendations([
      { ...baseLead, id: 'lower', opportunityScore: 35, reviews: 1 },
      { ...baseLead, id: 'higher', opportunityScore: 88, reviews: 60 },
      { ...baseLead, id: 'sent', status: 'contacted' },
    ]);
    expect(top.map((item) => item.lead.id)).toEqual(['higher', 'lower']);
  });
});
