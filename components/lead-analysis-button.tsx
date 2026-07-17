'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AnalysisState = 'idle' | 'starting' | 'running' | 'failed';

type AuditJobResponse = {
  items?: Array<{
    leadId: string;
    status: string;
    error?: string | null;
    audit?: { id: string } | null;
  }>;
};

export function LeadAnalysisButton({
  leadId,
  hasAudit = false,
  initialRunning = false,
  compact = false,
}: {
  leadId: string;
  hasAudit?: boolean;
  initialRunning?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<AnalysisState>(initialRunning ? 'running' : 'idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (state !== 'running') return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/audit-jobs?leadIds=${encodeURIComponent(leadId)}`, {
          cache: 'no-store',
        });
        const data = (await response.json()) as AuditJobResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not check the analysis status.');
        if (cancelled) return;

        const item = data.items?.find((candidate) => candidate.leadId === leadId);
        if (!item) return;

        if (item.status === 'completed') {
          setState('idle');
          setError('');
          router.refresh();
          return;
        }

        if (item.status === 'failed' || item.status === 'cancelled') {
          setState('failed');
          setError(item.error || 'The website could not be analyzed.');
          router.refresh();
          return;
        }

        // Stop an abandoned browser poll after roughly five minutes. The server job
        // keeps running and the completed audit will still be there on the next visit.
        if (attempts >= 120) {
          setState('idle');
          router.refresh();
        }
      } catch (pollError) {
        if (!cancelled && attempts >= 120) {
          setState('failed');
          setError(pollError instanceof Error ? pollError.message : 'Could not check the analysis status.');
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [leadId, router, state]);

  async function analyze() {
    setState('starting');
    setError('');

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis could not be started.');

      if (data.status === 'completed') {
        setState('idle');
        router.refresh();
        return;
      }

      setState('running');
    } catch (analysisError) {
      setState('failed');
      setError(analysisError instanceof Error ? analysisError.message : 'Analysis could not be started.');
    }
  }

  const busy = state === 'starting' || state === 'running';
  const label = state === 'starting'
    ? 'Starting analysis…'
    : state === 'running'
      ? 'Analysis running…'
      : state === 'failed'
        ? 'Retry analysis'
        : hasAudit
          ? 'Run fresh analysis'
          : compact
            ? 'Analyze'
            : 'Analyze website';

  return (
    <span className={`lead-analysis-control ${compact ? 'compact' : ''}`}>
      <button
        className="btn primary"
        type="button"
        onClick={() => void analyze()}
        disabled={busy}
        title={error || undefined}
      >
        {busy ? <span className="mini-spinner" aria-hidden="true" /> : null}
        {label}
      </button>
      {!compact && error ? <small className="inline-action-error">{error}</small> : null}
    </span>
  );
}
