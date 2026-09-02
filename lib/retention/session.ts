export const PASS_REASONS = [
  'strong_existing_site',
  'wrong_business_type',
  'no_contact_path',
  'inactive_business',
  'not_enough_opportunity',
  'other',
] as const;

export type PassReason = (typeof PASS_REASONS)[number];

export const PASS_REASON_LABELS: Record<PassReason, string> = {
  strong_existing_site: 'Strong existing site',
  wrong_business_type: 'Wrong business type',
  no_contact_path: 'No contact path',
  inactive_business: 'Appears inactive',
  not_enough_opportunity: 'Not enough opportunity',
  other: 'Other',
};

export function estimateSessionMinutes(size: number) {
  return Math.max(3, Math.round(size * 2.5));
}

export function getSessionSummary(items: Array<{ status: string }>) {
  return {
    reviewed: items.filter((item) => ['contacted', 'passed'].includes(item.status)).length,
    contacted: items.filter((item) => item.status === 'contacted').length,
    passed: items.filter((item) => item.status === 'passed').length,
  };
}

export function rankActionableLead(input: {
  opportunityScore?: number | null;
  reviews?: number | null;
  rating?: number | null;
  website?: string | null;
  phone?: string | null;
  businessStatus?: string | null;
}) {
  let score = Number(input.opportunityScore || 0);
  if ((input.reviews || 0) >= 10) score += 12;
  if ((input.rating || 0) >= 3.5) score += 6;
  if (input.website) score += 5;
  if (input.phone) score += 4;
  if (input.businessStatus === 'OPERATIONAL') score += 8;
  return score;
}
