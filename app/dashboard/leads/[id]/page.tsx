import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OutreachComposer } from "@/components/outreach-composer";
import { ManualReviewNotice } from "@/components/manual-review-notice";
import { LeadAnalysisButton } from "@/components/lead-analysis-button";
import { LeadWebsiteEditor } from "@/components/lead-website-editor";
import { LeadSessionBar } from "@/components/lead-session-bar";
import { ContactPaths } from "@/components/contact-paths";
import { ReminderReturnTracker } from "@/components/reminder-return-tracker";
import { LeadReviewTracker } from "@/components/lead-review-tracker";
import { requireViewer } from "@/lib/security/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession } from "@/lib/retention/session";
import { leadFromMarketHref, marketResultsHref, sessionCompleteHref as buildSessionCompleteHref, sessionLeadHref } from "@/lib/navigation/prospect-flow";
import { isManualReviewFinding, type LeadOutcome } from "@/lib/leads/priority";
import { auditIsCurrentForWebsite, websiteStatusLabel } from "@/lib/leads/website";

export default async function LeadFile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queue?: string; source?: string; session?: string; campaign?: string; from?: string }>;
}) {
  const user = await requireViewer();
  const { id } = await params;
  const { queue, source, session: requestedSessionId, campaign: requestedCampaignId } = await searchParams;
  const queueIds = String(queue || "").split(",").filter(Boolean).slice(0, 10);
  const nextLeadId = queueIds[0] || null;
  const remainingQueue = queueIds.slice(1);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id,campaign_id,name,category,address,city,state,website,website_source,website_verification_status,website_updated_by_user_at,phone,google_maps_url,reviews,rating,status,opportunity_score,notes,business_observation,next_follow_up_at,last_contacted_at,first_contacted_at,lead_outcome,follow_up_step,follow_up_stopped_at,last_audited_at,manual_review_required,manual_review_reason",
    )
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  if (!lead) notFound();

  const { data: auditRow } = await supabase
    .from("audits")
    .select(
      "id,status,score,website_url,final_url,http_status,page_title,meta_description,pages_crawled,performance_score,accessibility_score,seo_score,best_practices_score,created_at",
    )
    .eq("lead_id", id)
    .eq("workspace_id", user.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const audit = auditRow && auditIsCurrentForWebsite(auditRow.created_at, lead.website_updated_by_user_at)
    ? auditRow
    : null;

  const { data: findings } = audit
    ? await supabase
        .from("audit_findings")
        .select("id,code,label,severity,evidence,source_url")
        .eq("audit_id", audit.id)
    : { data: [] };

  const { data: auditJob } = await supabase
    .from("audit_jobs")
    .select("id,status,result_status,error_message,attempts,created_at,updated_at")
    .eq("lead_id", id)
    .eq("workspace_id", user.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentAuditJob = auditJob && (!lead.website_updated_by_user_at || Date.parse(auditJob.created_at) >= Date.parse(lead.website_updated_by_user_at))
    ? auditJob
    : null;

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

  const [sessionState, contactResult] = await Promise.all([
    requestedSessionId ? getActiveSession(user.id, user.workspaceId || "") : Promise.resolve(null),
    admin.from("lead_contact_paths")
      .select("id,kind,value,url,source_url,verified_public")
      .eq("lead_id", id)
      .eq("workspace_id", user.workspaceId)
      .order("kind", { ascending: true }),
  ]);
  const activeSession = sessionState?.id === requestedSessionId ? sessionState : null;
  const sessionItems = activeSession?.items || [];
  const currentSessionItem = sessionItems.find((item) => item.lead_id === id) || null;
  const nextSessionItem = currentSessionItem
    ? sessionItems.find((item) => item.position > currentSessionItem.position && ["ready", "working"].includes(item.status))
      || sessionItems.find((item) => item.lead_id !== id && ["ready", "working"].includes(item.status))
    : null;
  const sessionWorkedCount = sessionItems.filter((item) => !["ready", "working"].includes(item.status)).length;
  const contactPaths = contactResult.data || [];
  const publicEmail = contactPaths.find((path) => path.kind === "email" && path.value)?.value || "";
  const facebookUrl = contactPaths.find((path) => path.kind === "facebook" && path.url)?.url || null;
  const formPath = contactPaths.find((path) => path.kind === "form" && path.url) || null;
  const strongestFinding = (findings || []).find((finding) => finding.severity === "high" && !isManualReviewFinding(finding.code))
    || (findings || []).find((finding) => finding.severity === "medium" && !isManualReviewFinding(finding.code))
    || null;
  const bestReachPath = publicEmail ? `Email found: ${publicEmail}`
    : facebookUrl ? "Facebook profile found"
      : formPath ? (formPath.value || "Contact form found")
        : lead.phone ? `Phone listed: ${lead.phone}`
          : "No verified public contact path found yet";
  const sessionSelectionReason = lead.status === "replied" || lead.status === "interested"
    ? "A live conversation needs your attention."
    : lead.next_follow_up_at && Date.parse(lead.next_follow_up_at) <= Date.now()
      ? "A follow-up is due, so this is useful work to clear now."
      : !lead.first_contacted_at
        ? "This is an untouched prospect with a real business signal and a clear next decision."
        : "This prospect has a clear next action in your pipeline.";
  const activitySummary = Number(lead.reviews || 0) > 0
    ? `${lead.rating ?? "—"} rating · ${lead.reviews} review${Number(lead.reviews) === 1 ? "" : "s"}`
    : "No saved Google review activity";
  const leadLocation = lead.address || [lead.city, lead.state].filter(Boolean).join(", ");
  const isSessionProspect = Boolean(activeSession && currentSessionItem);
  const originCampaignId = activeSession?.campaign_id || (source === "search" ? (requestedCampaignId || lead.campaign_id || null) : null);
  const marketReturnHref = originCampaignId ? marketResultsHref(originCampaignId) : null;
  const sessionDoneHref = buildSessionCompleteHref(originCampaignId);

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
      <ReminderReturnTracker />
      {!isSessionProspect ? <LeadReviewTracker leadId={lead.id} /> : null}
      {isSessionProspect && activeSession && currentSessionItem ? (
        <LeadSessionBar
          sessionId={activeSession.id}
          leadId={lead.id}
          position={currentSessionItem.position}
          targetSize={activeSession.target_size}
          workedCount={sessionWorkedCount}
          nextLeadHref={nextSessionItem ? sessionLeadHref({ leadId: nextSessionItem.lead_id, sessionId: activeSession.id, campaignId: originCampaignId }) : null}
          campaignId={originCampaignId}
        />
      ) : null}

      <header className={`lead-workspace-head ${isSessionProspect ? "session-lead-head" : ""}`}>
        <div>
          <Link className="back-link" href={isSessionProspect ? (marketReturnHref || "/dashboard") : (marketReturnHref || "/dashboard/leads")}>{isSessionProspect ? (marketReturnHref ? "← Exit to market" : "← Exit to Today") : (marketReturnHref ? "← Back to market" : "← Back to pipeline")}</Link>
          <div className="eyebrow">{isSessionProspect ? "Current prospect" : "Prospect"}</div>
          <h1>{lead.name}</h1>
          <p>{[lead.category || "Local business", leadLocation].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="lead-status-pill">{String(lead.status || "new").replaceAll("_", " ")}</span>
      </header>

      <section className="lead-decision-card" aria-label="Prospect decision summary">
        <div className="lead-decision-copy">
          <span className="eyebrow">Why this is worth a look</span>
          <h2>{strongestFinding?.label || (lead.website ? "A real business with a reviewable web opportunity" : "No website was linked on the Google listing")}</h2>
          <p>{sessionSelectionReason}</p>
        </div>
        <div className="lead-signal-row" aria-label="Key prospect signals">
          <span><small>Activity</small><b>{activitySummary}</b></span>
          <span><small>Opportunity</small><b>{strongestFinding?.evidence || (lead.website ? "Review the site and decide whether the opportunity fits your offer." : "A missing website may create a straightforward conversation opening.")}</b></span>
          <span><small>Reach</small><b>{bestReachPath}</b></span>
        </div>
        <ContactPaths paths={contactPaths as Parameters<typeof ContactPaths>[0]["paths"]} />
      </section>

      <OutreachComposer
        key={lead.id}
        leadId={lead.id}
        leadName={lead.name}
        leadPhone={lead.phone || null}
        sessionId={activeSession?.id || null}
        initialEmailRecipient={publicEmail}
        facebookContactUrl={facebookUrl}
        nextLeadHref={nextSessionItem && activeSession
          ? sessionLeadHref({ leadId: nextSessionItem.lead_id, sessionId: activeSession.id, campaignId: originCampaignId })
          : nextLead && originCampaignId
            ? leadFromMarketHref({ leadId: nextLead.id, campaignId: originCampaignId, queue: remainingQueue })
            : nextLead
              ? `/dashboard/leads/${nextLead.id}?source=${source || "search"}${remainingQueue.length ? `&queue=${remainingQueue.join(",")}` : ""}#outreach`
              : null}
        nextLeadName={nextLead?.name || null}
        returnHref={marketReturnHref}
        returnLabel={marketReturnHref ? "Back to market" : null}
        sessionCompleteHref={sessionDoneHref}
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

      <details className="prospect-more-disclosure">
        <summary>
          <span><small>More about this business</small><b>Website evidence, listing details, corrections, and advanced tools</b></span>
          <span className="prospect-more-score">Evidence {lead.opportunity_score ?? "—"}</span>
        </summary>
        <div className="prospect-more-body">
          <div className="lead-summary-grid compact-lead-summary">
            <div className="lead-fact"><small>Status</small><b>{String(lead.status).replaceAll("_", " ")}</b></div>
            <div className="lead-fact"><small>Google activity</small><b>{activitySummary}</b></div>
            <div className="lead-fact"><small>Phone</small>{lead.phone ? <a className="lead-phone-link" href={`tel:${lead.phone}`}>{lead.phone}</a> : <b>Not listed</b>}</div>
            <div className="lead-fact"><small>Website</small><b>{websiteStatusLabel({ website: lead.website, source: lead.website_source, verificationStatus: lead.website_verification_status })}</b></div>
          </div>

          <div className="lead-link-row compact-lead-links">
            {lead.website ? <LeadAnalysisButton key={currentAuditJob?.id || audit?.id || "no-audit"} leadId={lead.id} hasAudit={Boolean(audit)} initialRunning={currentAuditJob?.status === "queued" || currentAuditJob?.status === "running"} /> : null}
            {lead.website ? <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Open website</a> : null}
            {lead.google_maps_url ? <a className="btn" href={lead.google_maps_url} target="_blank" rel="noreferrer">Open Google listing</a> : null}
          </div>

          <LeadWebsiteEditor
            leadId={lead.id}
            initialWebsite={lead.website || null}
            source={lead.website_source || null}
            verificationStatus={lead.website_verification_status || null}
          />

          {lead.manual_review_required ? (
            <ManualReviewNotice
              leadId={lead.id}
              reason={lead.manual_review_reason || manualReviewFinding?.evidence || "Webvidence could not fully inspect this website."}
            />
          ) : null}

          <section className="evidence-file-section evidence-inline-section">
            <div className="evidence-inline-head">
              <div><small>Business and website evidence</small><b>{audit ? `${findings?.length || 0} findings from ${audit.pages_crawled} checked page${audit.pages_crawled === 1 ? "" : "s"}` : currentAuditJob?.status === "queued" || currentAuditJob?.status === "running" ? "Website analysis is running" : "No website analysis yet"}</b></div>
              <span className="tag">{audit?.status || currentAuditJob?.status || "not analyzed"}</span>
            </div>
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
              <div className={`notice ${currentAuditJob?.status === "failed" ? "notice-error" : ""}`}>
                {currentAuditJob?.status === "queued" || currentAuditJob?.status === "running"
                  ? "Analysis is running in the background. You can leave this page and return later."
                  : currentAuditJob?.status === "failed"
                    ? `The analysis worker could not finish after ${currentAuditJob?.attempts || 1} attempt${currentAuditJob?.attempts === 1 ? "" : "s"}: ${currentAuditJob?.error_message || "Unknown processing error."}`
                    : "Run an analysis to create verified findings. Conversation-first outreach remains available without an audit."}
              </div>
            )}
          </section>
        </div>
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
