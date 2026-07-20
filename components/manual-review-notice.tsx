"use client";

import { useState } from "react";

type Props = {
  leadId: string;
  reason: string;
};

export function ManualReviewNotice({ leadId, reason }: Props) {
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  async function markReviewed() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualReviewCompleted: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not mark the website reviewed.");
      }
      setCompleted(true);
      window.dispatchEvent(new CustomEvent("webvidence:manual-review-complete"));
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Could not mark the website reviewed.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (completed) {
    return (
      <div className="notice manual-review-complete" aria-live="polite">
        <b>Manual review marked complete.</b>
        <span>You can generate outreach now. Blocked-check findings will not be used as claims.</span>
      </div>
    );
  }

  return (
    <div className="notice manual-review-notice" aria-live="polite">
      <div className="manual-review-notice-inner">
        <div className="manual-review-copy">
          <b>Manual website review needed</b>
          <p>
            {reason} Open the website yourself, then mark it reviewed to unlock
            outreach.
          </p>
        </div>
        <button
          className="btn manual-review-action"
          type="button"
          onClick={markReviewed}
          disabled={saving}
        >
          {saving ? "Saving…" : "Mark as reviewed"}
        </button>
      </div>
      {error ? <small className="manual-review-error">{error}</small> : null}
    </div>
  );
}
