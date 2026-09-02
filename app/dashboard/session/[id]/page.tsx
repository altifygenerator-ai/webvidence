import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ProspectSession } from '@/components/prospect-session';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditIsCurrentForWebsite } from '@/lib/leads/website';

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await requireViewer();
  const { id } = await params;
  const query = await searchParams;
  const db = createAdminClient();
  const { data: session } = await db.from('prospecting_sessions')
    .select('id,status,target_size')
    .eq('id', id).eq('workspace_id', user.workspaceId).eq('user_id', user.id).maybeSingle();
  if (!session) notFound();
  if (session.status === 'abandoned') redirect('/dashboard');

  const { data: itemRows, error: itemError } = await db.from('prospecting_session_items')
    .select('id,lead_id,position,status,pass_reason').eq('session_id', id).order('position');
  if (itemError || !itemRows?.length) notFound();
  const leadIds = itemRows.map((item) => item.lead_id);
  const [{ data: leadRows }, { data: audits }, { data: contactRows }] = await Promise.all([
    db.from('leads').select('id,name,category,city,state,website,website_updated_by_user_at,phone,rating,reviews,google_maps_url,opportunity_score,business_status').eq('workspace_id', user.workspaceId).in('id', leadIds),
    db.from('audits').select('id,lead_id,created_at,score').eq('workspace_id', user.workspaceId).in('lead_id', leadIds).order('created_at', { ascending: false }),
    db.from('lead_contact_paths').select('id,lead_id,kind,value,source_url').eq('workspace_id', user.workspaceId).in('lead_id', leadIds),
  ]);
  const leadMap = new Map((leadRows || []).map((lead) => [lead.id, lead]));
  const auditMap = new Map<string, NonNullable<typeof audits>[number]>();
  for (const audit of audits || []) if (!auditMap.has(audit.lead_id)) auditMap.set(audit.lead_id, audit);
  const currentAudits = Array.from(auditMap.values()).filter((audit) => {
    const lead = leadMap.get(audit.lead_id);
    return lead && auditIsCurrentForWebsite(audit.created_at, lead.website_updated_by_user_at);
  });
  const { data: findings } = currentAudits.length
    ? await db.from('audit_findings').select('audit_id,code,label,severity,evidence').in('audit_id', currentAudits.map((audit) => audit.id))
    : { data: [] };
  const auditByLead = new Map(currentAudits.map((audit) => [audit.lead_id, audit]));
  const items = itemRows.map((item) => {
    const lead = leadMap.get(item.lead_id);
    if (!lead) return null;
    const audit = auditByLead.get(lead.id);
    const leadFindings = (findings || []).filter((finding) => finding.audit_id === audit?.id);
    const opportunity = leadFindings.find((finding) => finding.severity === 'high') || leadFindings.find((finding) => finding.severity === 'medium') || leadFindings[0];
    const paths = (contactRows || []).filter((path) => path.lead_id === lead.id).map((path) => ({ id: path.id, kind: path.kind, value: path.value, sourceUrl: path.source_url }));
    if (lead.phone && !paths.some((path) => path.kind === 'phone')) paths.push({ id: `phone-${lead.id}`, kind: 'phone', value: lead.phone, sourceUrl: lead.google_maps_url || '' });
    return {
      id: item.id, leadId: lead.id, position: item.position, status: item.status,
      name: lead.name, category: lead.category || '', city: lead.city || '', state: lead.state || '', website: lead.website,
      phone: lead.phone, rating: lead.rating === null ? null : Number(lead.rating), reviews: Number(lead.reviews || 0), googleMapsUrl: lead.google_maps_url, opportunityScore: lead.opportunity_score,
      opportunity: opportunity?.label || (lead.website ? 'A closer review is worthwhile' : 'No website is linked on the public listing'),
      opportunityEvidence: opportunity?.evidence || 'Webvidence found enough public activity and opportunity to make this business worth a quick decision.',
      activeReason: activityReason(Number(lead.reviews || 0), lead.rating === null ? null : Number(lead.rating), lead.business_status),
      selectionReason: selectionReason(Number(lead.reviews || 0), opportunity?.label, paths),
      contactPaths: paths,
      findings: leadFindings.map((finding) => ({ code: finding.code, label: finding.label, severity: finding.severity, evidence: finding.evidence })),
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return <AppShell admin={user.isAdmin} focused><ProspectSession sessionId={id} initialStatus={session.status} items={items} returnedFromReminder={query.from === 'reminder'} /></AppShell>;
}

function activityReason(reviews: number, rating: number | null, status: string | null) {
  if (status === 'OPERATIONAL' && reviews > 0) return `Active · ${reviews} reviews`;
  if (reviews >= 10) return `${reviews} public reviews`;
  if (rating) return `${rating.toFixed(1)} public rating`;
  return 'Public listing found';
}
function selectionReason(reviews: number, opportunity: string | undefined, paths: Array<{ kind: string }>) {
  const activity = reviews > 0 ? `The business has ${reviews} public review${reviews === 1 ? '' : 's'}` : 'The business has an active public listing';
  const reach = paths.length ? ` and ${paths.length === 1 ? 'a usable public contact path' : 'multiple public contact paths'}` : '';
  const finding = opportunity ? `. The clearest opportunity is ${opportunity.toLowerCase()}` : '';
  return `${activity}${reach}${finding}.`;
}
