import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OutreachComposer } from "@/components/outreach-composer";
import { ManualReviewNotice } from "@/components/manual-review-notice";
import { LeadAnalysisButton } from "@/components/lead-analysis-button";
import { requireViewer } from "@/lib/security/auth";
import { createClient } from "@/lib/supabase/server";
import { isManualReviewFinding, type LeadOutcome } from "@/lib/leads/priority";

export default async function LeadFile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queue?: string; source?: string }>;
}) {
  const user = await requireViewer();
  const { id } = await params;
  const { queue, source } = await searchParams;
  const queueIds = String(queue || "").split(",").filter(Boolean).slice(0, 10);
  const nextLeadId = queueIds[0] || null;
  const remainingQueue = queueIds.slice(1);
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id,name,category,address,city,state,website,phone,google_maps_url,reviews,rating,status,opportunity_score,notes,business_observation,next_follow_up_at,last_contacted_at,first_contacted_at,lead_outcome,follow_up_step,follow_up_stopped_at,last_audited_at,manual_review_required,manual_review_reason",
    )
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  if (!lead) notFound();

  const { data: audit } = await supabase
    .from("audits")
    .select(
      "id,status,score,website_url,final_url,http_status,page_title,meta_description,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at",
    )
    .eq("lead_id", id)
    .eq("workspace_id", user.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: findings } = audit
    ? await supabase
        .from("audit_findings")
        .select("id,code,label,severity,evidence,source_url")
        .eq("audit_id", audit.id)
    : { data: [] };

  const { data: auditJob } = await supabase
    .from("audit_jobs")
    .select("id,status,result_status,error_message,attempts,updated_at")
    .eq("lead_id", id)
    .eq("workspace_id", user.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const manualReviewFinding = (findings || []).find((finding) =>
    isManualReviewFinding(finding.code),
  );

  const nextLeadResult = nextLeadId && nextLeadId !== id
    ? await supabase
        .from("leads")
        .select("id,name,status,manual_review_required")
        .eq("id", nextLeadId)
        .eq("workspace_id", user.workspaceId)
        .maybeSingle()
    : { data: null };
  const nextLead = nextLeadResult.data &&
    !["contacted", "replied", "interested", "follow_up", "quote_sent", "won", "lost", "not_interested", "do_not_contact", "archived"].includes(nextLeadResult.data.status || "") &&
    !nextLeadResult.data.manual_review_required
      ? nextLeadResult.data
      : null;

  const [{ data: messages }, { data: outreachProfile }] = await Promise.all([
    supabase
      .from("messages")
      .select("id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,reply_summary,recommended_action,analysis_reasoning,copied_at,sent_at,created_at")
      .eq("lead_id", id)
      .eq("workspace_id", user.workspaceId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("outreach_profiles")
      .select("service_description,typical_project_range,target_customer,outreach_style,base_location,preferred_channels")
      .eq("workspace_id", user.workspaceId)
      .eq("is_default", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = {
    serviceDescription: outreachProfile?.service_description || "",
    typicalProjectRange: outreachProfile?.typical_project_range || "",
    targetCustomer: outreachProfile?.target_customer || "",
    outreachStyle: outreachProfile?.outreach_style || "",
    baseLocation: outreachProfile?.base_location || "",
    preferredChannels: outreachProfile?.preferred_channels || "",
  };
  const profileComplete = [
    profile.serviceDescription,
    profile.typicalProjectRange,
    profile.targetCustomer,
    profile.outreachStyle,
    profile.baseLocation,
  ].every((value) => value.trim().length > 0);

  return (
    <AppShell admin={user.isAdmin}>
      <div className="lead-file-head">
        <div>
          <Link className="back-link" href="/dashboard/leads">← Back to pipeline</Link>
          <div className="eyebrow">Opportunity file</div>
          <h2>{lead.name}</h2>
          <p>{lead.category || "Local business"} · {lead.address || [lead.city, lead.state].filter(Boolean).join(", ")}</p>
        </div>
        <div className="lead-file-score"><strong>{lead.opportunity_score ?? "—"}</strong><span>evidence score</span></div>
      </div>

      <div className="lead-summary-grid">
        <div className="lead-fact"><small>Current status</small><b>{String(lead.status).replaceAll("_", " ")}</b></div>
        <div className="lead-fact"><small>Google activity</small><b>{lead.rating ?? "—"} rating · {lead.reviews || 0} reviews</b></div>
        <div className="lead-fact"><small>Phone</small>{lead.phone ? <a className="lead-phone-link" href={`tel:${lead.phone}`}>{lead.phone}</a> : <b>Not listed</b>}</div>
        <div className="lead-fact"><small>Website</small><b>{lead.website ? "Found" : "Not listed"}</b></div>
      </div>

      <div className="lead-link-row">
        <LeadAnalysisButton leadId={lead.id} hasAudit={Boolean(audit)} initialRunning={auditJob?.status === "queued" || auditJob?.status === "running"} />
        {lead.website ? <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Open website</a> : null}
        {lead.google_maps_url ? <a className="btn" href={lead.google_maps_url} target="_blank" rel="noreferrer">Open Google listing</a> : null}
      </div>

      {lead.manual_review_required ? (
        <ManualReviewNotice
          leadId={lead.id}
          reason={lead.manual_review_reason || manualReviewFinding?.evidence || "Webvidence could not fully inspect this website."}
        />
      ) : null}

      <OutreachComposer
        key={lead.id}
        leadId={lead.id}
        leadName={lead.name}
        leadPhone={lead.phone || null}
        nextLeadHref={nextLead ? `/dashboard/leads/${nextLead.id}?source=${source || "search"}${remainingQueue.length ? `&queue=${remainingQueue.join(",")}` : ""}#outreach` : null}
        nextLeadName={nextLead?.name || null}
        initialStatus={lead.status || "new"}
        initialNotes={lead.notes || ""}
        initialBusinessObservation={lead.business_observation || ""}
        initialFollowUpAt={toLocalInput(lead.next_follow_up_at)}
        initialFirstContactedAt={lead.first_contacted_at || ""}
        initialFollowUpStep={Number(lead.follow_up_step || 0)}
        initialFollowUpStoppedAt={lead.follow_up_stopped_at || ""}
        initialOutcome={(lead.lead_outcome || null) as LeadOutcome | null}
        outreachProfile={profile}
        profileComplete={profileComplete}
        initialMessages={(messages || []).map((message) => ({
          ...message,
          subject: message.subject || null,
          contact_channel: message.contact_channel || null,
          intent: message.intent || null,
          parent_message_id: message.parent_message_id || null,
          reply_summary: message.reply_summary || null,
          recommended_action: message.recommended_action || null,
          analysis_reasoning: message.analysis_reasoning || null,
          copied_at: message.copied_at || null,
          sent_at: message.sent_at || null,
        }))}
      />

      <details className="evidence-file-section evidence-disclosure">
        <summary>
          <span><small>Business and website evidence</small><b>{audit ? `${findings?.length || 0} findings from ${audit.pages_crawled} checked page${audit.pages_crawled === 1 ? "" : "s"}` : auditJob?.status === "queued" || auditJob?.status === "running" ? "Website analysis is running" : "No website analysis yet"}</b></span>
          <span className="tag">{audit?.status || auditJob?.status || "not analyzed"}</span>
        </summary>
        {audit ? (
          <div className="evidence-disclosure-body">
            <div className="audit-score-row">
              <span>Performance <b>{audit.performance_score ?? "—"}</b></span>
              <span>Accessibility <b>{audit.accessibility_score ?? "—"}</b></span>
              <span>SEO <b>{audit.seo_score ?? "—"}</b></span>
              <span>Best practices <b>{audit.best_practices_score ?? "—"}</b></span>
            </div>
            <div className="lead-findings">
              {(findings || []).map((finding) => (
                <article className={`lead-finding severity-${finding.severity}`} key={finding.id}>
                  <span>{finding.severity}</span>
                  <div><b>{finding.label}</b><p>{finding.evidence}</p></div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={`notice ${auditJob?.status === "failed" ? "notice-error" : ""}`}>
            {auditJob?.status === "queued" || auditJob?.status === "running"
              ? "Analysis is running in the background. You can leave this page and return later."
              : auditJob?.status === "failed"
                ? `The analysis worker could not finish after ${auditJob.attempts || 1} attempt${auditJob.attempts === 1 ? "" : "s"}: ${auditJob.error_message || "Unknown processing error."}`
                : "Run an analysis to create verified findings. Conversation-first outreach remains available without an audit."}
          </div>
        )}
      </details>
    </AppShell>
  );
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
