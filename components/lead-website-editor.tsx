'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { websiteStatusDescription, websiteStatusLabel } from '@/lib/leads/website';

type SaveResponse = {
  error?: string;
  message?: string;
  lead?: { website?: string };
};

export function LeadWebsiteEditor({
  leadId,
  initialWebsite,
  source,
  verificationStatus,
}: {
  leadId: string;
  initialWebsite: string | null;
  source?: string | null;
  verificationStatus?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [website, setWebsite] = useState(initialWebsite || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const label = websiteStatusLabel({ website: initialWebsite, source, verificationStatus });
  const description = websiteStatusDescription({ website: initialWebsite, source, verificationStatus });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const saveResponse = await fetch('/api/leads/website', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId, website }),
      });
      const saveData = (await saveResponse.json()) as SaveResponse;
      if (!saveResponse.ok) throw new Error(saveData.error || 'The website address could not be saved.');

      const auditResponse = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const auditData = await auditResponse.json();

      if (!auditResponse.ok) {
        setMessage('Website saved.');
        setError(auditData.error || 'The fresh analysis could not be started. You can run it from this page later.');
      } else {
        setMessage(auditData.status === 'completed'
          ? 'Website saved and analyzed.'
          : 'Website saved. A fresh analysis is running now.');
      }

      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The website address could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`lead-website-correction ${initialWebsite ? 'has-linked-website' : 'missing-google-link'}`}>
      <div className="lead-website-correction-copy">
        <small>Website source</small>
        <b>{label}</b>
        {!initialWebsite || open ? <p>{description}</p> : null}
      </div>

      {!open ? (
        <button className={`btn ${initialWebsite ? '' : 'primary'}`} type="button" onClick={() => setOpen(true)}>
          {initialWebsite ? 'Correct website' : 'Add website'}
        </button>
      ) : (
        <form className="lead-website-form" onSubmit={submit}>
          <label>
            Website address
            <input
              className="input"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="example.com"
              maxLength={2048}
              required
              disabled={saving}
            />
          </label>
          <div className="lead-website-form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save and analyze'}
            </button>
            <button className="btn" type="button" onClick={() => { setOpen(false); setError(''); }} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {message ? <div className="inline-action-success" role="status">{message}</div> : null}
      {error ? <div className="inline-action-error" role="alert">{error}</div> : null}
    </section>
  );
}
