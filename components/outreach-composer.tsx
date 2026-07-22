"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMailtoHref, buildSmsHref } from "@/lib/outreach/links";
import {
  LEAD_OUTCOME_LABELS,
  LEAD_OUTCOMES,
  type LeadOutcome,
} from "@/lib/leads/priority";
import {
  REPLY_ACTION_LABELS,
  REPLY_ACTIONS,
  type OutreachIntent,
  type ReplyAction,
} from "@/lib/outreach/types";
import type { ProductEvent } from "@/lib/outreach/events";

type DeliveryChannel = "email" | "facebook" | "text";
type ReplyChannel = DeliveryChannel | "phone" | "other";

type Message = {
  id: string;
  channel: string;
  contact_channel: string | null;
  subject: string | null;
  body: string;
  status: string;
  direction: string;
  intent: string | null;
  parent_message_id: string | null;
  reply_summary: string | null;
  recommended_action: ReplyAction | null;
  analysis_reasoning: string | null;
  copied_at: string | null;
  sent_at: string | null;
  created_at: string;
};

type OutreachProfile = {
  serviceDescription: string;
  typicalProjectRange: string;
  targetCustomer: string;
  outreachStyle: string;
  baseLocation: string;
  preferredChannels: string;
};

type ReplyAnalysis = {
  summary: string;
  needStatus: "not_clear" | "possible_need" | "clear_need" | "not_a_fit";
  recommendedAction: ReplyAction;
  suggestedResponse: string;
  reasoning: string;
};

type MomentumSummary = {
  sentToday: number;
  sentThisWeek: number;
};

type Props = {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  nextLeadHref?: string | null;
  nextLeadName?: string | null;
  initialStatus: string;
  initialNotes: string;
  initialBusinessObservation: string;
  initialFollowUpAt: string;
  initialFirstContactedAt: string;
  initialFollowUpStep: number;
  initialFollowUpStoppedAt: string;
  initialOutcome: LeadOutcome | null;
  outreachProfile: OutreachProfile;
  profileComplete: boolean;
  initialMessages: Message[];
};

const channelOptions: Array<{ id: DeliveryChannel; label: string }> = [
  { id: "facebook", label: "Facebook" },
  { id: "email", label: "Email" },
  { id: "text", label: "Text" },
];

const intentOptions: Array<{
  id: Exclude<OutreachIntent, "service_intro">;
  label: string;
  note: string;
}> = [
  {
    id: "conversation",
    label: "Start a conversation",
    note: "One real detail and one natural question, without a pitch.",
  },
  {
    id: "website_finding",
    label: "Use a website finding",
    note: "Use one verified observation in plain language.",
  },
  {
    id: "follow_up",
    label: "Follow up",
    note: "Use the previous sent message without repeating the pitch.",
  },
];

const preferredChannelKey = "webvidence:preferred-outreach-channel";

export function OutreachComposer({
  leadId,
  leadName,
  leadPhone,
  nextLeadHref = null,
  nextLeadName = null,
  initialStatus,
  initialNotes,
  initialBusinessObservation,
  initialFollowUpAt,
  initialFirstContactedAt,
  initialFollowUpStep,
  initialFollowUpStoppedAt,
  initialOutcome,
  outreachProfile,
  profileComplete,
  initialMessages,
}: Props) {
  const [channel, setChannel] = useState<DeliveryChannel>(() => {
    if (typeof window === "undefined") return "facebook";
    const saved = window.localStorage.getItem(preferredChannelKey) as DeliveryChannel | null;
    if (!saved || !channelOptions.some((item) => item.id === saved)) return "facebook";
    return saved === "text" && !leadPhone ? "facebook" : saved;
  });
  const [intent, setIntent] = useState<OutreachIntent>("conversation");
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState(
    initialMessages.find((message) => message.direction !== "inbound")?.id || "",
  );
  const [composerOpen, setComposerOpen] = useState(() =>
    initialMessages.some((message) => message.direction === "draft" && message.status !== "sent"),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [businessObservation, setBusinessObservation] = useState(initialBusinessObservation);
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);
  const [firstContactedAt, setFirstContactedAt] = useState(initialFirstContactedAt);
  const [followUpStep, setFollowUpStep] = useState(initialFollowUpStep);
  const [followUpStoppedAt, setFollowUpStoppedAt] = useState(initialFollowUpStoppedAt);
  const [outcome, setOutcome] = useState<LeadOutcome | "">(initialOutcome || "");
  const [textRecipient, setTextRecipient] = useState(leadPhone || "");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [momentum, setMomentum] = useState<MomentumSummary>({ sentToday: 0, sentThisWeek: 0 });
  const [dailyTarget, setDailyTarget] = useState(() => {
    if (typeof window === "undefined") return 5;
    const saved = Number(window.sessionStorage.getItem("webvidence:daily-outreach-target") || 5);
    return Number.isFinite(saved) ? Math.max(5, saved) : 5;
  });
  const [profile, setProfile] = useState(outreachProfile);
  const [profileIsComplete, setProfileIsComplete] = useState(profileComplete);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileSkipped, setProfileSkipped] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [showReplySheet, setShowReplySheet] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>("facebook");
  const [replyIsSummary, setReplyIsSummary] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyAnalysis, setReplyAnalysis] = useState<ReplyAnalysis | null>(null);
  const [activeInboundId, setActiveInboundId] = useState<string | null>(null);
  const [differentApproachOpen, setDifferentApproachOpen] = useState(false);
  const [preferredReplyAction, setPreferredReplyAction] = useState<ReplyAction>("ask_question");

  const selected = useMemo(
    () => messages.find((item) => item.id === selectedId) || null,
    [messages, selectedId],
  );
  const latestInbound = messages.find((message) => message.direction === "inbound") || null;
  const latestSent = messages.find((message) => message.status === "sent" && message.direction === "outbound") || null;
  const latestDraft = messages.find((message) => message.direction === "draft" && message.status !== "sent") || null;
  const responseDraft = activeInboundId
    ? messages.find((message) => message.parent_message_id === activeInboundId && message.direction === "draft") || null
    : latestInbound
      ? messages.find((message) => message.parent_message_id === latestInbound.id && message.direction === "draft") || null
      : null;
  const pendingDeliveryKey = `webvidence:pending-delivery:${leadId}`;
  const sequenceLabel = getSequenceLabel({ firstContactedAt, followUpAt, followUpStep, followUpStoppedAt, outcome });
  const effectiveSelectedChannel = getDeliveryChannel(selected);
  const emailHref = selected && effectiveSelectedChannel === "email"
    ? buildMailtoHref(emailRecipient, selected.subject || "", selected.body)
    : "";
  const targetComplete = momentum.sentToday >= dailyTarget;
  const remaining = Math.max(0, dailyTarget - momentum.sentToday);
  const leadStage = getLeadStage({ status, outcome, latestDraft, latestInbound, firstContactedAt });

  useEffect(() => {
    void refreshMomentum();
  }, []);

  useEffect(() => {
    if (!latestInbound?.recommended_action || !latestInbound.reply_summary) return;
    setActiveInboundId(latestInbound.id);
    setReplyAnalysis({
      summary: latestInbound.reply_summary,
      needStatus: inferNeedStatus(latestInbound.recommended_action),
      recommendedAction: latestInbound.recommended_action,
      suggestedResponse: responseDraft?.body || "",
      reasoning: latestInbound.analysis_reasoning || "",
    });
  }, []);

  useEffect(() => {
    function handleManualReviewComplete() {
      setError("");
      setNotice("Manual review marked complete. You can use a verified website finding now.");
    }
    window.addEventListener("webvidence:manual-review-complete", handleManualReviewComplete);
    return () => window.removeEventListener("webvidence:manual-review-complete", handleManualReviewComplete);
  }, []);

  useEffect(() => {
    function checkPendingDelivery() {
      if (document.visibilityState !== "visible" || !selected) return;
      const pendingMessageId = window.sessionStorage.getItem(pendingDeliveryKey);
      if (pendingMessageId === selected.id && selected.status !== "sent") {
        window.setTimeout(() => setShowSendConfirm(true), 250);
      }
    }
    window.addEventListener("focus", checkPendingDelivery);
    document.addEventListener("visibilitychange", checkPendingDelivery);
    return () => {
      window.removeEventListener("focus", checkPendingDelivery);
      document.removeEventListener("visibilitychange", checkPendingDelivery);
    };
  }, [pendingDeliveryKey, selected]);

  async function track(event: ProductEvent, metadata: Record<string, string> = {}) {
    try {
      await fetch("/api/product-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, leadId, surface: "lead", ...metadata }),
        keepalive: true,
      });
    } catch {
      // Product events must never interrupt the outreach workflow.
    }
  }

  function chooseChannel(next: DeliveryChannel) {
    setChannel(next);
    window.localStorage.setItem(preferredChannelKey, next);
  }

  function chooseIntent(next: OutreachIntent) {
    setIntent(next);
    void track("outreach_intent_selected", { intent: next, channel });
  }

  async function refreshMomentum() {
    const offset = new Date().getTimezoneOffset();
    const response = await fetch(`/api/outreach-momentum?tzOffset=${offset}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const sentToday = Number(data.sentToday || 0);
    setMomentum({ sentToday, sentThisWeek: Number(data.sentThisWeek || 0) });
    setDailyTarget((current) => Math.max(current, Math.ceil(Math.max(1, sentToday) / 5) * 5));
  }

  function addThreeMore() {
    setDailyTarget((current) => {
      const next = Math.max(current, momentum.sentToday) + 3;
      window.sessionStorage.setItem("webvidence:daily-outreach-target", String(next));
      return next;
    });
  }

  function prepareOutreach(nextIntent: OutreachIntent = "conversation") {
    chooseIntent(nextIntent);
    setComposerOpen(true);
    setError("");
    void track("outreach_composer_opened", { intent: nextIntent });
    window.setTimeout(() => document.getElementById("outreach-composer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function requestGenerate() {
    if (!profileIsComplete && !profileSkipped) {
      setPendingGenerate(true);
      setShowProfileSetup(true);
      return;
    }
    await generate();
  }

  async function generate() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId,
          channel,
          intent,
          businessObservation: businessObservation.trim() || null,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : { error: `Could not prepare outreach (${response.status}).` };
      if (!response.ok) throw new Error(data.error || "Could not prepare outreach.");
      const message = data.message as Message;
      setMessages((current) => [message, ...current]);
      setSelectedId(message.id);
      setComposerOpen(true);
      setNotice("Draft prepared. Review it before sending.");
      if (businessObservation.trim()) void track("business_observation_added", { intent });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Could not prepare outreach.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfileAndContinue() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/outreach-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the outreach profile.");
      setProfileIsComplete(true);
      setShowProfileSetup(false);
      setNotice("Outreach details saved.");
      if (pendingGenerate) {
        setPendingGenerate(false);
        await generate();
      }
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Could not save the outreach profile.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMessage(messageId: string, patch: Partial<Message> & { copied?: boolean }) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save message.");
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, ...data.message } : item));
      if (data.lead) applyLeadState(data.lead);
      if (patch.status === "sent") {
        const scheduling = data.lead?.next_follow_up_at
          ? ` Follow-up scheduled for ${new Date(data.lead.next_follow_up_at).toLocaleDateString()}.`
          : data.lead?.follow_up_stopped_at
            ? " The follow-up sequence is complete."
            : "";
        setNotice(`Message marked sent.${scheduling}${data.warning ? ` ${data.warning}` : ""}`);
        window.sessionStorage.removeItem(pendingDeliveryKey);
        setShowSendConfirm(false);
        await refreshMomentum();
        void track(messageId === responseDraft?.id ? "suggested_response_marked_sent" : "send_confirmed", {
          intent: String(data.message?.intent || ""),
          channel: String(data.message?.contact_channel || data.message?.channel || ""),
        });
        if (data.message?.intent === "follow_up" || data.message?.channel === "follow_up") {
          void track("follow_up_completed", { channel: String(data.message?.contact_channel || "") });
        }
      } else if (!patch.copied) {
        setNotice("Draft saved.");
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save message.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveLead() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          notes,
          businessObservation: businessObservation.trim() || null,
          nextFollowUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
          leadOutcome: outcome || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update lead.");
      applyLeadState(data.lead);
      setNotice("Lead tracking and private notes saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update lead.");
    } finally {
      setSaving(false);
    }
  }

  async function recordQuickOutcome(quickStatus: string, quickOutcome?: LeadOutcome) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: quickStatus, ...(quickOutcome ? { leadOutcome: quickOutcome } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update lead.");
      applyLeadState(data.lead);
      const event = quickOutcome === "interested"
        ? "interested_outcome_selected"
        : quickOutcome === "proposal_sent"
          ? "proposal_recorded"
          : quickOutcome === "closed_won"
            ? "won_outcome_selected"
            : quickStatus === "not_interested"
              ? "not_a_fit_outcome_selected"
              : null;
      if (event) void track(event, { outcome: quickOutcome || quickStatus });
      setNotice(quickOutcome ? `${LEAD_OUTCOME_LABELS[quickOutcome]} recorded.` : "Marked as not a fit.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update lead.");
    } finally {
      setSaving(false);
    }
  }

  function applyLeadState(lead: Record<string, unknown>) {
    setStatus(String(lead.status || status));
    setFollowUpAt(toLocalInput(lead.next_follow_up_at as string | null));
    setFirstContactedAt(String(lead.first_contacted_at || firstContactedAt || ""));
    setFollowUpStep(Number(lead.follow_up_step || 0));
    setFollowUpStoppedAt(String(lead.follow_up_stopped_at || ""));
    setOutcome((lead.lead_outcome as LeadOutcome | null) || "");
    if (typeof lead.business_observation === "string") setBusinessObservation(lead.business_observation);
  }

  function beginExternalDelivery(message: Message | null = selected) {
    if (!message || message.status === "sent") return;
    window.sessionStorage.setItem(pendingDeliveryKey, message.id);
    void track("contact_application_opened", {
      intent: message.intent || "",
      channel: getDeliveryChannel(message) || "",
    });
  }

  function dismissSendConfirm() {
    window.sessionStorage.removeItem(pendingDeliveryKey);
    setShowSendConfirm(false);
  }

  async function copySpecificMessage(message: Message, responseCopy = false) {
    const content = [message.subject, message.body].filter(Boolean).join("\n\n");
    setError("");
    try {
      await navigator.clipboard.writeText(content);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, copied_at: new Date().toISOString() } : item));
      void updateMessage(message.id, { copied: true });
      void track(responseCopy ? "suggested_response_copied" : "message_copied", {
        intent: message.intent || "",
        channel: getDeliveryChannel(message) || "",
      });
      if (!responseCopy) {
        window.sessionStorage.setItem(pendingDeliveryKey, message.id);
        setSelectedId(message.id);
        setNotice("Message copied. Confirm it after you send it.");
        setShowSendConfirm(true);
      } else {
        setNotice("Response copied.");
      }
    } catch {
      setNotice("");
      setError("The message could not be copied automatically. Select the text and copy it manually.");
    }
  }

  function openTextApp(message: Message) {
    setError("");
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const smsHref = buildSmsHref(textRecipient, message.body, isAppleMobile);
    if (!smsHref) {
      setError("Add a valid business phone number before opening the text app.");
      return;
    }
    setSelectedId(message.id);
    beginExternalDelivery(message);
    window.location.href = smsHref;
  }

  function openReplyWorkflow() {
    setShowReplySheet(true);
    setError("");
    if (latestInbound) {
      setActiveInboundId(latestInbound.id);
      setReplyText(latestInbound.body);
      setReplyChannel((latestInbound.contact_channel || latestInbound.channel || "other") as ReplyChannel);
    }
  }

  async function submitReply(preferredAction?: ReplyAction) {
    setReplyLoading(true);
    setError("");
    try {
      const payload = activeInboundId
        ? { leadId, replyMessageId: activeInboundId, channel: replyChannel, preferredAction }
        : { leadId, reply: replyText, channel: replyChannel, isSummary: replyIsSummary, preferredAction };
      const response = await fetch("/api/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.replySaved && data.replyMessageId) {
          const savedInbound: Message = {
            id: String(data.replyMessageId),
            channel: replyChannel,
            contact_channel: replyChannel,
            subject: null,
            body: replyText,
            status: "received",
            direction: "inbound",
            intent: null,
            parent_message_id: null,
            reply_summary: replyIsSummary ? replyText : null,
            recommended_action: null,
            analysis_reasoning: null,
            copied_at: null,
            sent_at: null,
            created_at: new Date().toISOString(),
          };
          setMessages((current) => [savedInbound, ...current.filter((message) => message.id !== savedInbound.id)]);
          setActiveInboundId(savedInbound.id);
          setStatus("replied");
          setNotice(data.error || "Reply saved, but no response was prepared.");
          void track("prospect_marked_replied", { channel: replyChannel });
          return;
        }
        throw new Error(data.error || "Could not review the reply.");
      }
      if (!data.analysis) {
        const savedInbound = data.reply as Message | undefined;
        if (savedInbound) {
          setMessages((current) => [savedInbound, ...current.filter((message) => message.id !== savedInbound.id)]);
          setActiveInboundId(savedInbound.id);
          setReplyText(savedInbound.body);
        }
        setNotice(data.warning || "Reply saved, but no response was prepared.");
        setStatus("replied");
        void track("prospect_marked_replied", { channel: replyChannel });
        return;
      }
      const inbound = data.reply as Message;
      const draft = data.draft as Message;
      setMessages((current) => {
        const withoutUpdated = current.filter((message) => message.id !== inbound.id && message.id !== draft.id);
        return [draft, inbound, ...withoutUpdated];
      });
      setActiveInboundId(inbound.id);
      setSelectedId(draft.id);
      setReplyAnalysis(data.analysis as ReplyAnalysis);
      setPreferredReplyAction((data.analysis as ReplyAnalysis).recommendedAction);
      setStatus("replied");
      setReplyText("");
      setNotice("Reply saved and response prepared.");
      void track("prospect_marked_replied", { channel: replyChannel });
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "Could not review the reply.");
    } finally {
      setReplyLoading(false);
    }
  }

  const currentDraft = responseDraft || selected;
  const mobilePrimaryAction = buildMobileAction();

  function buildMobileAction() {
    if (leadStage === "closed") return <button className="btn" type="button" onClick={() => document.getElementById("lead-tracking")?.scrollIntoView({ behavior: "smooth" })}>Record outcome</button>;
    if (leadStage === "replied") return <button className="btn primary" type="button" onClick={openReplyWorkflow}>Plan response</button>;
    if (leadStage === "interested") return <button className="btn primary" type="button" onClick={() => prepareOutreach("service_intro")}>Prepare introduction</button>;
    if (leadStage === "waiting") return <button className="btn primary" type="button" onClick={openReplyWorkflow}>They replied</button>;
    if (leadStage === "draft" && latestDraft) return <button className="btn primary" type="button" onClick={() => void copySpecificMessage(latestDraft)}>Copy message</button>;
    return <button className="btn primary" type="button" onClick={() => prepareOutreach("conversation")}>Prepare outreach</button>;
  }

  return (
    <div className="outreach-layout" id="outreach">
      <div className="outreach-momentum-strip">
        <span><b>{momentum.sentToday} of {dailyTarget}</b> contacted today</span>
        <span>{targetComplete ? "Good stopping point" : `${remaining} left in this batch`}</span>
      </div>

      <section className={`outreach-panel next-step-panel next-step-${leadStage}`} aria-labelledby="next-step-title">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Next step</div>
            <h3 id="next-step-title">{nextStepTitle(leadStage)}</h3>
          </div>
          <span className="tag">{status.replaceAll("_", " ")}</span>
        </div>
        <p className="next-step-copy">{nextStepCopy(leadStage)}</p>

        {leadStage === "new" ? (
          <div className="next-step-actions">
            <button className="btn primary" type="button" onClick={() => prepareOutreach("conversation")}>Prepare outreach</button>
            <button className="btn quiet" type="button" onClick={() => void recordQuickOutcome("not_interested")}>Not a fit</button>
          </div>
        ) : null}

        {leadStage === "draft" && latestDraft ? (
          <>
            <div className="next-step-meta">
              <span>{formatIntent(latestDraft.intent)}</span>
              <span>{formatChannel(getDeliveryChannel(latestDraft))}</span>
            </div>
            <div className="next-step-actions">
              <button className="btn primary" type="button" onClick={() => void copySpecificMessage(latestDraft)}>Copy message</button>
              {getDeliveryChannel(latestDraft) === "email" ? (
                <a className="btn" href={buildMailtoHref(emailRecipient, latestDraft.subject || "", latestDraft.body)} onClick={() => { setSelectedId(latestDraft.id); beginExternalDelivery(latestDraft); }}>Open email</a>
              ) : null}
              {getDeliveryChannel(latestDraft) === "text" ? (
                <button className="btn" type="button" onClick={() => openTextApp(latestDraft)}>Open text</button>
              ) : null}
              <button className="btn quiet" type="button" onClick={() => { setSelectedId(latestDraft.id); setComposerOpen(true); }}>Edit draft</button>
            </div>
          </>
        ) : null}

        {leadStage === "waiting" ? (
          <>
            <div className="next-step-meta">
              <span>Sent {latestSent?.sent_at ? new Date(latestSent.sent_at).toLocaleDateString() : firstContactedAt ? new Date(firstContactedAt).toLocaleDateString() : "recently"}</span>
              <span>{formatChannel(getDeliveryChannel(latestSent))}</span>
              <span>{followUpAt ? `Follow-up due ${new Date(followUpAt).toLocaleString()}` : "No follow-up due date"}</span>
            </div>
            <div className="next-step-actions">
              <button className="btn primary" type="button" onClick={openReplyWorkflow}>They replied</button>
              <button className="btn" type="button" onClick={() => prepareOutreach("follow_up")}>Follow up now</button>
            </div>
          </>
        ) : null}

        {leadStage === "replied" ? (
          <div className="next-step-actions">
            <button className="btn primary" type="button" onClick={openReplyWorkflow}>Plan my response</button>
            <button className="btn" type="button" onClick={() => void recordQuickOutcome("interested", "interested")}>Mark interested</button>
            <button className="btn quiet" type="button" onClick={() => void recordQuickOutcome("not_interested")}>Not a fit</button>
          </div>
        ) : null}

        {leadStage === "interested" ? (
          <div className="next-step-actions">
            <button className="btn primary" type="button" onClick={() => prepareOutreach("service_intro")}>Prepare service introduction</button>
            <button className="btn" type="button" onClick={() => void recordQuickOutcome("quote_sent", "proposal_sent")}>Record call or proposal</button>
          </div>
        ) : null}

        {leadStage === "closed" ? (
          <div className="outcome-summary">
            <b>{outcome ? LEAD_OUTCOME_LABELS[outcome] : status.replaceAll("_", " ")}</b>
            <span>Outreach controls are quiet because this opportunity is closed.</span>
          </div>
        ) : null}
      </section>

      {composerOpen ? (
        <section className="outreach-panel" id="outreach-composer">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Prepare outreach</div>
              <h3>{intent === "service_intro" ? "Prepare a service introduction" : "What kind of message are you preparing?"}</h3>
            </div>
            <span className="tag">manual approval</span>
          </div>

          {intent !== "service_intro" ? (
            <div className="outreach-intent-control" role="tablist" aria-label="Outreach intent">
              {intentOptions.map((option) => (
                <button
                  key={option.id}
                  className={intent === option.id ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={intent === option.id}
                  onClick={() => chooseIntent(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Use the recorded reply and identified need to make a short, practical connection to your service.</p>
          )}

          {intent !== "service_intro" ? <p className="intent-note">{intentOptions.find((option) => option.id === intent)?.note}</p> : null}

          <div className="delivery-channel-control" aria-label="Contact channel">
            <span>Channel</span>
            <div>
              {channelOptions.map((option) => (
                <button
                  className={channel === option.id ? "active" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => chooseChannel(option.id)}
                  disabled={option.id === "text" && !leadPhone}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <details className="business-observation-disclosure" open={Boolean(businessObservation)}>
            <summary>Noticed something about this business? Add it</summary>
            <label>
              <span>Optional business observation</span>
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                value={businessObservation}
                onChange={(event) => setBusinessObservation(event.target.value)}
                placeholder="They recently posted about adding commercial pressure washing."
              />
              <small>Stored privately with this prospect. Webvidence treats it as something you supplied, not independently verified.</small>
            </label>
          </details>

          <button className="btn primary generate-button" type="button" onClick={() => void requestGenerate()} disabled={loading}>
            {loading ? <><span className="mini-spinner" /> Preparing draft…</> : intent === "website_finding" ? "Prepare from verified finding" : intent === "follow_up" ? "Prepare follow-up" : intent === "service_intro" ? "Prepare introduction" : "Prepare grounded draft"}
          </button>
          <small className="muted outreach-helper">Webvidence never sends automatically. You review, edit, and decide what was actually sent.</small>
          {!profileIsComplete ? (
            <div className="outreach-profile-tip">
              <span>Add your service, best-fit customer, location, pricing range, and natural style to personalize drafts without changing the selected approach.</span>
              <button type="button" onClick={() => setShowProfileSetup(true)}>Set up now</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {selected && selected.direction !== "inbound" ? (
        <section className="outreach-panel draft-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Draft desk</div>
              <h3>{formatIntent(selected.intent)} draft</h3>
            </div>
            <span className="tag">{selected.status}</span>
          </div>
          {effectiveSelectedChannel === "email" ? (
            <label className="delivery-recipient">
              <span>Email recipient</span>
              <input className="input outreach-input" inputMode="email" type="email" value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} placeholder="Business email address" autoComplete="email" />
              <small>Webvidence does not guess an address. Add the correct business email before opening your email app.</small>
            </label>
          ) : null}
          {effectiveSelectedChannel === "text" ? (
            <label className="delivery-recipient">
              <span>Text recipient</span>
              <input className="input outreach-input" inputMode="tel" type="tel" value={textRecipient} onChange={(event) => setTextRecipient(event.target.value)} placeholder="Business phone number" autoComplete="tel" />
              <small>Confirm this is an appropriate business contact number before sending.</small>
            </label>
          ) : null}
          {selected.subject !== null ? (
            <label>
              <span>Email subject</span>
              <input className="input outreach-input" value={selected.subject || ""} onChange={(event) => setMessages((current) => current.map((item) => item.id === selected.id ? { ...item, subject: event.target.value } : item))} />
            </label>
          ) : null}
          <label>
            <span>Message</span>
            <textarea className="input outreach-textarea" value={selected.body} onChange={(event) => setMessages((current) => current.map((item) => item.id === selected.id ? { ...item, body: event.target.value } : item))} />
          </label>
          <div className="draft-actions">
            <button className="btn" type="button" onClick={() => void updateMessage(selected.id, { subject: selected.subject, body: selected.body })} disabled={saving}>Save edits</button>
            <button className="btn" type="button" onClick={() => void copySpecificMessage(selected)}>Copy message</button>
            {effectiveSelectedChannel === "email" ? <a className="btn delivery-button" href={emailHref} onClick={() => beginExternalDelivery(selected)}>Open email app</a> : null}
            {effectiveSelectedChannel === "text" ? <button className="btn delivery-button" type="button" onClick={() => openTextApp(selected)}>Open text app</button> : null}
            <button className="btn primary" type="button" onClick={() => void updateMessage(selected.id, { subject: selected.subject, body: selected.body, status: "sent" })} disabled={saving || selected.status === "sent"}>{selected.status === "sent" ? "Already sent" : "Mark sent now"}</button>
          </div>
          {selected.status === "sent" ? (
            <div className="sent-next-card">
              <div><span className="sent-check">Sent ✓</span><b>{momentum.sentToday} contacted today</b><small>{nextLeadName ? `Next recommended: ${nextLeadName}` : "The contact date and follow-up were saved automatically."}</small></div>
              {nextLeadHref ? <Link className="btn primary" href={nextLeadHref}>Review next lead</Link> : targetComplete ? <button className="btn" type="button" onClick={addThreeMore}>Add 3 more</button> : <Link className="btn" href="/dashboard/campaigns">Back to results</Link>}
            </div>
          ) : null}
          {messages.filter((message) => message.direction !== "inbound").length > 1 ? (
            <details className="message-history-disclosure">
              <summary>Message history</summary>
              <label>
                <span>Saved drafts and sent messages</span>
                <select className="input outreach-input" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {messages.filter((message) => message.direction !== "inbound").map((message) => (
                    <option value={message.id} key={message.id}>{new Date(message.created_at).toLocaleDateString()} · {formatIntent(message.intent)} · {message.status}</option>
                  ))}
                </select>
              </label>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="outreach-panel pipeline-panel" id="lead-tracking">
        <details className="lead-tracking-details">
          <summary>Lead tracking, outcomes, and private notes</summary>
          <div className="follow-up-state"><b>{sequenceLabel.title}</b><span>{sequenceLabel.detail}</span></div>
          <div className="lead-tracking-fields">
            <label>
              <span>Pipeline status</span>
              <select className="input outreach-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                {["new", "reviewing", "ready_to_contact", "contacted", "replied", "interested", "follow_up", "quote_sent", "won", "lost", "not_interested", "do_not_contact", "archived"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
              </select>
            </label>
            <label>
              <span>What happened?</span>
              <select className="input outreach-input" value={outcome} onChange={(event) => setOutcome(event.target.value as LeadOutcome | "")}>
                <option value="">No outcome recorded</option>
                {LEAD_OUTCOMES.map((value) => <option key={value} value={value}>{LEAD_OUTCOME_LABELS[value]}</option>)}
              </select>
            </label>
            <label>
              <span>Follow-up date</span>
              <input className="input outreach-input" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
            </label>
            <label>
              <span>Private notes</span>
              <textarea className="input outreach-notes" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What they said, what to offer, when to follow up…" />
            </label>
            <button className="btn primary" type="button" onClick={() => void saveLead()} disabled={saving}>{saving ? "Saving…" : "Save lead activity"}</button>
          </div>
        </details>
      </section>

      {error ? <div className="notice notice-error outreach-notice">{error}</div> : null}
      {notice ? <div className="notice outreach-notice">{notice}</div> : null}

      <div className="mobile-outreach-dock" aria-label="Current outreach action">
        <div><small>{leadName}</small><span>{mobileStepLabel(leadStage)}</span></div>
        {mobilePrimaryAction}
      </div>
      <div className="mobile-outreach-dock-spacer" aria-hidden="true" />

      {showProfileSetup ? (
        <div className="send-confirm-layer" role="presentation">
          <section className="send-confirm-sheet profile-setup-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-setup-title">
            <div><div className="eyebrow">Prepare this message</div><h3 id="profile-setup-title">A few details make drafts sound like you</h3><p>This setup personalizes the selected approach. It does not decide whether the message is conversation-first or website-first.</p></div>
            <label><span>What do you sell?</span><textarea className="input" rows={3} value={profile.serviceDescription} onChange={(event) => setProfile({ ...profile, serviceDescription: event.target.value })} /></label>
            <label><span>What type of business is the best fit?</span><input className="input" value={profile.targetCustomer} onChange={(event) => setProfile({ ...profile, targetCustomer: event.target.value })} /></label>
            <label><span>Where are you based?</span><input className="input" value={profile.baseLocation} onChange={(event) => setProfile({ ...profile, baseLocation: event.target.value })} /></label>
            <label><span>Approximate pricing or project range</span><input className="input" value={profile.typicalProjectRange} onChange={(event) => setProfile({ ...profile, typicalProjectRange: event.target.value })} /></label>
            <label><span>How should messages sound?</span><textarea className="input" rows={4} value={profile.outreachStyle} onChange={(event) => setProfile({ ...profile, outreachStyle: event.target.value })} /></label>
            <button className="btn primary" type="button" onClick={() => void saveProfileAndContinue()} disabled={saving}>{saving ? "Saving…" : "Save and continue"}</button>
            <button className="btn" type="button" onClick={() => { setShowProfileSetup(false); setProfileSkipped(true); if (pendingGenerate) { setPendingGenerate(false); void generate(); } }}>Skip for now</button>
          </section>
        </div>
      ) : null}

      {showReplySheet ? (
        <div className="send-confirm-layer reply-layer" role="presentation">
          <section className="send-confirm-sheet reply-assistant-sheet" role="dialog" aria-modal="true" aria-labelledby="reply-sheet-title">
            <button className="sheet-close" type="button" aria-label="Close reply planner" onClick={() => setShowReplySheet(false)}>×</button>
            {!replyAnalysis || !activeInboundId ? (
              <>
                <div><div className="eyebrow">They replied</div><h3 id="reply-sheet-title">What did they say?</h3><p>Paste the reply or briefly summarize it. Webvidence will help you decide what to do next.</p></div>
                <label><span>Prospect reply</span><textarea className="input reply-input" rows={8} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Paste the exact reply or write a short summary." /></label>
                <div className="reply-options-row">
                  <label><span>Channel</span><select className="input" value={replyChannel} onChange={(event) => setReplyChannel(event.target.value as ReplyChannel)}><option value="facebook">Facebook</option><option value="email">Email</option><option value="text">Text</option><option value="phone">Phone or call</option><option value="other">Other</option></select></label>
                  <label className="reply-summary-check"><input type="checkbox" checked={replyIsSummary} onChange={(event) => setReplyIsSummary(event.target.checked)} /> I summarized it instead of pasting it exactly</label>
                </div>
                <p className="privacy-note">Only include information you are comfortable storing with this prospect.</p>
                <button className="btn primary reply-submit-button" type="button" onClick={() => void submitReply()} disabled={replyLoading || !replyText.trim()}>{replyLoading ? "Reviewing the reply…" : "Review reply"}</button>
              </>
            ) : (
              <>
                <div><div className="eyebrow">Response plan</div><h3 id="reply-sheet-title">What this likely means</h3><p>{replyAnalysis.summary}</p></div>
                <section className="reply-analysis-section"><small>Recommended next step</small><b>{REPLY_ACTION_LABELS[replyAnalysis.recommendedAction]}</b></section>
                <section className="reply-analysis-section suggested-response-section">
                  <small>Suggested response</small>
                  {responseDraft ? (
                    <textarea className="input reply-response-editor" rows={7} value={responseDraft.body} onChange={(event) => setMessages((current) => current.map((message) => message.id === responseDraft.id ? { ...message, body: event.target.value } : message))} />
                  ) : <p>{replyAnalysis.suggestedResponse}</p>}
                  <div className="draft-actions">
                    {responseDraft ? <button className="btn primary" type="button" onClick={() => void copySpecificMessage(responseDraft, true)}>Copy response</button> : null}
                    {responseDraft ? <button className="btn" type="button" onClick={() => void updateMessage(responseDraft.id, { body: responseDraft.body, subject: responseDraft.subject })}>Save response</button> : null}
                    {responseDraft ? <button className="btn" type="button" onClick={() => void updateMessage(responseDraft.id, { body: responseDraft.body, subject: responseDraft.subject, status: "sent" })}>Mark sent</button> : null}
                  </div>
                </section>
                <details className="reply-reasoning"><summary>Why Webvidence suggested this</summary><p>{replyAnalysis.reasoning}</p></details>
                <button className="btn quiet" type="button" onClick={() => setDifferentApproachOpen((current) => !current)}>Use a different approach</button>
                {differentApproachOpen ? (
                  <div className="different-approach-control">
                    <select className="input" value={preferredReplyAction} onChange={(event) => setPreferredReplyAction(event.target.value as ReplyAction)}>
                      {REPLY_ACTIONS.map((action) => <option key={action} value={action}>{REPLY_ACTION_LABELS[action]}</option>)}
                    </select>
                    <button className="btn" type="button" onClick={() => void submitReply(preferredReplyAction)} disabled={replyLoading}>{replyLoading ? "Preparing…" : "Prepare this approach"}</button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {showSendConfirm && selected && selected.status !== "sent" ? (
        <div className="send-confirm-layer" role="presentation">
          <section className="send-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="send-confirm-title">
            <div><div className="eyebrow">One quick confirmation</div><h3 id="send-confirm-title">Did you send the message?</h3><p>{leadName}. Confirming it once saves the contact date and keeps the next step accurate.</p></div>
            <button className="btn primary" type="button" onClick={() => void updateMessage(selected.id, { subject: selected.subject, body: selected.body, status: "sent" })} disabled={saving}>{saving ? "Saving…" : "Yes, mark sent"}</button>
            <button className="btn" type="button" onClick={dismissSendConfirm}>Not yet</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function getDeliveryChannel(message: Message | null | undefined): DeliveryChannel | null {
  const value = message?.contact_channel || message?.channel;
  return value === "email" || value === "facebook" || value === "text" ? value : null;
}

function getLeadStage(input: {
  status: string;
  outcome: LeadOutcome | "";
  latestDraft: Message | null;
  latestInbound: Message | null;
  firstContactedAt: string;
}) {
  if (input.outcome && ["no_response", "closed_won", "closed_lost"].includes(input.outcome)) return "closed" as const;
  if (["won", "lost", "not_interested", "do_not_contact", "archived"].includes(input.status)) return "closed" as const;
  if (input.status === "interested" || ["interested", "meeting_booked", "proposal_sent"].includes(input.outcome)) return "interested" as const;
  if (input.status === "replied" || input.latestInbound) return "replied" as const;
  if (input.latestDraft) return "draft" as const;
  if (input.firstContactedAt || ["contacted", "follow_up"].includes(input.status)) return "waiting" as const;
  return "new" as const;
}

function mobileStepLabel(stage: ReturnType<typeof getLeadStage>) {
  if (stage === "draft") return "Draft ready to review";
  if (stage === "waiting") return "Waiting for a reply";
  if (stage === "replied") return "Reply needs a response";
  if (stage === "interested") return "Need identified";
  if (stage === "closed") return "Outcome recorded";
  return "Decide whether to contact";
}

function nextStepTitle(stage: ReturnType<typeof getLeadStage>) {
  if (stage === "draft") return "Review the draft and decide whether to send it.";
  if (stage === "waiting") return "Waiting for a reply.";
  if (stage === "replied") return "Review what they said and decide on the next step.";
  if (stage === "interested") return "A possible need has been identified.";
  if (stage === "closed") return "Outcome recorded.";
  return "Review the business and decide whether it is worth contacting.";
}

function nextStepCopy(stage: ReturnType<typeof getLeadStage>) {
  if (stage === "draft") return "Copy it, open the correct contact channel, or edit it before sending.";
  if (stage === "waiting") return "Keep the sent date, channel, and follow-up due date together without introducing another pitch too early.";
  if (stage === "replied") return "Paste the reply or open the saved response plan. Webvidence will recommend one clear next move.";
  if (stage === "interested") return "Connect your service to the need they actually revealed, or record the call or proposal.";
  if (stage === "closed") return "The full outcome history remains available below, but outreach generation is no longer the primary action.";
  return "The evidence helps you review the opportunity. It does not tell you that the business will buy.";
}

function formatIntent(intent: string | null) {
  if (intent === "website_finding") return "Website finding";
  if (intent === "follow_up") return "Follow-up";
  if (intent === "service_intro") return "Service introduction";
  if (intent === "reply_response") return "Reply response";
  return "Conversation-first";
}

function formatChannel(channel: string | null) {
  if (!channel) return "Channel not recorded";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function inferNeedStatus(action: ReplyAction): ReplyAnalysis["needStatus"] {
  if (action === "mark_not_fit") return "not_a_fit";
  if (action === "introduce_service" || action === "suggest_call") return "clear_need";
  if (action === "ask_question") return "possible_need";
  return "not_clear";
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
  if (input.outcome) return { title: LEAD_OUTCOME_LABELS[input.outcome], detail: "Automatic follow-up reminders are stopped." };
  if (input.followUpStoppedAt || input.followUpStep >= 3) return { title: "Sequence complete", detail: "Three follow-ups have been recorded. No more reminders are scheduled." };
  if (!input.firstContactedAt) return { title: "Not contacted yet", detail: "Confirm the first sent message once. Webvidence will handle the 3, 7, and 14-day follow-up schedule." };
  if (input.followUpAt) return { title: `Follow-up ${Math.min(input.followUpStep + 1, 3)} of 3`, detail: `Next reminder: ${new Date(input.followUpAt).toLocaleString()}.` };
  return { title: "Waiting on reply", detail: "Record a reply or outcome when something changes." };
}
