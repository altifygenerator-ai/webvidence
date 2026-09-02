"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LEAD_OUTCOME_LABELS,
  type LeadOutcome,
  type PriorityAction,
} from "@/lib/leads/priority";

type Lead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  reviews: number | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  follow_up_step?: number | null;
  follow_up_stopped_at?: string | null;
  lead_outcome?: LeadOutcome | null;
  priority_action?: PriorityAction | null;
  manual_review_required?: boolean;
  manual_review_reason?: string | null;
};

export function LeadsTable({ leads, archived }: { leads: Lead[]; archived: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const allSelected = leads.length > 0 && selected.length === leads.length;

  async function bulk(action: "archive" | "restore" | "delete" | "do_not_contact") {
    if (!selected.length) return;
    if (action === "delete" && !window.confirm(`Permanently delete ${selected.length} archived lead${selected.length === 1 ? "" : "s"} and all related audits and messages? This cannot be undone.`)) return;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selected, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the selected leads.");
      setMessage(`${data.updated} lead${data.updated === 1 ? "" : "s"} updated.`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the selected leads.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <details className="pipeline-bulk-disclosure">
        <summary>Bulk actions <small>{selected.length ? `${selected.length} selected` : "optional"}</small></summary>
        <div className="bulk-lead-bar">
          <label className="bulk-select-all">
            <input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? leads.map((lead) => lead.id) : [])} />
            Select all shown
          </label>
          {!archived ? (
            <>
              <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk("archive")}>Archive selected</button>
              <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk("do_not_contact")}>Mark do not contact</button>
            </>
          ) : (
            <>
              <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk("restore")}>Restore selected</button>
              <button className="btn danger-button" type="button" disabled={!selected.length || working} onClick={() => void bulk("delete")}>Delete permanently</button>
            </>
          )}
        </div>
      </details>

      {message ? <div className={`notice ${/could not|only archived/i.test(message) ? "notice-error" : ""}`}>{message}</div> : null}

      <div className="table compact-pipeline-table">
        <div className="row head pipeline-row">
          <span aria-hidden="true" />
          <span>Business</span>
          <span>Status</span>
          <span>Last contact</span>
          <span>Next action</span>
          <span>Due</span>
          <span />
        </div>
        {leads.map((lead) => {
          const nextAction = getNextAction(lead, archived);
          return (
            <div className="row pipeline-row" key={lead.id}>
              <span className="lead-select-cell">
                <input type="checkbox" aria-label={`Select ${lead.name}`} checked={selected.includes(lead.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))} />
              </span>
              <span className="lead-business-cell" data-label="Business">
                <b>{lead.name}</b>
                <small>{[lead.city, lead.state].filter(Boolean).join(", ") || "Location unavailable"}</small>
              </span>
              <span className="lead-status-cell" data-label="Status">{formatStatus(lead)}</span>
              <span data-label="Last contact">{formatDate(lead.last_contacted_at) || "Not contacted"}</span>
              <span className="pipeline-next-action" data-label="Next action">
                <b>{nextAction.label}</b>
                {nextAction.detail ? <small>{nextAction.detail}</small> : null}
              </span>
              <span data-label="Due">{formatDate(lead.next_follow_up_at) || "—"}</span>
              <span className="pipeline-open-cell"><Link className="btn lead-open-button" href={`/dashboard/leads/${lead.id}`}>Open</Link></span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatStatus(lead: Lead) {
  if (lead.lead_outcome) return LEAD_OUTCOME_LABELS[lead.lead_outcome];
  return String(lead.status || "new").replaceAll("_", " ");
}

function getNextAction(lead: Lead, archived: boolean) {
  if (archived) return { label: "Archived", detail: "" };
  if (lead.manual_review_required) return { label: "Review website", detail: lead.manual_review_reason || "Automated review could not finish." };
  if (lead.priority_action) return { label: lead.priority_action.label, detail: lead.priority_action.detail };
  if (lead.lead_outcome) return { label: "Outcome recorded", detail: LEAD_OUTCOME_LABELS[lead.lead_outcome] };
  return { label: "Review business", detail: "Decide whether it is worth contacting." };
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}
