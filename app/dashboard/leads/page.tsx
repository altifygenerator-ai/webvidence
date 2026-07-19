import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LeadsTable } from "@/components/leads-table";
import { requireViewer } from "@/lib/security/auth";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import { getPriorityAction, type LeadOutcome } from "@/lib/leads/priority";
import { cookies } from "next/headers";
import {
  getLocalDayBounds,
  normalizeTimezoneOffset,
  TIMEZONE_OFFSET_COOKIE,
} from "@/lib/leads/timezone";

type PipelineLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  reviews: number | null;
  rating: number | null;
  last_audited_at: string | null;
  created_at: string;
  updated_at: string;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  follow_up_step: number | null;
  follow_up_stopped_at: string | null;
  lead_outcome: LeadOutcome | null;
  manual_review_required: boolean;
  manual_review_reason: string | null;
};

type SortKey =
  | "priority"
  | "score_desc"
  | "score_asc"
  | "recent"
  | "oldest"
  | "recent_contact"
  | "follow_up"
  | "no_website"
  | "website"
  | "never_contacted";

const filters = [
  ["all", "All active"],
  ["due", "Due today"],
  ["overdue", "Overdue"],
  ["never_contacted", "Never contacted"],
  ["waiting", "Waiting on reply"],
  ["complete", "Sequence complete"],
  ["interested", "Replies / interest"],
  ["proposal", "Proposal sent"],
  ["manual_review", "Manual review"],
] as const;

const sortOptions: Array<[SortKey, string]> = [
  ["priority", "Recommended priority"],
  ["score_desc", "Highest score"],
  ["score_asc", "Lowest score"],
  ["recent", "Most recently searched"],
  ["oldest", "Oldest found"],
  ["recent_contact", "Most recently contacted"],
  ["follow_up", "Follow-up due first"],
  ["no_website", "No website first"],
  ["website", "Website found first"],
  ["never_contacted", "Never contacted first"],
];

export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string; sort?: string }>;
}) {
  const user = await requireViewer();
  const {
    view,
    filter = "all",
    sort: requestedSort = "priority",
  } = await searchParams;
  const archived = view === "archived";
  const sort = isSortKey(requestedSort) ? requestedSort : "priority";
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      "id,name,city,state,website,status,opportunity_score,reviews,rating,last_audited_at,created_at,updated_at,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,follow_up_stopped_at,lead_outcome,manual_review_required,manual_review_reason",
    )
    .limit(500);
  query = archived
    ? query.eq("status", "archived")
    : query.neq("status", "archived");
  query = applyDatabaseSort(query, sort);

  const [leadResult, countResult] = await Promise.all([
    query,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .neq("status", "archived"),
  ]);

  const { data, error } = leadResult;
  const activeLeadCount = countResult.count || 0;
  const now = new Date();
  const cookieStore = await cookies();
  const timezoneOffset = normalizeTimezoneOffset(
    cookieStore.get(TIMEZONE_OFFSET_COOKIE)?.value,
  );
  const { start: startToday, end: endToday } = getLocalDayBounds(
    now,
    timezoneOffset,
  );
  const rawLeads = (data || []) as PipelineLead[];
  const filteredLeads = archived
    ? rawLeads
    : rawLeads.filter((lead) =>
        matchesFilter(lead, filter, startToday, endToday),
      );
  const prioritizedLeads = filteredLeads.map((lead) => ({
    ...lead,
    priority_action: getPriorityAction(lead, now, timezoneOffset),
  }));
  const leads = applyClientSort(prioritizedLeads, sort).slice(0, 100);
  const savedLimit = PLANS[user.plan].saved;

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline pipeline-topline">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h2>{archived ? "Archived prospects" : "Saved prospects"}</h2>
        </div>
        <div className="pipeline-head-actions">
          <Link
            className={`btn ${!archived ? "primary" : ""}`}
            href={pipelineHref({ sort })}
          >
            Active
          </Link>
          <Link
            className={`btn ${archived ? "primary" : ""}`}
            href={pipelineHref({ view: "archived", sort })}
          >
            Archived
          </Link>
          {!archived &&
            (user.isAdmin || PLANS[user.plan].exports ? (
              <a className="btn" href="/api/export/leads">
                Export CSV
              </a>
            ) : (
              <Link className="btn" href="/pricing">
                Unlock CSV export
              </Link>
            ))}
          <div
            className="pipeline-capacity"
            aria-label={`${activeLeadCount} active saved leads`}
          >
            <b>
              {activeLeadCount.toLocaleString()}
              {user.isAdmin ? "" : ` of ${savedLimit.toLocaleString()}`}
            </b>
            <span>{user.isAdmin ? "active leads" : "active leads saved"}</span>
          </div>
        </div>
      </div>

      <section className="pipeline-controls" aria-label="Pipeline controls">
        {!archived ? (
          <nav className="pipeline-filters" aria-label="Pipeline filters">
            {filters.map(([value, label]) => (
              <Link
                className={filter === value ? "active" : ""}
                key={value}
                href={pipelineHref({ filter: value, sort })}
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : (
          <div />
        )}

        <form className="pipeline-sort-form" method="get">
          {archived ? (
            <input type="hidden" name="view" value="archived" />
          ) : null}
          {!archived && filter !== "all" ? (
            <input type="hidden" name="filter" value={filter} />
          ) : null}
          <label htmlFor="pipeline-sort">Sort by</label>
          <select
            className="input"
            id="pipeline-sort"
            name="sort"
            defaultValue={sort}
          >
            {sortOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Apply
          </button>
          <span>{leads.length} shown</span>
        </form>
      </section>

      {error && <div className="notice notice-error">{error.message}</div>}
      {!error && leads.length === 0 && (
        <div className="notice">
          {archived
            ? "No archived prospects."
            : filter === "all"
              ? "No prospects are saved yet. Run a live search to build your first list."
              : "No leads match this pipeline filter."}
        </div>
      )}

      {leads.length > 0 && <LeadsTable leads={leads} archived={archived} />}
    </AppShell>
  );
}

function applyDatabaseSort<
  T extends {
    order: (
      column: string,
      options: { ascending: boolean; nullsFirst?: boolean },
    ) => T;
  },
>(query: T, sort: SortKey) {
  if (sort === "score_asc")
    return query
      .order("opportunity_score", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  if (sort === "recent")
    return query
      .order("updated_at", { ascending: false })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "oldest")
    return query
      .order("created_at", { ascending: true })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "recent_contact")
    return query
      .order("last_contacted_at", { ascending: false, nullsFirst: false })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "follow_up")
    return query
      .order("next_follow_up_at", { ascending: true, nullsFirst: false })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "no_website")
    return query
      .order("website", { ascending: true, nullsFirst: true })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "website")
    return query
      .order("website", { ascending: true, nullsFirst: false })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (sort === "never_contacted")
    return query
      .order("first_contacted_at", { ascending: true, nullsFirst: true })
      .order("opportunity_score", { ascending: false, nullsFirst: false });
  return query
    .order("opportunity_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
}

function applyClientSort<
  T extends PipelineLead & {
    priority_action: ReturnType<typeof getPriorityAction>;
  },
>(leads: T[], sort: SortKey) {
  const items = [...leads];
  if (sort === "priority") {
    return items.sort(
      (a, b) =>
        Number(b.priority_action?.rank || 0) -
          Number(a.priority_action?.rank || 0) ||
        Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0),
    );
  }
  if (sort === "score_desc")
    return items.sort(
      (a, b) =>
        nullableScore(b.opportunity_score, -1) -
        nullableScore(a.opportunity_score, -1),
    );
  if (sort === "score_asc")
    return items.sort(
      (a, b) =>
        nullableScore(a.opportunity_score, Number.POSITIVE_INFINITY) -
        nullableScore(b.opportunity_score, Number.POSITIVE_INFINITY),
    );
  if (sort === "recent")
    return items.sort(
      (a, b) => timestamp(b.updated_at) - timestamp(a.updated_at),
    );
  if (sort === "oldest")
    return items.sort(
      (a, b) => timestamp(a.created_at) - timestamp(b.created_at),
    );
  if (sort === "recent_contact")
    return items.sort(
      (a, b) => timestamp(b.last_contacted_at) - timestamp(a.last_contacted_at),
    );
  if (sort === "follow_up")
    return items.sort(
      (a, b) =>
        futureTimestamp(a.next_follow_up_at) -
        futureTimestamp(b.next_follow_up_at),
    );
  if (sort === "no_website")
    return items.sort(
      (a, b) =>
        Number(Boolean(a.website)) - Number(Boolean(b.website)) ||
        nullableScore(b.opportunity_score, -1) -
          nullableScore(a.opportunity_score, -1),
    );
  if (sort === "website")
    return items.sort(
      (a, b) =>
        Number(Boolean(b.website)) - Number(Boolean(a.website)) ||
        nullableScore(b.opportunity_score, -1) -
          nullableScore(a.opportunity_score, -1),
    );
  if (sort === "never_contacted")
    return items.sort(
      (a, b) =>
        Number(Boolean(a.first_contacted_at)) -
          Number(Boolean(b.first_contacted_at)) ||
        nullableScore(b.opportunity_score, -1) -
          nullableScore(a.opportunity_score, -1),
    );
  return items;
}

function pipelineHref({
  view,
  filter,
  sort,
}: {
  view?: "archived";
  filter?: string;
  sort?: SortKey;
}) {
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (filter && filter !== "all" && !view) params.set("filter", filter);
  if (sort && sort !== "priority") params.set("sort", sort);
  const query = params.toString();
  return `/dashboard/leads${query ? `?${query}` : ""}`;
}

function isSortKey(value: string): value is SortKey {
  return sortOptions.some(([key]) => key === value);
}

function nullableScore(value: number | null, fallback: number) {
  return value === null ? fallback : value;
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function futureTimestamp(value: string | null) {
  return value ? timestamp(value) : Number.POSITIVE_INFINITY;
}

function matchesFilter(
  lead: PipelineLead,
  filter: string,
  startToday: Date,
  endToday: Date,
) {
  const due = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  const activeSequence = !lead.lead_outcome && !lead.follow_up_stopped_at;
  if (filter === "due")
    return Boolean(
      activeSequence && due && due >= startToday && due <= endToday,
    );
  if (filter === "overdue")
    return Boolean(activeSequence && due && due < startToday);
  if (filter === "never_contacted")
    return (
      !lead.first_contacted_at &&
      !["do_not_contact", "not_interested", "won", "lost"].includes(lead.status)
    );
  if (filter === "waiting")
    return Boolean(
      lead.first_contacted_at &&
      activeSequence &&
      ["contacted", "follow_up"].includes(lead.status),
    );
  if (filter === "complete")
    return Boolean(
      lead.follow_up_stopped_at ||
      ["no_response", "closed_won", "closed_lost"].includes(
        lead.lead_outcome || "",
      ),
    );
  if (filter === "interested")
    return (
      ["replied", "interested", "meeting_booked"].includes(
        lead.lead_outcome || "",
      ) || ["replied", "interested"].includes(lead.status)
    );
  if (filter === "proposal")
    return (
      lead.lead_outcome === "proposal_sent" || lead.status === "quote_sent"
    );
  if (filter === "manual_review") return lead.manual_review_required;
  return true;
}
