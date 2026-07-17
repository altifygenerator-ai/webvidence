'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LeadAnalysisButton } from '@/components/lead-analysis-button';

type Lead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  reviews: number | null;
  last_audited_at?: string | null;
};

export function LeadsTable({ leads, archived }: { leads: Lead[]; archived: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const allSelected = leads.length > 0 && selected.length === leads.length;

  async function bulk(action: 'archive' | 'restore' | 'delete' | 'do_not_contact') {
    if (!selected.length) return;
    if (action === 'delete' && !window.confirm(`Permanently delete ${selected.length} archived lead${selected.length === 1 ? '' : 's'} and all related audits and messages? This cannot be undone.`)) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selected, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the selected leads.');
      setMessage(`${data.updated} lead${data.updated === 1 ? '' : 's'} updated.`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the selected leads.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="bulk-lead-bar">
        <label className="bulk-select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? leads.map((lead) => lead.id) : [])}
          />
          Select all shown
        </label>
        <span>{selected.length} selected</span>
        {!archived ? (
          <>
            <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk('archive')}>Archive selected</button>
            <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk('do_not_contact')}>Mark do not contact</button>
          </>
        ) : (
          <>
            <button className="btn" type="button" disabled={!selected.length || working} onClick={() => void bulk('restore')}>Restore selected</button>
            <button className="btn danger-button" type="button" disabled={!selected.length || working} onClick={() => void bulk('delete')}>Delete permanently</button>
          </>
        )}
      </div>
      {message ? <div className={`notice ${/could not|only archived/i.test(message) ? 'notice-error' : ''}`}>{message}</div> : null}
      <div className="table leads-table">
        <div className="row head bulk-row">
          <span />
          <span>Business</span>
          <span>Status</span>
          <span>Score</span>
          <span>Next step</span>
        </div>
        {leads.map((lead) => (
          <div className="row bulk-row" key={lead.id}>
            <span><input type="checkbox" aria-label={`Select ${lead.name}`} checked={selected.includes(lead.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))} /></span>
            <span>
              <b>{lead.name}</b><br />
              <small className="muted">{[lead.city, lead.state].filter(Boolean).join(', ') || 'Location unavailable'} · {lead.reviews || 0} reviews</small>
            </span>
            <span>{String(lead.status || 'new').replaceAll('_', ' ')}</span>
            <span><b>{lead.opportunity_score ?? '—'}</b></span>
            <span className="lead-row-actions">
              {!archived ? <LeadAnalysisButton leadId={lead.id} hasAudit={Boolean(lead.last_audited_at)} compact /> : null}
              <Link className="btn" href={`/dashboard/leads/${lead.id}`}>Open file</Link>
              {lead.website ? <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Site</a> : null}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
