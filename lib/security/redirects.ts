import type { PaidPlanId } from '@/lib/plans';

export function safeNextPath(value: string | null | undefined, fallback = '/dashboard') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\r') || value.includes('\n')) return fallback;
  return value;
}

export function planCheckoutPath(plan: PaidPlanId) {
  return `/pricing?plan=${encodeURIComponent(plan)}&checkout=1`;
}

export function authPath(kind: 'signup' | 'login', plan: PaidPlanId, next = planCheckoutPath(plan)) {
  const query = new URLSearchParams({ plan, next });
  return `/${kind}?${query.toString()}`;
}
