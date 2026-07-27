export const WEBSITE_SOURCES = ['google_places', 'user'] as const;
export type WebsiteSource = (typeof WEBSITE_SOURCES)[number];

export const WEBSITE_VERIFICATION_STATUSES = [
  'google_linked',
  'user_confirmed',
  'not_linked',
] as const;
export type WebsiteVerificationStatus = (typeof WEBSITE_VERIFICATION_STATUSES)[number];

export function normalizeWebsiteInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a website address.');

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Use a normal HTTP or HTTPS website address.');
  }
  if (url.username || url.password) {
    throw new Error('Website addresses containing login details are not allowed.');
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new Error('Use a website address on the standard web ports.');
  }

  url.hash = '';
  return url.toString();
}

export function websiteStatusLabel(input: {
  website?: string | null;
  source?: string | null;
  verificationStatus?: string | null;
}) {
  if (!input.website) return 'Not linked on Google';
  if (input.source === 'user' || input.verificationStatus === 'user_confirmed') {
    return 'Added and confirmed by you';
  }
  return 'Linked on Google';
}

export function websiteStatusDescription(input: {
  website?: string | null;
  source?: string | null;
  verificationStatus?: string | null;
}) {
  if (!input.website) {
    return 'Google did not return a website for this listing. That does not prove the business has no website.';
  }
  if (input.source === 'user' || input.verificationStatus === 'user_confirmed') {
    return 'This address was added or corrected by someone in your workspace.';
  }
  return 'This website address came from the Google business listing.';
}

export function auditIsCurrentForWebsite(
  auditCreatedAt?: string | null,
  websiteUpdatedByUserAt?: string | null,
) {
  if (!auditCreatedAt) return false;
  if (!websiteUpdatedByUserAt) return true;
  const auditTime = Date.parse(auditCreatedAt);
  const websiteTime = Date.parse(websiteUpdatedByUserAt);
  if (!Number.isFinite(auditTime) || !Number.isFinite(websiteTime)) return false;
  return auditTime >= websiteTime;
}
