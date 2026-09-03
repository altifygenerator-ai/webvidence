'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REASONS = [
  ['strong_existing_site', 'Strong site'],
  ['wrong_business_type', 'Wrong business'],
  ['no_contact_path', 'No contact path'],
  ['business_inactive', 'Looks inactive'],
  ['not_enough_opportunity', 'Not enough opportunity'],
  ['other', 'Other'],
] as const;

export function LeadSessionBar(props: {
  sessionId: string;
  leadId: string;
  position: number;
  targetSize: number;
  workedCount: number;
  nextLeadHref: string | null;
}) {
  const router = useRouter();
  const [passing, setPassing] = useState(false);
  const [busyReason, setBusyReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/sessions/work', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: props.sessionId, leadId: props.leadId, action: 'start' }),
    }).catch(() => undefined);
  }, [props.sessionId, props.leadId]);

  async function passLead(reason: string | null) {
    setBusyReason(reason || 'skip');
    setError('');
    try {
      const response = await fetch('/api/sessions/work', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: props.sessionId, leadId: props.leadId, action: 'passed', passReason: reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not pass this prospect.');
      if (data.completed) router.push('/dashboard?session=complete');
      else if (data.nextLeadId) router.push(`/dashboard/leads/${data.nextLeadId}?session=${props.sessionId}#outreach`);
      else if (props.nextLeadHref) router.push(props.nextLeadHref);
      else router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pass this prospect.');
      setBusyReason('');
    }
  }

  return (
    <section className="lead-session-bar session-focus-bar" aria-label="Prospecting session progress">
      <div className="lead-session-progress">
        <span className="eyebrow">Prospecting session</span>
        <div className="session-progress-line">
          <b>Prospect {Math.min(props.position, props.targetSize)} of {props.targetSize}</b>
          <div className="session-dot-row" aria-hidden="true">
            {Array.from({ length: props.targetSize }, (_, index) => <i key={index} className={index < props.workedCount ? 'done' : index === props.position - 1 ? 'current' : ''} />)}
          </div>
        </div>
      </div>
      <div className="lead-session-actions">
        {!passing ? (
          <button className="btn quiet session-pass-toggle" type="button" onClick={() => setPassing(true)}>Not a fit</button>
        ) : (
          <div className="pass-reason-panel" aria-label="Optional reason for passing">
            <div className="pass-reason-head"><span>Why are you passing?</span><button type="button" onClick={() => setPassing(false)} aria-label="Close pass reasons">×</button></div>
            <div className="pass-reason-chips">
              {REASONS.map(([value, label]) => <button key={value} type="button" disabled={Boolean(busyReason)} onClick={() => void passLead(value)}>{busyReason === value ? 'Passing…' : label}</button>)}
              <button type="button" className="pass-skip" disabled={Boolean(busyReason)} onClick={() => void passLead(null)}>{busyReason === 'skip' ? 'Passing…' : 'Skip reason'}</button>
            </div>
          </div>
        )}
      </div>
      {error ? <div className="notice notice-error session-bar-error">{error}</div> : null}
    </section>
  );
}
