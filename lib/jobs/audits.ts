import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAudit, refundUsage } from '@/lib/security/entitlements';
import { auditWebsite } from '@/lib/providers/audit';
import { saveLeadAudit } from '@/lib/data/audits';
import { logApiUsage } from '@/lib/data/api-usage';
import type { PlanId } from '@/lib/plans';

type QueueUser = {
  id: string;
  workspaceId: string;
  plan: PlanId;
  isAdmin: boolean;
};

type QueueLead = {
  id: string;
  website: string | null;
  reviews: number;
  name?: string;
};

export type QueuedAudit = {
  leadId: string;
  jobId: string | null;
  status: 'queued' | 'completed' | 'limit_reached' | 'already_queued';
  audit?: Awaited<ReturnType<typeof saveLeadAudit>>;
};

export async function queueLeadAudits(user: QueueUser, leads: QueueLead[]) {
  const db = createAdminClient();
  const results: QueuedAudit[] = [];
  const jobIds: string[] = [];
  let limitReached = false;

  for (const lead of leads) {
    if (!lead.website) {
      const audit = await auditWebsite(null, { runPageSpeed: false, maxPages: 1 });
      const saved = await saveLeadAudit({
        workspaceId: user.workspaceId,
        userId: user.id,
        leadId: lead.id,
        audit,
        reviews: lead.reviews,
      });
      results.push({ leadId: lead.id, jobId: saved.jobId || null, status: 'completed', audit: saved });
      continue;
    }

    const { data: openJob } = await db.from('audit_jobs')
      .select('id,status')
      .eq('lead_id', lead.id)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openJob) {
      results.push({ leadId: lead.id, jobId: openJob.id, status: 'already_queued' });
      jobIds.push(openJob.id);
      continue;
    }

    try {
      await consumeAudit(user);
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
        limitReached = true;
        results.push({ leadId: lead.id, jobId: null, status: 'limit_reached' });
        break;
      }
      throw error;
    }

    const { data: job, error: jobError } = await db.from('audit_jobs')
      .insert({
        workspace_id: user.workspaceId,
        lead_id: lead.id,
        user_id: user.id,
        status: 'queued',
        attempts: 0,
        usage_reserved: true,
        credit_refunded: false,
        available_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError) {
      await refundUsage(user, 'audit');
      throw new Error(`Could not queue ${lead.name || 'website'} for analysis: ${jobError.message}`);
    }

    results.push({ leadId: lead.id, jobId: job.id, status: 'queued' });
    jobIds.push(job.id);
  }

  return { results, jobIds: Array.from(new Set(jobIds)), limitReached };
}

export async function processAuditJobs(jobIds: string[], concurrency = 2) {
  const ids = Array.from(new Set(jobIds)).slice(0, 20);
  return mapWithConcurrency(ids, Math.max(1, Math.min(concurrency, 3)), processAuditJob);
}

export async function processQueuedAuditJobs(limit = 5) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 8 * 60_000).toISOString();

  // A serverless worker can be terminated after it claims a job. Jobs below
  // the retry ceiling are safely released. A stale third attempt is closed and
  // refunded so it cannot sit in a permanent running state.
  const { data: exhausted } = await db.from('audit_jobs')
    .select('id,user_id,attempts,usage_reserved,credit_refunded')
    .eq('status', 'running')
    .lt('locked_at', staleCutoff)
    .gte('attempts', 3);

  for (const job of exhausted || []) {
    const { data: closed } = await db.from('audit_jobs')
      .update({
        status: 'failed',
        error_message: 'The analysis worker stopped before the final attempt completed. The analysis credit was returned.',
        locked_at: null,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'running')
      .select('id')
      .maybeSingle();

    if (closed && job.usage_reserved && !job.credit_refunded) {
      const { data: profile } = await db.from('profiles').select('plan,is_admin').eq('id', job.user_id).maybeSingle();
      if (profile) {
        await refundUsage({ id: job.user_id, plan: profile.plan, isAdmin: profile.is_admin }, 'audit');
        await db.from('audit_jobs').update({ credit_refunded: true }).eq('id', job.id);
      }
    }
  }

  await db.from('audit_jobs')
    .update({ status: 'queued', locked_at: null, available_at: now, updated_at: now })
    .eq('status', 'running')
    .lt('locked_at', staleCutoff)
    .lt('attempts', 3);

  const { data: jobs, error } = await db.from('audit_jobs')
    .select('id')
    .eq('status', 'queued')
    .lte('available_at', now)
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 20)));
  if (error) throw new Error(`Could not load queued audits: ${error.message}`);
  return processAuditJobs((jobs || []).map((job) => job.id));
}

export async function processAuditJob(jobId: string) {
  const db = createAdminClient();
  const { data: current, error: currentError } = await db.from('audit_jobs')
    .select('id,workspace_id,lead_id,user_id,status,attempts,usage_reserved,credit_refunded')
    .eq('id', jobId)
    .maybeSingle();
  if (currentError || !current) return { jobId, status: 'missing' as const };
  if (current.status === 'completed' || current.status === 'cancelled') return { jobId, status: current.status };
  if (current.status === 'running' && current.attempts > 0) return { jobId, status: 'running' as const };

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await db.from('audit_jobs')
    .update({
      status: 'running',
      attempts: Number(current.attempts || 0) + 1,
      locked_at: startedAt,
      started_at: startedAt,
      error_message: null,
      updated_at: startedAt,
    })
    .eq('id', jobId)
    .eq('status', current.status)
    .select('id,workspace_id,lead_id,user_id,attempts,usage_reserved,credit_refunded')
    .maybeSingle();
  if (claimError || !claimed) return { jobId, status: 'not_claimed' as const };

  try {
    const { data: lead, error: leadError } = await db.from('leads')
      .select('id,website,reviews,name')
      .eq('id', claimed.lead_id)
      .eq('workspace_id', claimed.workspace_id)
      .single();
    if (leadError || !lead) throw new Error('The saved business could not be loaded.');

    const audit = await auditWebsite(lead.website, { runPageSpeed: true, maxPages: 6 });
    const saved = await saveLeadAudit({
      workspaceId: claimed.workspace_id,
      userId: claimed.user_id,
      leadId: lead.id,
      audit,
      reviews: lead.reviews,
      auditJobId: jobId,
    });

    if (lead.website) {
      await logApiUsage({
        workspaceId: claimed.workspace_id,
        userId: claimed.user_id,
        provider: 'google_pagespeed',
        operation: 'mobile_lighthouse',
        units: 1,
        metadata: {
          leadId: lead.id,
          auditId: saved.id,
          pagesCrawled: audit.pagesCrawled,
          available: !audit.raw.pagespeedError,
        },
      });
    }

    return { jobId, leadId: lead.id, status: 'completed' as const, audit: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    const attempts = Number(claimed.attempts || 1);
    const retry = attempts < 3;
    const update = retry
      ? {
          status: 'queued',
          error_message: message,
          locked_at: null,
          available_at: new Date(Date.now() + attempts * 30_000).toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          status: 'failed',
          error_message: message,
          locked_at: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
    await db.from('audit_jobs').update(update).eq('id', jobId);

    if (!retry && claimed.usage_reserved && !claimed.credit_refunded) {
      const { data: profile } = await db.from('profiles').select('plan,is_admin').eq('id', claimed.user_id).maybeSingle();
      if (profile) {
        await refundUsage({ id: claimed.user_id, plan: profile.plan, isAdmin: profile.is_admin }, 'audit');
        await db.from('audit_jobs').update({ credit_refunded: true }).eq('id', jobId);
      }
    }
    console.error(`Audit job ${jobId} failed:`, error);
    return { jobId, status: retry ? 'queued' as const : 'failed' as const, error: message };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
