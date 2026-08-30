'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REASONS = [
  ['strong_existing_site', 'Strong existing site'],
  ['wrong_business_type', 'Wrong type of business'],
  ['no_contact_path', 'No usable contact path'],
  ['business_inactive', 'Business appears inactive'],
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
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/sessions/work', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: props.sessionId, leadId: props.leadId, action: 'start' }),
    }).catch(() => undefined);
  }, [props.sessionId, props.leadId]);

  async function passLead() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/sessions/work', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: props.sessionId, leadId: props.leadId, action: 'passed', passReason: reason || null }),
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
      setBusy(false);
    }
  }

  return (
    <section className="lead-session-bar" aria-label="Prospecting session progress">
      <div className="lead-session-progress">
        <span className="eyebrow">Prospecting session</span>
        <b>Prospect {Math.min(props.position, props.targetSize)} of {props.targetSize}</b>
        <small>{props.workedCount} already worked · contacted or legitimately passed both count</small>
      </div>
      <div className="lead-session-actions">
        {!passing ? (
          <button className="btn" type="button" onClick={() => setPassing(true)}>Not a fit</button>
        ) : (
          <div className="pass-control">
            <select className="input" aria-label="Optional pass reason" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">Reason optional</option>
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="btn primary" type="button" disabled={busy} onClick={() => void passLead()}>{busy ? 'Moving on…' : 'Pass & next'}</button>
            <button className="btn quiet" type="button" disabled={busy} onClick={() => setPassing(false)}>Cancel</button>
          </div>
        )}
      </div>
      {error ? <div className="notice notice-error">{error}</div> : null}
    </section>
  );
}
