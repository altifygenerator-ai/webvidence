import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { OutreachComposer } from '@/components/outreach-composer';
import { requireViewer } from '@/lib/security/auth';
import { createClient } from '@/lib/supabase/server';

export default async function LeadFile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireViewer();
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from('leads')
    .select('id,name,category,address,city,state,website,phone,google_maps_url,reviews,rating,status,opportunity_score,notes,next_follow_up_at,last_contacted_at,last_audited_at')
    .eq('id', id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: audit } = await supabase
    .from('audits')
    .select('id,status,score,website_url,final_url,http_status,page_title,meta_description,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: findings } = audit
    ? await supabase.from('audit_findings').select('id,code,label,severity,evidence,source_url').eq('audit_id', audit.id)
    : { data: [] };

  const { data: messages } = await supabase
    .from('messages')
    .select('id,channel,subject,body,status,created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(40);

  return (
    <AppShell admin={user.isAdmin}>
      <div className="lead-file-head">
        <div>
          <Link className="back-link" href="/dashboard/leads">← Back to pipeline</Link>
          <div className="eyebrow">Opportunity file</div>
          <h2>{lead.name}</h2>
          <p>{lead.category || 'Local business'} · {lead.address || [lead.city, lead.state].filter(Boolean).join(', ')}</p>
        </div>
        <div className="lead-file-score"><strong>{lead.opportunity_score ?? '—'}</strong><span>evidence score</span></div>
      </div>

      <div className="lead-summary-grid">
        <div className="lead-fact"><small>Current status</small><b>{String(lead.status).replaceAll('_', ' ')}</b></div>
        <div className="lead-fact"><small>Google activity</small><b>{lead.rating ?? '—'} rating · {lead.reviews || 0} reviews</b></div>
        <div className="lead-fact"><small>Phone</small><b>{lead.phone || 'Not listed'}</b></div>
        <div className="lead-fact"><small>Website</small><b>{lead.website ? 'Found' : 'Not listed'}</b></div>
      </div>

      <div className="lead-link-row">
        {lead.website ? <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Open website</a> : null}
        {lead.google_maps_url ? <a className="btn" href={lead.google_maps_url} target="_blank" rel="noreferrer">Open Google listing</a> : null}
      </div>

      <section className="evidence-file-section">
        <div className="panel-heading">
          <div><div className="eyebrow">Verified site evidence</div><h3>{audit ? `${findings?.length || 0} findings from latest analysis` : 'No website analysis yet'}</h3></div>
          {audit ? <span className="tag">{audit.status}</span> : null}
        </div>
        {audit ? (
          <>
            <div className="audit-score-row">
              <span>Performance <b>{audit.performance_score ?? '—'}</b></span>
              <span>Accessibility <b>{audit.accessibility_score ?? '—'}</b></span>
              <span>SEO <b>{audit.seo_score ?? '—'}</b></span>
              <span>Best practices <b>{audit.best_practices_score ?? '—'}</b></span>
            </div>
            <div className="lead-findings">
              {(findings || []).map((finding) => (
                <article className={`lead-finding severity-${finding.severity}`} key={finding.id}>
                  <span>{finding.severity}</span><div><b>{finding.label}</b><p>{finding.evidence}</p></div>
                </article>
              ))}
            </div>
          </>
        ) : <div className="notice">Run an analysis from the prospect search screen before generating evidence-backed outreach.</div>}
      </section>

      <OutreachComposer
        leadId={lead.id}
        initialStatus={lead.status || 'new'}
        initialNotes={lead.notes || ''}
        initialFollowUpAt={toLocalInput(lead.next_follow_up_at)}
        initialMessages={(messages || []).map((message) => ({ ...message, subject: message.subject || null }))}
      />
    </AppShell>
  );
}

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
