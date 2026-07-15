'use client';

import { useMemo, useState } from 'react';

type Channel = 'email' | 'facebook' | 'text' | 'follow_up';

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
  initialStatus: string;
  initialNotes: string;
  initialFollowUpAt: string;
  initialMessages: Message[];
};

const channels: Array<{ id: Channel; label: string; note: string }> = [
  { id: 'facebook', label: 'Facebook opener', note: 'Short and conversational' },
  { id: 'email', label: 'Cold email', note: 'Subject plus a brief body' },
  { id: 'text', label: 'Text message', note: 'Use only when the number is appropriate for business contact' },
  { id: 'follow_up', label: 'Follow-up', note: 'Built from the latest saved message' },
];

export function OutreachComposer({ leadId, initialStatus, initialNotes, initialFollowUpAt, initialMessages }: Props) {
  const [channel, setChannel] = useState<Channel>('facebook');
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState(initialMessages[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);

  const selected = useMemo(() => messages.find((item) => item.id === selectedId) || messages[0] || null, [messages, selectedId]);

  async function generate() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId, channel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate outreach.');
      const message = data.message as Message;
      setMessages((current) => [message, ...current]);
      setSelectedId(message.id);
      setNotice('Draft generated from the latest verified audit findings. Review it before sending.');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Could not generate outreach.');
    } finally {
      setLoading(false);
    }
  }

  async function updateMessage(patch: Partial<Message>) {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/messages/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save message.');
      setMessages((current) => current.map((item) => item.id === selected.id ? { ...item, ...data.message } : item));
      setNotice(patch.status === 'sent' ? 'Marked as sent and saved to the lead history.' : 'Draft saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save message.');
    } finally {
      setSaving(false);
    }
  }

  async function saveLead() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const nextFollowUpAt = followUpAt ? new Date(followUpAt).toISOString() : null;
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, notes, nextFollowUpAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update lead.');
      setNotice('Pipeline status and notes saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update lead.');
    } finally {
      setSaving(false);
    }
  }

  async function copyMessage() {
    if (!selected) return;
    const content = [selected.subject, selected.body].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(content);
    setNotice('Copied to clipboard.');
  }

  return (
    <div className="outreach-layout">
      <section className="outreach-panel">
        <div className="panel-heading">
          <div><div className="eyebrow">Evidence-backed outreach</div><h3>Create the first message</h3></div>
          <span className="tag">manual approval</span>
        </div>
        <div className="channel-grid">
          {channels.map((item) => (
            <button className={channel === item.id ? 'channel-option active' : 'channel-option'} key={item.id} type="button" onClick={() => setChannel(item.id)}>
              <b>{item.label}</b><small>{item.note}</small>
            </button>
          ))}
        </div>
        <button className="btn primary generate-button" type="button" onClick={generate} disabled={loading}>
          {loading ? <><span className="mini-spinner" /> Building grounded draft…</> : 'Generate from verified findings'}
        </button>
        <small className="muted">Webvidence never sends automatically. You review, edit, copy, and decide when the business is contacted.</small>
      </section>

      <section className="outreach-panel draft-panel">
        <div className="panel-heading">
          <div><div className="eyebrow">Draft desk</div><h3>{selected ? `${selected.channel.replaceAll('_', ' ')} draft` : 'No draft yet'}</h3></div>
          {selected ? <span className="tag">{selected.status}</span> : null}
        </div>
        {selected ? (
          <>
            {selected.subject !== null ? (
              <label><span>Email subject</span><input className="input" value={selected.subject || ''} onChange={(event) => setMessages((current) => current.map((item) => item.id === selected.id ? { ...item, subject: event.target.value } : item))} /></label>
            ) : null}
            <label><span>Message</span><textarea className="input outreach-textarea" value={selected.body} onChange={(event) => setMessages((current) => current.map((item) => item.id === selected.id ? { ...item, body: event.target.value } : item))} /></label>
            <div className="draft-actions">
              <button className="btn" type="button" onClick={() => void updateMessage({ subject: selected.subject, body: selected.body })} disabled={saving}>Save edits</button>
              <button className="btn" type="button" onClick={copyMessage}>Copy message</button>
              <button className="btn primary" type="button" onClick={() => void updateMessage({ subject: selected.subject, body: selected.body, status: 'sent' })} disabled={saving}>Mark sent</button>
            </div>
            {messages.length > 1 ? (
              <label><span>Saved drafts and history</span><select className="input" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{messages.map((message) => <option value={message.id} key={message.id}>{new Date(message.created_at).toLocaleDateString()} · {message.channel} · {message.status}</option>)}</select></label>
            ) : null}
          </>
        ) : <div className="empty-draft">Choose a channel and generate a message. The draft will be saved to this lead automatically.</div>}
      </section>

      <section className="outreach-panel pipeline-panel">
        <div className="panel-heading"><div><div className="eyebrow">Next action</div><h3>Work the lead</h3></div></div>
        <label><span>Pipeline status</span><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          {['new','reviewing','ready_to_contact','contacted','replied','interested','follow_up','quote_sent','won','lost','not_interested','do_not_contact','archived'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select></label>
        <label><span>Follow-up date</span><input className="input" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label>
        <label><span>Private notes</span><textarea className="input" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What they said, what to offer, when to follow up…" /></label>
        <button className="btn primary" type="button" onClick={saveLead} disabled={saving}>{saving ? 'Saving…' : 'Save lead activity'}</button>
      </section>

      {error ? <div className="notice notice-error outreach-notice">{error}</div> : null}
      {notice ? <div className="notice outreach-notice">{notice}</div> : null}
    </div>
  );
}
