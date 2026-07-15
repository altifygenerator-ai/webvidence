import { describe, expect, it } from 'vitest';
import { PLANS, nextPaidPlan, planRank } from '../lib/plans';

describe('plans', () => {
  it('keeps upgrades monotonic', () => {
    expect(PLANS.starter.searches).toBeGreaterThan(PLANS.free.searches);
    expect(PLANS.freelancer.searches).toBeGreaterThan(PLANS.starter.searches);
    expect(PLANS.studio.searches).toBeGreaterThan(PLANS.freelancer.searches);
    expect(PLANS.starter.audits).toBeGreaterThan(PLANS.free.audits);
    expect(PLANS.freelancer.audits).toBeGreaterThan(PLANS.starter.audits);
    expect(PLANS.studio.audits).toBeGreaterThan(PLANS.freelancer.audits);
    expect(PLANS.starter.messages).toBeGreaterThan(PLANS.free.messages);
    expect(PLANS.freelancer.messages).toBeGreaterThan(PLANS.starter.messages);
    expect(PLANS.studio.messages).toBeGreaterThan(PLANS.freelancer.messages);
  });

  it('orders customer plans correctly', () => {
    expect(planRank('starter')).toBeGreaterThan(planRank('free'));
    expect(planRank('freelancer')).toBeGreaterThan(planRank('starter'));
    expect(planRank('studio')).toBeGreaterThan(planRank('freelancer'));
  });

  it('stops upgrades at studio', () => {
    expect(nextPaidPlan('free')).toBe('starter');
    expect(nextPaidPlan('starter')).toBe('freelancer');
    expect(nextPaidPlan('freelancer')).toBe('studio');
    expect(nextPaidPlan('studio')).toBeNull();
  });
});
