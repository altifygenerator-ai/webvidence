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
      "id,name,category,address,city,state,website,phone,google_maps_url,reviews,rating,status,opportunity_score,notes,next_follow_up_at,last_contacted_at,first_contacted_at,lead_outcome,follow_up_step,follow_up_stopped_at,last_audited_at,manual_review_required,manual_review_reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: audit } = await supabase
    .from("audits")
    .select(
      "id,status,score,website_url,final_url,http_status,page_title,meta_description,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at",
    )
    .eq("lead_id", id)
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
        .maybeSingle()
    : { data: null };
  const nextLead = nextLeadResult.data &&
    !["contacted", "replied", "interested", "follow_up", "quote_sent", "won", "lost", "not_interested", "do_not_contact", "archived"].includes(nextLeadResult.data.status || "") &&
    !nextLeadResult.data.manual_review_required
      ? nextLeadResult.data
      : null;

  const [{ data: messages }, outreachProfileResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,channel,subject,body,status,created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("outreach_profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", user.workspaceId),
  ]);

  return (
    <AppShell admin={user.isAdmin}>
      <div className="lead-file-head">
        <div>
          <Link className="back-link" href="/dashboard/leads">
            ← Back to pipeline
          </Link>
          <div className="eyebrow">Opportunity file</div>
          <h2>{lead.name}</h2>
          <p>
            {lead.category || "Local business"} ·{" "}
            {lead.address || [lead.city, lead.state].filter(Boolean).join(", ")}
          </p>
        </div>
        <div className="lead-file-score">
          <strong>{lead.opportunity_score ?? "—"}</strong>
          <span>evidence score</span>
        </div>
      </div>

      <div className="lead-summary-grid">
        <div className="lead-fact">
          <small>Current status</small>
          <b>{String(lead.status).replaceAll("_", " ")}</b>
        </div>
        <div className="lead-fact">
          <small>Google activity</small>
          <b>
            {lead.rating ?? "—"} rating · {lead.reviews || 0} reviews
          </b>
        </div>
        <div className="lead-fact">
          <small>Phone</small>
          {lead.phone ? (
            <a className="lead-phone-link" href={`tel:${lead.phone}`}>
              {lead.phone}
            </a>
          ) : (
            <b>Not listed</b>
          )}
        </div>
        <div className="lead-fact">
          <small>Website</small>
          <b>{lead.website ? "Found" : "Not listed"}</b>
        </div>
      </div>

      <div className="lead-link-row">
        <LeadAnalysisButton
          leadId={lead.id}
          hasAudit={Boolean(audit)}
          initialRunning={
            auditJob?.status === "queued" || auditJob?.status === "running"
          }
        />
        {lead.website ? (
          <a
            className="btn"
            href={lead.website}
            target="_blank"
            rel="noreferrer"
          >
            Open website
          </a>
        ) : null}
        {lead.google_maps_url ? (
          <a
            className="btn"
            href={lead.google_maps_url}
            target="_blank"
            rel="noreferrer"
          >
            Open Google listing
          </a>
        ) : null}
      </div>

      {lead.manual_review_required ? (
        <ManualReviewNotice
          leadId={lead.id}
          reason={
            lead.manual_review_reason ||
            manualReviewFinding?.evidence ||
            "Webvidence could not fully inspect this website."
          }
        />
      ) : null}

      <section className="evidence-file-section">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Verified site evidence</div>
            <h3>
              {audit
                ? `${findings?.length || 0} findings from ${audit.pages_crawled} checked page${audit.pages_crawled === 1 ? "" : "s"}`
                : auditJob?.status === "queued" ||
                    auditJob?.status === "running"
                  ? "Website analysis is running"
                  : "No website analysis yet"}
            </h3>
          </div>
          {audit ? (
            <span className="tag">{audit.status}</span>
          ) : auditJob ? (
            <span className="tag">{auditJob.status}</span>
          ) : null}
        </div>
        {audit ? (
          <>
            <div className="audit-score-row">
              <span>
                Performance <b>{audit.performance_score ?? "—"}</b>
              </span>
              <span>
                Accessibility <b>{audit.accessibility_score ?? "—"}</b>
              </span>
              <span>
                SEO <b>{audit.seo_score ?? "—"}</b>
              </span>
              <span>
                Best practices <b>{audit.best_practices_score ?? "—"}</b>
              </span>
            </div>
            <div className="lead-findings">
              {(findings || []).map((finding) => (
                <article
                  className={`lead-finding severity-${finding.severity}`}
                  key={finding.id}
                >
                  <span>{finding.severity}</span>
                  <div>
                    <b>{finding.label}</b>
                    <p>{finding.evidence}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div
            className={`notice ${auditJob?.status === "failed" ? "notice-error" : ""}`}
          >
            {auditJob?.status === "queued" || auditJob?.status === "running"
              ? "Analysis is running in the background. You can leave this page and return later."
              : auditJob?.status === "failed"
                ? `The analysis worker could not finish after ${auditJob.attempts || 1} attempt${auditJob.attempts === 1 ? "" : "s"}: ${auditJob.error_message || "Unknown processing error."}`
                : "Run an analysis here to create verified findings before generating evidence-backed outreach."}
          </div>
        )}
      </section>

      <OutreachComposer
        leadId={lead.id}
        leadName={lead.name}
        leadPhone={lead.phone || null}
        nextLeadHref={nextLead ? `/dashboard/leads/${nextLead.id}?source=${source || "search"}${remainingQueue.length ? `&queue=${remainingQueue.join(",")}` : ""}#outreach` : null}
        nextLeadName={nextLead?.name || null}
        initialStatus={lead.status || "new"}
        initialNotes={lead.notes || ""}
        initialFollowUpAt={toLocalInput(lead.next_follow_up_at)}
        initialFirstContactedAt={lead.first_contacted_at || ""}
        initialFollowUpStep={Number(lead.follow_up_step || 0)}
        initialFollowUpStoppedAt={lead.follow_up_stopped_at || ""}
        initialOutcome={(lead.lead_outcome || null) as LeadOutcome | null}
        hasOutreachProfile={(outreachProfileResult.count || 0) > 0}
        initialMessages={(messages || []).map((message) => ({
          ...message,
          subject: message.subject || null,
        }))}
      />
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
