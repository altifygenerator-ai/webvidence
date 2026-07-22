import Link from "next/link";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import {
  DashboardAttentionPanel,
  type DashboardAttentionItem,
} from "@/components/dashboard-attention-panel";
import { requireViewer } from "@/lib/security/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import { getPriorityAction, type LeadOutcome } from "@/lib/leads/priority";
import {
  getLocalDayBounds,
  normalizeTimezoneOffset,
  TIMEZONE_OFFSET_COOKIE,
} from "@/lib/leads/timezone";
import {
  getOnboardingStage,
  type OnboardingStage,
} from "@/lib/onboarding";

type DashboardLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  created_at: string;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  follow_up_step: number | null;
  follow_up_stopped_at: string | null;
  lead_outcome: LeadOutcome | null;
  manual_review_required: boolean;
};


type DashboardCampaign = {
  id: string;
  category: string;
  location: string;
  radius_miles: number;
  status: string;
};

type DashboardMessage = {
  id: string;
  lead_id: string;
  status: string;
  direction: string;
  created_at: string;
  sent_at: string | null;
};

export default async function Dashboard() {
  const user = await requireViewer();
  const db = createAdminClient();
  const now = new Date();
  const cookieStore = await cookies();
  const timezoneOffset = normalizeTimezoneOffset(
    cookieStore.get(TIMEZONE_OFFSET_COOKIE)?.value,
  );
  const period = now.toISOString().slice(0, 7);

  const [
    leadResult,
    messageResult,
    usageResult,
    apiResult,
    searchHistoryResult,
    auditHistoryResult,
    campaignResult,
  ] = await Promise.all([
    db
      .from("leads")
      .select(
        "id,name,city,state,website,status,opportunity_score,created_at,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,follow_up_stopped_at,lead_outcome,manual_review_required",
      )
      .eq("workspace_id", user.workspaceId)
      .limit(500),
    db
      .from("messages")
      .select("id,lead_id,status,direction,created_at,sent_at")
      .eq("workspace_id", user.workspaceId)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("usage_counters")
      .select("metric,used")
      .eq("user_id", user.id)
      .eq("period", period),
    db
      .from("api_usage_log")
      .select("provider,units,estimated_cost")
      .eq("workspace_id", user.workspaceId)
      .gte("created_at", `${period}-01T00:00:00.000Z`),
    db
      .from("search_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", user.workspaceId),
    db
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", user.workspaceId),
    db
      .from("campaigns")
      .select("id,category,location,radius_miles,status")
      .eq("workspace_id", user.workspaceId)
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  const leads = (leadResult.data || []) as DashboardLead[];
  const messages = (messageResult.data || []) as DashboardMessage[];
  const campaigns = (campaignResult.data || []) as DashboardCampaign[];
  const searchUsed =
    usageResult.data?.find((item) => item.metric === "search")?.used || 0;
  const auditUsed =
    usageResult.data?.find((item) => item.metric === "audit")?.used || 0;
  const messageUsed =
    usageResult.data?.find((item) => item.metric === "message")?.used || 0;
  const apiUnits = (apiResult.data || []).reduce(
    (total, item) => total + Number(item.units || 0),
    0,
  );
  const estimatedCost = (apiResult.data || []).reduce(
    (total, item) => total + Number(item.estimated_cost || 0),
    0,
  );

  const sentMessages = messages.filter(
    (message) => message.status === "sent" && message.direction !== "inbound",
  );
  const { start: startToday, end: endToday } = getLocalDayBounds(now, timezoneOffset);
  const sentToday = sentMessages.filter((message) => {
    const value = message.sent_at || message.created_at;
    const timestamp = new Date(value).getTime();
    return timestamp >= startToday.getTime() && timestamp < endToday.getTime();
  }).length;
  const repliesNeedingAttention = leads.filter((lead) => lead.status === "replied").length;
  const searchCount = searchHistoryResult.count || 0;
  const onboardingStage = getOnboardingStage({
    searches: searchCount,
    audits: auditHistoryResult.count || 0,
    messages: messages.length,
    sentMessages: sentMessages.length,
  });

  const priorityEntries = leads
    .map((lead) => ({
      lead,
      action: getPriorityAction(lead, now, timezoneOffset),
    }))
    .filter(
      (
        item,
      ): item is {
        lead: DashboardLead;
        action: NonNullable<ReturnType<typeof getPriorityAction>>;
      } =>
        Boolean(
          item.action &&
            item.action.rank > 0 &&
            item.action.kind !== "waiting" &&
            item.action.kind !== "complete",
        ),
    )
    .sort((a, b) => b.action.rank - a.action.rank);

  const dueEntries = priorityEntries.filter((item) =>
    ["overdue", "due_today"].includes(item.action.kind),
  );
  const firstContactEntries = priorityEntries.filter(
    (item) =>
      ["never_contacted", "aging"].includes(item.action.kind) &&
      !item.lead.manual_review_required,
  );
  const manualReviewCount = leads.filter(
    (lead) => lead.manual_review_required,
  ).length;

  const attentionItems: DashboardAttentionItem[] = [
    ...dueEntries.map(({ lead, action }) =>
      priorityItem(lead, action, "Open follow-up"),
    ),
    ...(manualReviewCount > 0
      ? [
          {
            id: "manual-review-summary",
            kind: "manual_review" as const,
            label: "Manual review",
            title: `${manualReviewCount} website${manualReviewCount === 1 ? "" : "s"} need a quick look`,
            detail:
              "The website was found, but the automated check was blocked or could not reach it.",
            primaryHref: "/dashboard/leads?filter=manual_review",
            primaryLabel: "Review websites",
          },
        ]
      : []),
    ...firstContactEntries.map(({ lead, action }) =>
      priorityItem(lead, action, "Draft message"),
    ),
  ].slice(0, 3);

  const actionCount =
    dueEntries.length + firstContactEntries.length + (manualReviewCount > 0 ? 1 : 0);
  const summaryDetail = buildAttentionSummary({
    dueCount: dueEntries.length,
    manualReviewCount,
    firstContactCount: firstContactEntries.length,
  });
  const onboardingAction = buildOnboardingAction(
    onboardingStage,
    messages.find((message) => message.status !== "sent")?.lead_id || null,
  );

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div>
          <div className="eyebrow">Workspace overview</div>
          <h2>Opportunity desk</h2>
        </div>
        <span className="tag">{PLANS[user.plan].name} plan</span>
      </div>

      <div className="dashboard-welcome">
        <div>
          <small>Signed in as</small>
          <b>{user.email}</b>
          <span>Your searches, audits, drafts, and pipeline are saved here.</span>
        </div>
        <Link className="btn primary" href="/dashboard/campaigns">
          Run a new search
        </Link>
      </div>

      <DashboardAttentionPanel
        stage={onboardingStage}
        summaryDetail={
          onboardingStage === "active"
            ? summaryDetail
            : onboardingAction?.detail || "One useful step at a time."
        }
        actionCount={onboardingStage === "active" ? actionCount : 0}
        items={onboardingStage === "active" ? attentionItems : []}
        onboardingAction={onboardingAction || undefined}
        initiallyOpen={
          onboardingStage !== "active" || dueEntries.length > 0
        }
      />

      {searchCount > 0 ? (
        <>
          <section className="section dashboard-today-section">
            <div className="panel-heading">
              <div><div className="eyebrow">Today</div><h3>What needs attention</h3></div>
            </div>
            <div className="dashboard-today-counts">
              <Link href="/dashboard/leads?filter=interested"><b>{repliesNeedingAttention}</b><span>Replies needing attention</span></Link>
              <Link href="/dashboard/leads?filter=due"><b>{dueEntries.length}</b><span>Follow-ups due</span></Link>
              <Link href="/dashboard/leads?filter=never_contacted"><b>{firstContactEntries.length}</b><span>Businesses ready to review</span></Link>
            </div>
          </section>

          <section className="section dashboard-progress-section">
            <div className="panel-heading">
              <div><div className="eyebrow">Outreach progress</div><h3>{sentToday} contacted today</h3></div>
              <Link className="btn" href="/dashboard/leads?filter=never_contacted">Review next business</Link>
            </div>
            <progress max={5} value={Math.min(5, sentToday)} />
            <small>{sentToday >= 5 ? "Daily goal reached. Stop when the work is no longer useful." : `${Math.max(0, 5 - sentToday)} left in the default daily batch.`}</small>
          </section>

          <details className="dashboard-campaigns-disclosure">
            <summary><span><span className="eyebrow">Saved markets</span><b>Active campaigns</b></span><small>{campaigns.length} open</small></summary>
            <div className="dashboard-campaign-list">
              {campaigns.length ? campaigns.map((campaign) => (
                <Link key={campaign.id} href="/dashboard/campaigns">
                  <b>{campaign.category}</b>
                  <span>{campaign.location} · {campaign.radius_miles} miles · {campaign.status}</span>
                </Link>
              )) : <p className="muted">No active campaigns.</p>}
            </div>
          </details>

          <details className="dashboard-usage-disclosure">
            <summary>Plan usage <small>{searchUsed} searches · {auditUsed} analyses · {messageUsed} drafts</small></summary>
            <div className="usage-grid">
              <div><span>Local searches</span><b>{searchUsed} / {PLANS[user.plan].searches}</b><progress max={PLANS[user.plan].searches} value={searchUsed} /></div>
              <div><span>Website analyses</span><b>{auditUsed} / {PLANS[user.plan].audits}</b><progress max={PLANS[user.plan].audits} value={auditUsed} /></div>
              <div><span>Outreach drafts</span><b>{messageUsed} / {PLANS[user.plan].messages}</b><progress max={PLANS[user.plan].messages} value={messageUsed} /></div>
              {user.isAdmin ? <div><span>Logged provider units</span><b>{apiUnits}</b><small>{estimatedCost > 0 ? `$${estimatedCost.toFixed(2)} estimated` : "Usage recorded for review"}</small></div> : null}
            </div>
          </details>
        </>
      ) : null}
    </AppShell>
  );
}

function priorityItem(
  lead: DashboardLead,
  action: NonNullable<ReturnType<typeof getPriorityAction>>,
  primaryLabel: string,
): DashboardAttentionItem {
  return {
    id: lead.id,
    kind: action.kind as DashboardAttentionItem["kind"],
    label: action.label,
    title: lead.name,
    meta: `${[lead.city, lead.state].filter(Boolean).join(", ") || "Location unavailable"} · score ${lead.opportunity_score ?? "—"}`,
    detail: action.detail,
    primaryHref: `/dashboard/leads/${lead.id}#outreach`,
    primaryLabel,
    secondaryHref: `/dashboard/leads/${lead.id}`,
    secondaryLabel: "Open file",
  };
}

function buildAttentionSummary(input: {
  dueCount: number;
  manualReviewCount: number;
  firstContactCount: number;
}) {
  const parts: string[] = [];
  if (input.dueCount > 0)
    parts.push(
      `${input.dueCount} follow-up${input.dueCount === 1 ? "" : "s"} due`,
    );
  if (input.manualReviewCount > 0)
    parts.push(
      `${input.manualReviewCount} website${input.manualReviewCount === 1 ? "" : "s"} need review`,
    );
  if (input.firstContactCount > 0)
    parts.push(
      `${input.firstContactCount} lead${input.firstContactCount === 1 ? "" : "s"} ready for a first message`,
    );
  return parts.length
    ? parts.slice(0, 2).join(" • ")
    : "Nothing is overdue or waiting for action.";
}

function buildOnboardingAction(
  stage: OnboardingStage,
  latestDraftLeadId: string | null,
) {
  if (stage === "first_search") {
    return {
      title: "Run your first search",
      detail:
        "Pick one type of business and one city. Webvidence will bring back businesses you can review.",
      href: "/dashboard/campaigns",
      label: "Find businesses",
    };
  }
  if (stage === "review") {
    return {
      title: "Pick a few worth checking",
      detail:
        "You do not need to analyze every business. Start with two or three that look promising.",
      href: "/dashboard/leads?sort=recent",
      label: "Review prospects",
    };
  }
  if (stage === "draft") {
    return {
      title: "Draft one real first message",
      detail:
        "Open a lead, look over what Webvidence found, and create a message you can edit.",
      href: "/dashboard/leads?filter=never_contacted",
      label: "Choose a lead",
    };
  }
  if (stage === "send") {
    return {
      title: "Send it while it is fresh",
      detail:
        "Open the message in text or email, then mark it sent so Webvidence can keep the follow-up accurate.",
      href: latestDraftLeadId
        ? `/dashboard/leads/${latestDraftLeadId}#outreach`
        : "/dashboard/leads",
      label: "Open draft",
    };
  }
  return null;
}
