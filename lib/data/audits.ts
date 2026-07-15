import { createAdminClient } from '@/lib/supabase/admin';
import type { WebsiteAudit } from '@/lib/providers/audit';

export async function saveLeadAudit(options: {
  workspaceId: string;
  userId: string;
  leadId: string;
  audit: WebsiteAudit;
  reviews?: number | null;
}) {
  const db = createAdminClient();
  const { workspaceId, userId, leadId, audit } = options;
  const opportunityScore = combinedOpportunityScore(audit.score, options.reviews || 0);

  const { data: job, error: jobError } = await db
    .from('audit_jobs')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      user_id: userId,
      status: audit.status === 'failed' ? 'failed' : 'completed',
      attempts: 1,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error_message: audit.status === 'failed' ? audit.findings[0]?.evidence || 'Audit failed' : null,
    })
    .select('id')
    .single();
  if (jobError) throw new Error(`Could not create audit job: ${jobError.message}`);

  const { data: saved, error: auditError } = await db
    .from('audits')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      audit_job_id: job.id,
      status: audit.status,
      score: opportunityScore,
      website_url: audit.websiteUrl,
      final_url: audit.finalUrl,
      http_status: audit.httpStatus,
      page_title: audit.pageTitle,
      meta_description: audit.metaDescription,
      pages_crawled: audit.pagesCrawled,
      performance_score: audit.performanceScore,
      accessibility_score: audit.accessibilityScore,
      seo_score: audit.seoScore,
      best_practices_score: audit.bestPracticesScore,
      raw: audit.raw,
    })
    .select('id')
    .single();
  if (auditError) throw new Error(`Could not save audit: ${auditError.message}`);

  if (audit.findings.length) {
    const { error: findingsError } = await db.from('audit_findings').insert(
      audit.findings.map((finding) => ({
        audit_id: saved.id,
        code: finding.code,
        label: finding.label,
        severity: finding.severity,
        evidence: finding.evidence,
        source_url: finding.sourceUrl || audit.finalUrl || audit.websiteUrl,
        metadata: finding.metadata || {},
      })),
    );
    if (findingsError) throw new Error(`Could not save audit findings: ${findingsError.message}`);
  }

  const { error: leadError } = await db
    .from('leads')
    .update({
      opportunity_score: opportunityScore,
      last_audited_at: new Date().toISOString(),
      status: opportunityScore >= 70 ? 'ready_to_contact' : 'reviewing',
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);
  if (leadError) throw new Error(`Could not update lead score: ${leadError.message}`);

  return {
    ...audit,
    id: saved.id,
    score: opportunityScore,
  };
}

export function combinedOpportunityScore(auditScore: number, reviews: number) {
  const activityBoost = reviews >= 100 ? 5 : reviews >= 40 ? 3 : reviews >= 10 ? 1 : 0;
  return Math.max(0, Math.min(100, auditScore + activityBoost));
}
