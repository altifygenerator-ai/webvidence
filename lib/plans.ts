export type PlanId = 'free' | 'starter' | 'freelancer' | 'studio' | 'admin';
export type CustomerPlanId = Exclude<PlanId, 'admin'>;
export type PaidPlanId = Exclude<CustomerPlanId, 'free'>;

export const CUSTOMER_PLAN_ORDER: CustomerPlanId[] = ['free', 'starter', 'freelancer', 'studio'];

export const PLANS = {
  free: { name: 'Free', price: 0, searches: 5, audits: 10, messages: 20, campaigns: 5, saved: 50, exports: false, team: 1 },
  starter: { name: 'Starter', price: 19, searches: 40, audits: 75, messages: 250, campaigns: 10, saved: 250, exports: true, team: 1 },
  freelancer: { name: 'Freelancer', price: 39, searches: 150, audits: 250, messages: 1000, campaigns: 25, saved: 2000, exports: true, team: 1 },
  studio: { name: 'Studio', price: 79, searches: 500, audits: 750, messages: 3000, campaigns: 100, saved: 10000, exports: true, team: 3 },
  admin: { name: 'Admin', price: 0, searches: 999999, audits: 999999, messages: 999999, campaigns: 999999, saved: 999999, exports: true, team: 99 },
} as const;

export function isCustomerPlan(value: string | null | undefined): value is CustomerPlanId {
  return CUSTOMER_PLAN_ORDER.includes(value as CustomerPlanId);
}

export function isPaidPlan(value: string | null | undefined): value is PaidPlanId {
  return value === 'starter' || value === 'freelancer' || value === 'studio';
}

export function planRank(plan: PlanId | null | undefined) {
  if (plan === 'admin') return Number.POSITIVE_INFINITY;
  const rank = CUSTOMER_PLAN_ORDER.indexOf((plan || 'free') as CustomerPlanId);
  return rank < 0 ? 0 : rank;
}

export function nextPaidPlan(plan: PlanId | null | undefined): PaidPlanId | null {
  if (plan === 'free') return 'starter';
  if (plan === 'starter') return 'freelancer';
  if (plan === 'freelancer') return 'studio';
  return null;
}

export function priceId(plan: PaidPlanId) {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] || '';
}

export function planFromPriceId(value: string | null | undefined): PaidPlanId | null {
  if (!value) return null;
  for (const plan of ['starter', 'freelancer', 'studio'] as const) {
    if (priceId(plan) === value) return plan;
  }
  return null;
}
