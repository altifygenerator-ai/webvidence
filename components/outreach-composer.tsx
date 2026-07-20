"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMailtoHref, buildSmsHref } from "@/lib/outreach/links";
import {
  LEAD_OUTCOME_LABELS,
  LEAD_OUTCOMES,
  type LeadOutcome,
} from "@/lib/leads/priority";

type Channel = "email" | "facebook" | "text" | "follow_up";

type Message = {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
};

type Props = {
  leadId: string;
  leadPhone: string | null;
  initialStatus: string;
  initialNotes: string;
  initialFollowUpAt: string;
  initialFirstContactedAt: string;
  initialFollowUpStep: number;
  initialFollowUpStoppedAt: string;
  initialOutcome: LeadOutcome | null;
  initialMessages: Message[];
};

const channels: Array<{ id: Channel; label: string; note: string }> = [
  {
    id: "facebook",
    label: "Facebook opener",
    note: "Short and conversational",
  },
  { id: "email", label: "Cold email", note: "Subject plus a brief body" },
  {
    id: "text",
    label: "Text message",
    note: "Use only when the number is appropriate for business contact",
  },
  {
    id: "follow_up",
    label: "Follow-up",
    note: "Built from the latest saved message",
  },
];

export function OutreachComposer({
  leadId,
  leadPhone,
  initialStatus,
  initialNotes,
  initialFollowUpAt,
  initialFirstContactedAt,
  initialFollowUpStep,
  initialFollowUpStoppedAt,
  initialOutcome,
  initialMessages,
}: Props) {
  const [channel, setChannel] = useState<Channel>("facebook");
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState(initialMessages[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);
  const [firstContactedAt, setFirstContactedAt] = useState(
    initialFirstContactedAt,
  );
  const [followUpStep, setFollowUpStep] = useState(initialFollowUpStep);
  const [followUpStoppedAt, setFollowUpStoppedAt] = useState(
    initialFollowUpStoppedAt,
  );
  const [outcome, setOutcome] = useState<LeadOutcome | "">(
    initialOutcome || "",
  );
  const [textRecipient, setTextRecipient] = useState(leadPhone || "");
  const [emailRecipient, setEmailRecipient] = useState("");

  useEffect(() => {
    function handleManualReviewComplete() {
      setError("");
      setNotice("Manual review marked complete. You can generate outreach now.");
    }

    window.addEventListener(
      "webvidence:manual-review-complete",
      handleManualReviewComplete,
    );
    return () =>
      window.removeEventListener(
        "webvidence:manual-review-complete",
        handleManualReviewComplete,
      );
  }, []);

  const selected = useMemo(
    () =>
      messages.find((item) => item.id === selectedId) || messages[0] || null,
    [messages, selectedId],
  );
  const sequenceLabel = getSequenceLabel({
    firstContactedAt,
    followUpAt,
    followUpStep,
    followUpStoppedAt,
    outcome,
  });
  const emailHref =
    selected?.channel === "email"
      ? buildMailtoHref(emailRecipient, selected.subject || "", selected.body)
      : "";

  async function generate() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, channel }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not generate outreach.");
      const message = data.message as Message;
      setMessages((current) => [message, ...current]);
      setSelectedId(message.id);
      setNotice(
        "Draft generated from the verified business details available. Review it before sending.",
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Could not generate outreach.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateMessage(patch: Partial<Message>) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/messages/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save message.");
      setMessages((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, ...data.message } : item,
        ),
      );
      if (data.lead) {
        setStatus(data.lead.status || status);
        setFirstContactedAt(data.lead.first_contacted_at || firstContactedAt);
        setFollowUpAt(toLocalInput(data.lead.next_follow_up_at));
        setFollowUpStep(Number(data.lead.follow_up_step || 0));
        setFollowUpStoppedAt(data.lead.follow_up_stopped_at || "");
        setOutcome(data.lead.lead_outcome || "");
      }
      if (patch.status === "sent") {
        const scheduling = data.lead?.next_follow_up_at
          ? ` Next follow-up scheduled for ${new Date(data.lead.next_follow_up_at).toLocaleDateString()}.`
          : data.lead?.follow_up_stopped_at
            ? " The follow-up sequence is complete."
            : "";
        setNotice(
          `Marked as sent and saved to the lead history.${scheduling}${data.warning ? ` ${data.warning}` : ""}`,
        );
      } else {
        setNotice("Draft saved.");
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save message.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveLead() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const nextFollowUpAt = followUpAt
        ? new Date(followUpAt).toISOString()
        : null;
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          notes,
          nextFollowUpAt,
          leadOutcome: outcome || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update lead.");
      setStatus(data.lead.status || status);
      setFollowUpAt(toLocalInput(data.lead.next_follow_up_at));
      setFirstContactedAt(data.lead.first_contacted_at || firstContactedAt);
      setFollowUpStep(Number(data.lead.follow_up_step || 0));
      setFollowUpStoppedAt(data.lead.follow_up_stopped_at || "");
      setOutcome(data.lead.lead_outcome || "");
      setNotice("Pipeline status, outcome, follow-up, and notes saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update lead.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyMessage() {
    if (!selected) return;
    const content = [selected.subject, selected.body]
      .filter(Boolean)
      .join("\n\n");
    await navigator.clipboard.writeText(content);
    setNotice("Copied to clipboard.");
  }

  function openTextApp() {
    if (!selected || selected.channel !== "text") return;
    setError("");
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") &&
        navigator.maxTouchPoints > 1);
    const smsHref = buildSmsHref(
      textRecipient,
      selected.body,
      isAppleMobile,
    );
    if (!smsHref) {
      setError(
        "Add a valid business phone number before opening the text app.",
      );
      return;
    }
    window.location.href = smsHref;
  }

  return (
    <div className="outreach-layout" id="outreach">
      <section className="outreach-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Evidence-backed outreach</div>
            <h3>Create the next message</h3>
          </div>
          <span className="tag">manual approval</span>
        </div>
        <div className="channel-grid">
          {channels.map((item) => (
            <button
              className={
                channel === item.id ? "channel-option active" : "channel-option"
              }
              key={item.id}
              type="button"
              onClick={() => setChannel(item.id)}
            >
              <b>{item.label}</b>
              <small>{item.note}</small>
            </button>
          ))}
        </div>
        <button
          className="btn primary generate-button"
          type="button"
          onClick={generate}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="mini-spinner" /> Building grounded draft…
            </>
          ) : (
            "Generate from verified findings"
          )}
        </button>
        <small className="muted outreach-helper">
          Webvidence never sends automatically. You review, edit, and decide
          when the business is contacted.
        </small>
      </section>

      <section className="outreach-panel draft-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Draft desk</div>
            <h3>
              {selected
                ? `${selected.channel.replaceAll("_", " ")} draft`
                : "No draft yet"}
            </h3>
          </div>
          {selected ? <span className="tag">{selected.status}</span> : null}
        </div>
        {selected ? (
          <>
            {selected.channel === "email" ? (
              <label className="delivery-recipient">
                <span>Email recipient</span>
                <input
                  className="input outreach-input"
                  inputMode="email"
                  type="email"
                  value={emailRecipient}
                  onChange={(event) => setEmailRecipient(event.target.value)}
                  placeholder="Business email address"
                  autoComplete="email"
                />
                <small>
                  Webvidence does not guess an email address. Add the correct
                  one, then open your email app with the subject and message
                  filled in.
                </small>
              </label>
            ) : null}
            {selected.channel === "text" ? (
              <label className="delivery-recipient">
                <span>Text recipient</span>
                <input
                  className="input outreach-input"
                  inputMode="tel"
                  type="tel"
                  value={textRecipient}
                  onChange={(event) => setTextRecipient(event.target.value)}
                  placeholder="Business phone number"
                  autoComplete="tel"
                />
                <small>
                  Confirm this is an appropriate business contact number before
                  sending.
                </small>
              </label>
            ) : null}
            {selected.subject !== null ? (
              <label>
                <span>Email subject</span>
                <input
                  className="input outreach-input"
                  value={selected.subject || ""}
                  onChange={(event) =>
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === selected.id
                          ? { ...item, subject: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ) : null}
            <label>
              <span>Message</span>
              <textarea
                className="input outreach-textarea"
                value={selected.body}
                onChange={(event) =>
                  setMessages((current) =>
                    current.map((item) =>
                      item.id === selected.id
                        ? { ...item, body: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <div className="draft-actions">
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void updateMessage({
                    subject: selected.subject,
                    body: selected.body,
                  })
                }
                disabled={saving}
              >
                Save edits
              </button>
              <button className="btn" type="button" onClick={copyMessage}>
                Copy message
              </button>
              {selected.channel === "email" ? (
                <a className="btn delivery-button" href={emailHref}>
                  Open email app
                </a>
              ) : null}
              {selected.channel === "text" ? (
                <button
                  className="btn delivery-button"
                  type="button"
                  onClick={openTextApp}
                >
                  Open text app
                </button>
              ) : null}
              <button
                className="btn primary"
                type="button"
                onClick={() =>
                  void updateMessage({
                    subject: selected.subject,
                    body: selected.body,
                    status: "sent",
                  })
                }
                disabled={saving || selected.status === "sent"}
              >
                {selected.status === "sent" ? "Already sent" : "Mark sent"}
              </button>
            </div>
            {selected.channel === "email" || selected.channel === "text" ? (
              <small className="muted delivery-helper">
                Your device opens the message for review. Webvidence does not
                send it or mark it sent automatically.
              </small>
            ) : null}
            {messages.length > 1 ? (
              <label>
                <span>Saved drafts and history</span>
                <select
                  className="input outreach-input"
                  value={selected.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {messages.map((message) => (
                    <option value={message.id} key={message.id}>
                      {new Date(message.created_at).toLocaleDateString()} ·{" "}
                      {message.channel} · {message.status}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          <div className="empty-draft">
            Choose a channel and generate a message. The draft will be saved to
            this lead automatically.
          </div>
        )}
      </section>

      <section className="outreach-panel pipeline-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Next action</div>
            <h3>Work the lead</h3>
          </div>
        </div>
        <div className="follow-up-state">
          <b>{sequenceLabel.title}</b>
          <span>{sequenceLabel.detail}</span>
        </div>
        <label>
          <span>Pipeline status</span>
          <select
            className="input outreach-input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {[
              "new",
              "reviewing",
              "ready_to_contact",
              "contacted",
              "replied",
              "interested",
              "follow_up",
              "quote_sent",
              "won",
              "lost",
              "not_interested",
              "do_not_contact",
              "archived",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>What happened?</span>
          <select
            className="input outreach-input"
            value={outcome}
            onChange={(event) =>
              setOutcome(event.target.value as LeadOutcome | "")
            }
          >
            <option value="">No outcome recorded</option>
            {LEAD_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {LEAD_OUTCOME_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Follow-up date</span>
          <input
            className="input outreach-input"
            type="datetime-local"
            value={followUpAt}
            onChange={(event) => setFollowUpAt(event.target.value)}
          />
        </label>
        <label>
          <span>Private notes</span>
          <textarea
            className="input outreach-notes"
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What they said, what to offer, when to follow up…"
          />
        </label>
        <button
          className="btn primary"
          type="button"
          onClick={saveLead}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save lead activity"}
        </button>
      </section>

      {error ? (
        <div className="notice notice-error outreach-notice">{error}</div>
      ) : null}
      {notice ? <div className="notice outreach-notice">{notice}</div> : null}
    </div>
  );
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getSequenceLabel(input: {
  firstContactedAt: string;
  followUpAt: string;
  followUpStep: number;
  followUpStoppedAt: string;
  outcome: LeadOutcome | "";
}) {
  if (input.outcome)
    return {
      title: LEAD_OUTCOME_LABELS[input.outcome],
      detail: "Automatic follow-up reminders are stopped.",
    };
  if (input.followUpStoppedAt || input.followUpStep >= 3)
    return {
      title: "Sequence complete",
      detail:
        "Three follow-ups have been recorded. No more reminders are scheduled.",
    };
  if (!input.firstContactedAt)
    return {
      title: "Not contacted yet",
      detail:
        "Mark the first message sent to start the 3, 7, and 14-day follow-up schedule.",
    };
  if (input.followUpAt)
    return {
      title: `Follow-up ${Math.min(input.followUpStep + 1, 3)} of 3`,
      detail: `Next reminder: ${new Date(input.followUpAt).toLocaleString()}.`,
    };
  return {
    title: "Waiting on reply",
    detail: "Set a follow-up date or record an outcome.",
  };
}
