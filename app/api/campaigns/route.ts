import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const patchSchema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(['active', 'paused', 'archived']),
});

const campaignIdSchema = z.string().uuid();

type FindingRow = {
  audit_id: string;
  code: string;
  label: string;
  severity: string;
  evidence: string;
};

export async function GET(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  const db = createAdminClient();
  const url = new URL(req.url);
  const requestedCampaignId = url.searchParams.get('campaignId');

  if (!requestedCampaignId) {
    const { data, error } = await db.from('campaigns')
      .select('id,name,category,location,radius_miles,status,created_at,updated_at')
      .eq('workspace_id', user.workspaceId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaigns: data || [] }, { headers: { 'cache-control': 'no-store' } });
  }

  const parsedCampaignId = campaignIdSchema.safeParse(requestedCampaignId);
  if (!parsedCampaignId.success) {
    return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await db.from('campaigns')
    .select('id,name,category,location,radius_miles,status,created_at,updated_at')
    .eq('id', parsedCampaignId.data)
    .eq('workspace_id', user.workspaceId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 400 });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  const { data: leadRows, error: leadError } = await db.from('leads')
    .select('id,google_place_id,name,category,address,city,state,website,phone,reviews,rating,google_maps_url,raw_provider_data,opportunity_score,status,updated_at')
    .eq('workspace_id', user.workspaceId)
    .eq('campaign_id', campaign.id)
    .neq('status', 'archived')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(100);
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 });

  const leadIds = (leadRows || []).map((lead) => lead.id);
  if (!leadIds.length) {
    return NextResponse.json({ campaign, leads: [], count: 0 }, { headers: { 'cache-control': 'no-store' } });
  }

  const [{ data: audits, error: auditError }, { data: jobs, error: jobError }] = await Promise.all([
    db.from('audits')
      .select('id,lead_id,status,score,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at')
      .eq('workspace_id', user.workspaceId)
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false }),
    db.from('audit_jobs')
      .select('id,lead_id,status,error_message,created_at,updated_at')
      .eq('workspace_id', user.workspaceId)
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false }),
  ]);
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 400 });
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 400 });

  const latestAuditByLead = new Map<string, NonNullable<typeof audits>[number]>();
  for (const audit of audits || []) {
    if (!latestAuditByLead.has(audit.lead_id)) latestAuditByLead.set(audit.lead_id, audit);
  }

  const latestJobByLead = new Map<string, NonNullable<typeof jobs>[number]>();
  for (const job of jobs || []) {
    if (!latestJobByLead.has(job.lead_id)) latestJobByLead.set(job.lead_id, job);
  }

  const auditIds = Array.from(latestAuditByLead.values()).map((audit) => audit.id);
  const { data: findings, error: findingsError } = auditIds.length
    ? await db.from('audit_findings')
      .select('audit_id,code,label,severity,evidence')
      .in('audit_id', auditIds)
    : { data: [], error: null };
  if (findingsError) return NextResponse.json({ error: findingsError.message }, { status: 400 });

  const findingsByAudit = new Map<string, FindingRow[]>();
  for (const finding of (findings || []) as FindingRow[]) {
    const current = findingsByAudit.get(finding.audit_id) || [];
    current.push(finding);
    findingsByAudit.set(finding.audit_id, current);
  }

  const leads = (leadRows || []).map((lead) => {
    const audit = latestAuditByLead.get(lead.id) || null;
    const job = latestJobByLead.get(lead.id) || null;
    const raw = lead.raw_provider_data && typeof lead.raw_provider_data === 'object'
      ? lead.raw_provider_data as Record<string, unknown>
      : {};
    const rawDistance = raw.distanceMiles;
    const distanceMiles = typeof rawDistance === 'number' && Number.isFinite(rawDistance)
      ? rawDistance
      : null;

    let auditStatus: 'queued' | 'running' | 'completed' | 'failed' | undefined;
    if (job?.status === 'queued' || job?.status === 'running') auditStatus = job.status;
    else if (job?.status === 'failed' || job?.status === 'cancelled') auditStatus = 'failed';
    else if (audit) auditStatus = 'completed';

    return {
      id: lead.id,
      googlePlaceId: lead.google_place_id,
      name: lead.name,
      category: lead.category || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      website: lead.website,
      phone: lead.phone,
      reviews: lead.reviews || 0,
      rating: lead.rating === null ? null : Number(lead.rating),
      googleMapsUrl: lead.google_maps_url,
      distanceMiles,
      opportunityScore: lead.opportunity_score,
      auditStatus,
      auditJobId: job?.id || null,
      auditError: job?.error_message || null,
      audit: audit ? {
        id: audit.id,
        score: audit.score,
        status: audit.status,
        pagesCrawled: audit.pages_crawled,
        performanceScore: audit.performance_score,
        accessibilityScore: audit.accessibility_score,
        seoScore: audit.seo_score,
        bestPracticesScore: audit.best_practices_score,
        findings: findingsByAudit.get(audit.id) || [],
      } : null,
    };
  });

  return NextResponse.json({ campaign, leads, count: leads.length }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = patchSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db.from('campaigns')
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq('id', input.campaignId)
      .eq('workspace_id', user.workspaceId)
      .select('id,name,category,location,radius_miles,status,created_at,updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaign: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
