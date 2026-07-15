import { after, NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { processAuditJobs } from '@/lib/jobs/audits';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  const url = new URL(req.url);
  const leadIds = Array.from(new Set((url.searchParams.get('leadIds') || '').split(',').filter(Boolean))).slice(0, 40);
  if (!leadIds.length) return NextResponse.json({ items: [] });

  const db = createAdminClient();
  const { data: jobs, error } = await db.from('audit_jobs')
    .select('id,lead_id,status,result_status,error_message,attempts,created_at,updated_at')
    .eq('workspace_id', user.workspaceId)
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latestByLead = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs || []) if (!latestByLead.has(job.lead_id)) latestByLead.set(job.lead_id, job);

  const queuedIds = Array.from(latestByLead.values())
    .filter((job) => job.status === 'queued')
    .map((job) => job.id);
  if (queuedIds.length) {
    after(async () => {
      await processAuditJobs(queuedIds, 2);
    });
  }

  const { data: audits } = await db.from('audits')
    .select('id,lead_id,status,score,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at')
    .eq('workspace_id', user.workspaceId)
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });
  const latestAuditByLead = new Map<string, NonNullable<typeof audits>[number]>();
  for (const audit of audits || []) if (!latestAuditByLead.has(audit.lead_id)) latestAuditByLead.set(audit.lead_id, audit);

  const auditIds = Array.from(latestAuditByLead.values()).map((audit) => audit.id);
  const { data: findings } = auditIds.length
    ? await db.from('audit_findings').select('audit_id,code,label,severity,evidence').in('audit_id', auditIds)
    : { data: [] as Array<{ audit_id: string; code: string; label: string; severity: string; evidence: string }> };
  const findingsByAudit = new Map<string, typeof findings>();
  for (const finding of findings || []) {
    const current = findingsByAudit.get(finding.audit_id) || [];
    current.push(finding);
    findingsByAudit.set(finding.audit_id, current);
  }

  const items = leadIds.map((leadId) => {
    const job = latestByLead.get(leadId) || null;
    const audit = latestAuditByLead.get(leadId) || null;
    return {
      leadId,
      jobId: job?.id || null,
      status: job?.status || (audit ? 'completed' : 'missing'),
      resultStatus: job?.result_status || audit?.status || null,
      error: job?.error_message || null,
      attempts: job?.attempts || 0,
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

  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
}
