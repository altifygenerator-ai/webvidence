export function marketResultsHref(campaignId: string) {
  const params = new URLSearchParams({ campaign: campaignId });
  return `/dashboard/campaigns?${params.toString()}#campaign-results`;
}

export function leadFromMarketHref(options: {
  leadId: string;
  campaignId: string;
  queue?: string[];
}) {
  const params = new URLSearchParams({
    source: 'search',
    campaign: options.campaignId,
  });
  const queue = (options.queue || []).filter(Boolean);
  if (queue.length) params.set('queue', queue.join(','));
  return `/dashboard/leads/${options.leadId}?${params.toString()}#outreach`;
}

export function sessionLeadHref(options: {
  leadId: string;
  sessionId: string;
  campaignId?: string | null;
}) {
  const params = new URLSearchParams({ session: options.sessionId });
  if (options.campaignId) params.set('campaign', options.campaignId);
  return `/dashboard/leads/${options.leadId}?${params.toString()}#outreach`;
}

export function sessionCompleteHref(campaignId?: string | null) {
  const params = new URLSearchParams({ session: 'complete' });
  if (campaignId) params.set('campaign', campaignId);
  return `/dashboard?${params.toString()}`;
}
