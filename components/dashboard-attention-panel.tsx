"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OnboardingStage } from "@/lib/onboarding";

export type DashboardAttentionItem = {
  id: string;
  kind:
    | "overdue"
    | "due_today"
    | "never_contacted"
    | "aging"
    | "manual_review";
  label: string;
  title: string;
  meta?: string;
  detail: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

type OnboardingAction = {
  title: string;
  detail: string;
  href: string;
  label: string;
};

type Props = {
  stage: OnboardingStage;
  summaryDetail: string;
  actionCount: number;
  items: DashboardAttentionItem[];
  onboardingAction?: OnboardingAction;
  initiallyOpen?: boolean;
};

const steps = ["Find", "Review", "Draft", "Send"];

export function DashboardAttentionPanel({
  stage,
  summaryDetail,
  actionCount,
  items,
  onboardingAction,
  initiallyOpen = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const isOnboarding = stage !== "active";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const storageKey = `webvidence:attention-panel:${stage}`;
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved !== null) {
        setOpen(saved === "open");
        return;
      }
      setOpen(mobile ? stage === "first_search" : initiallyOpen);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initiallyOpen, stage]);

  function toggle() {
    const next = !open;
    setOpen(next);
    window.sessionStorage.setItem(
      `webvidence:attention-panel:${stage}`,
      next ? "open" : "closed",
    );
  }

  return (
    <section
      className={`attention-panel ${isOnboarding ? "attention-onboarding" : "attention-active"}`}
      aria-label={isOnboarding ? "Getting started" : "What needs attention next"}
    >
      <button
        className="attention-panel-summary"
        type="button"
        aria-expanded={open}
        aria-controls="dashboard-attention-content"
        onClick={toggle}
      >
        <span className="attention-summary-copy">
          <small>{isOnboarding ? "Getting started" : "Today’s work"}</small>
          <strong>
            {isOnboarding ? `Your next step: ${onboardingAction?.title || "Keep going"}` : "What needs attention next"}
          </strong>
          <span>{summaryDetail}</span>
        </span>
        <span className="attention-summary-end">
          {actionCount > 0 ? <b>{actionCount > 99 ? "99+" : actionCount}</b> : null}
          <i aria-hidden="true">{open ? "−" : "+"}</i>
        </span>
      </button>

      {open ? (
        <div className="attention-panel-content" id="dashboard-attention-content">
          {isOnboarding && onboardingAction ? (
            <div className="attention-onboarding-body">
              <div className="attention-progress" aria-label="First outreach progress">
                {steps.map((step, index) => {
                  const current = stageIndex(stage);
                  const complete = index < current;
                  const active = index === current;
                  return (
                    <span
                      key={step}
                      className={complete ? "complete" : active ? "active" : ""}
                    >
                      <i>{complete ? "✓" : index + 1}</i>
                      {step}
                    </span>
                  );
                })}
              </div>
              <div className="attention-onboarding-action">
                <div>
                  <h3>{onboardingAction.title}</h3>
                  <p>{onboardingAction.detail}</p>
                </div>
                <Link className="btn primary" href={onboardingAction.href}>
                  {onboardingAction.label}
                </Link>
              </div>
            </div>
          ) : items.length ? (
            <>
              <div className="attention-list">
                {items.map((item) => (
                  <article key={item.id} className={`attention-item priority-${item.kind}`}>
                    <div>
                      <span className="priority-label">{item.label}</span>
                      <b>{item.title}</b>
                      {item.meta ? <small>{item.meta}</small> : null}
                      <p>{item.detail}</p>
                    </div>
                    <div className="attention-item-actions">
                      <Link className="btn primary" href={item.primaryHref}>
                        {item.primaryLabel}
                      </Link>
                      {item.secondaryHref && item.secondaryLabel ? (
                        <Link className="btn" href={item.secondaryHref}>
                          {item.secondaryLabel}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <div className="attention-panel-footer">
                <span>Only the top three actions are shown here.</span>
                <Link href="/dashboard/leads?filter=due">View all in Pipeline</Link>
              </div>
            </>
          ) : (
            <div className="attention-empty">
              <div>
                <b>Nothing needs attention right now.</b>
                <span>New follow-ups and strong untouched leads will show up here.</span>
              </div>
              <Link className="btn" href="/dashboard/leads">
                Open pipeline
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function stageIndex(stage: OnboardingStage) {
  if (stage === "first_search") return 0;
  if (stage === "review") return 1;
  if (stage === "draft") return 2;
  if (stage === "send") return 3;
  return 4;
}
