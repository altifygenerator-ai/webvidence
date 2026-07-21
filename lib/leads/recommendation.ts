export type RecommendationFinding = {
  code: string;
  label: string;
  severity: 'high' | 'medium' | 'low' | 'positive';
  evidence?: string | null;
};

export type RecommendationAudit = {
  status?: string | null;
  findings?: RecommendationFinding[] | null;
};

export type RecommendationLead = {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  googleMapsUrl?: string | null;
  reviews?: number | null;
  rating?: number | null;
  opportunityScore?: number | null;
  status?: string | null;
  audit?: RecommendationAudit | null;
  auditStatus?: string | null;
};

export type ContactRecommendation<T extends RecommendationLead = RecommendationLead> = {
  lead: T;
  rank: number;
  reason: string;
  signals: string[];
};

const CONTACTED_STATUSES = new Set([
  'contacted',
  'replied',
  'interested',
  'follow_up',
  'quote_sent',
  'won',
  'lost',
  'not_interested',
  'do_not_contact',
  'archived',
]);

const MANUAL_REVIEW_CODES = new Set([
  'automated_check_blocked',
  'website_unreachable',
  'unsafe_or_invalid_url',
]);

const FINDING_WEIGHT: Record<string, number> = {
  no_site: 28,
  homepage_not_found: 24,
  homepage_http_error: 22,
  performance: 20,
  viewport: 20,
  weak_primary_cta: 18,
  phone_cta: 16,
  service_structure: 15,
  no_form: 13,
  thin_home: 10,
  old_copyright: 8,
  missing_title: 6,
  meta_description: 5,
};

export function getTopContactRecommendations<T extends RecommendationLead>(
  leads: T[],
  limit = 3,
) {
  return leads
    .map((lead) => getContactRecommendation(lead))
    .filter((item): item is ContactRecommendation<T> => Boolean(item))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, Math.max(0, limit));
}

export function getContactRecommendation<T extends RecommendationLead>(
  lead: T,
): ContactRecommendation<T> | null {
  if (CONTACTED_STATUSES.has(String(lead.status || ''))) return null;

  const findings = lead.audit?.findings || [];
  if (findings.some((finding) => MANUAL_REVIEW_CODES.has(finding.code))) {
    return null;
  }
  if (
    lead.auditStatus === 'queued' ||
    lead.auditStatus === 'running' ||
    lead.auditStatus === 'failed' ||
    lead.auditStatus === 'limit_reached'
  ) {
    return null;
  }

  const contactable = Boolean(lead.phone || lead.googleMapsUrl || lead.website);
  if (!contactable) return null;

  const usefulFindings = findings.filter(
    (finding) => finding.severity !== 'positive' && !MANUAL_REVIEW_CODES.has(finding.code),
  );
  const strongestFinding = [...usefulFindings].sort(
    (a, b) => findingWeight(b) - findingWeight(a),
  )[0];

  let rank = Math.max(0, Number(lead.opportunityScore || 0)) * 0.65;
  if (lead.audit && lead.auditStatus !== 'queued' && lead.auditStatus !== 'running') rank += 14;
  if (!lead.website) rank += 24;
  if (lead.phone) rank += 18;
  if (lead.googleMapsUrl) rank += 4;
  if (lead.website) rank += 2;
  if (strongestFinding) rank += findingWeight(strongestFinding);

  const reviews = Math.max(0, Number(lead.reviews || 0));
  if (reviews > 0) rank += Math.min(14, Math.log2(reviews + 1) * 2.2);
  if (Number(lead.rating || 0) >= 4) rank += 3;

  const reason = getPlainLeadReason(lead, strongestFinding);
  const signals: string[] = [];
  if (lead.phone) signals.push('Phone available');
  if (reviews > 0) signals.push(`${reviews} review${reviews === 1 ? '' : 's'}`);
  if (lead.audit && usefulFindings.length > 0) signals.push('Completed check');
  if (!lead.website) signals.push('No website listed');

  return {
    lead,
    rank,
    reason,
    signals: unique(signals).slice(0, 2),
  };
}

export function getPlainLeadReason(
  lead: RecommendationLead,
  preferredFinding?: RecommendationFinding,
) {
  if (!lead.website) {
    return 'No website is listed, so there is a clear and simple reason to take a closer look.';
  }

  const finding =
    preferredFinding ||
    (lead.audit?.findings || [])
      .filter((item) => item.severity !== 'positive')
      .sort((a, b) => findingWeight(b) - findingWeight(a))[0];

  if (!finding) {
    return 'The business looks active and has a usable way to get in touch.';
  }

  const plainReasons: Record<string, string> = {
    homepage_not_found: 'The main website page went to a page that was not there.',
    homepage_http_error: 'The main website page was not loading correctly.',
    performance: 'The site appeared slow when checked on a phone.',
    viewport: 'The site may be awkward to use on a phone.',
    weak_primary_cta: 'It took some digging to find a clear way to get in touch.',
    phone_cta: 'The phone number was not easy to tap from the website.',
    no_form: 'There was no simple inquiry form on the checked pages.',
    service_structure: 'The site did not clearly break out the services offered.',
    thin_home: 'The homepage says very little about the work the business handles.',
    old_copyright: 'Parts of the site look like they may not have been updated in a while.',
    missing_title: 'The homepage is missing some basic identifying information.',
    meta_description: 'The homepage is missing a basic description of the business.',
  };

  return plainReasons[finding.code] || plainFromLabel(finding.label);
}

export function isRecommendationPending(lead: RecommendationLead) {
  return lead.auditStatus === 'queued' || lead.auditStatus === 'running';
}

function findingWeight(finding: RecommendationFinding) {
  const severityWeight =
    finding.severity === 'high' ? 18 : finding.severity === 'medium' ? 10 : finding.severity === 'low' ? 3 : 0;
  return (FINDING_WEIGHT[finding.code] || 0) + severityWeight;
}

function plainFromLabel(label: string) {
  const cleaned = String(label || '')
    .replace(/score is weak/gi, 'could use some work')
    .replace(/has room to improve/gi, 'could be easier for customers')
    .replace(/detected/gi, 'found')
    .replace(/technical seo/gi, 'website setup')
    .replace(/json-ld structured data/gi, 'behind-the-scenes business details')
    .trim();
  if (!cleaned) return 'The website check found a clear issue worth reviewing.';
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
