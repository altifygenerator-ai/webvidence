'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Clipboard, ExternalLink, Facebook, Globe2, Instagram, Linkedin, Mail, MapPin, MessageCircle, Phone, Sparkles, X } from 'lucide-react';
import { PASS_REASON_LABELS, PASS_REASONS, type PassReason } from '@/lib/retention/session';
import { RoutinePrompt } from '@/components/routine-prompt';

type ContactPath = { id: string; kind: string; value: string; sourceUrl: string };
type SessionItem = {
  id: string; leadId: string; position: number; status: string;
  name: string; category: string; city: string; state: string; website: string | null;
  phone: string | null; rating: number | null; reviews: number; googleMapsUrl: string | null;
  opportunityScore: number | null; opportunity: string; opportunityEvidence: string;
  activeReason: string; selectionReason: string; contactPaths: ContactPath[];
  findings: Array<{ code: string; label: string; severity: string; evidence: string }>;
};
type Draft = { id: string; subject: string | null; body: string; status: string; contact_channel: string | null; channel: string };
type SessionApproach = 'conversation' | 'website_finding';

export function ProspectSession({ sessionId, initialStatus, items, returnedFromReminder = false }: { sessionId: string; initialStatus: string; items: SessionItem[]; returnedFromReminder?: boolean }) {
  const firstPending = Math.max(0, items.findIndex((item) => !['contacted', 'passed'].includes(item.status)));
  const [currentIndex, setCurrentIndex] = useState(firstPending < 0 ? items.length : firstPending);
  const [itemStates, setItemStates] = useState(items.map((item) => item.status));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [approach, setApproach] = useState<SessionApproach>('conversation');
  const [draftOpen, setDraftOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const current = items[currentIndex];
  const done = itemStates.every((status) => ['contacted', 'passed'].includes(status));
  const contacted = itemStates.filter((status) => status === 'contacted').length;
  const passed = itemStates.filter((status) => status === 'passed').length;
  const draft = current ? drafts[current.leadId] : null;
  const currentStatus = itemStates[currentIndex];

  const bestContact = useMemo(() => current ? chooseBestContact(current) : null, [current]);

  const sessionAction = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The session could not be updated.');
    return data;
  }, [sessionId]);

  useEffect(() => {
    if (initialStatus === 'ready') void sessionAction({ action: 'start' });
  }, [initialStatus, sessionAction]);

  useEffect(() => {
    if (!returnedFromReminder) return;
    void fetch('/api/product-events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'returned_from_reminder', surface: 'session' }) });
  }, [returnedFromReminder]);

  useEffect(() => {
    if (current && currentStatus === 'ready') {
      void sessionAction({ action: 'open', itemId: current.id }).then(() => {
        setItemStates((states) => states.map((value, index) => index === currentIndex && value === 'ready' ? 'working' : value));
      }).catch((openError) => setError(openError instanceof Error ? openError.message : 'The prospect could not be opened.'));
    }
  }, [current, currentIndex, currentStatus, sessionAction]);

  async function prepareDraft(nextApproach: SessionApproach = approach) {
    if (!current) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      const channel = bestContact?.kind === 'email' || ['contact_form', 'quote_form', 'booking_form'].includes(bestContact?.kind || '') ? 'email' : bestContact?.kind === 'phone' ? 'text' : 'facebook';
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId: current.leadId, channel, intent: nextApproach }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The draft could not be prepared.');
      setDrafts((value) => ({ ...value, [current.leadId]: data.message }));
      setDraftOpen(true);
      return true;
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'The draft could not be prepared.');
      return false;
    } finally { setBusy(false); }
  }

  async function chooseApproach(nextApproach: SessionApproach) {
    if (nextApproach === approach || busy) return;
    if (!draftOpen || !draft) {
      setApproach(nextApproach);
      setError('');
      return;
    }
    const previousApproach = approach;
    setApproach(nextApproach);
    const changed = await prepareDraft(nextApproach);
    if (!changed) setApproach(previousApproach);
  }

  async function pass(reason: PassReason) {
    if (!current) return;
    setBusy(true); setError('');
    try {
      await sessionAction({ action: 'pass', itemId: current.id, reason });
      advance('passed', `Passed · ${PASS_REASON_LABELS[reason]}`);
    } catch (passError) { setError(passError instanceof Error ? passError.message : 'Could not pass this prospect.'); }
    finally { setBusy(false); }
  }

  async function markSent() {
    if (!draft || !current) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/messages/${draft.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: draft.subject, body: draft.body, status: 'sent' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record the message.');
      advance('contacted', 'Conversation recorded · follow-up scheduled');
    } catch (sentError) { setError(sentError instanceof Error ? sentError.message : 'Could not record the message.'); }
    finally { setBusy(false); setShowConfirm(false); }
  }

  function advance(status: 'contacted' | 'passed', message: string) {
    setItemStates((states) => states.map((value, index) => index === currentIndex ? status : value));
    setNotice(message);
    window.setTimeout(() => {
      setDraftOpen(false); setPassOpen(false); setAdvancedOpen(false); setShowConfirm(false); setError(''); setNotice('');
      setCurrentIndex((index) => Math.min(items.length, index + 1));
    }, 420);
  }

  async function copyAndOpen() {
    if (!draft || !current) return;
    await navigator.clipboard.writeText([draft.subject, draft.body].filter(Boolean).join('\n\n'));
    setNotice('Copied. Send it in the contact app, then come back to confirm.');
    const href = contactHref(bestContact, current, draft);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => setShowConfirm(true), 300);
  }

  if (done || currentIndex >= items.length) {
    return <SessionComplete reviewed={items.length} contacted={contacted} passed={passed} />;
  }

  return (
    <div className="session-workspace">
      <header className="session-header">
        <Link href="/dashboard" className="session-back"><ArrowLeft size={17} /> Today</Link>
        <div className="session-title"><b>Prospecting session</b><span>{currentIndex + 1} of {items.length}</span></div>
        <div className="session-dots" aria-label={`${currentIndex + 1} of ${items.length}`}>
          {items.map((item, index) => <span key={item.id} className={index === currentIndex ? 'current' : ['contacted', 'passed'].includes(itemStates[index]) ? 'complete' : ''} />)}
        </div>
      </header>

      <main className="session-main">
        <article className="prospect-decision-card">
          <div className="prospect-identity">
            <div><span className="session-kicker">Prospect {currentIndex + 1}</span><h1>{current.name}</h1><p><MapPin size={15} /> {[current.city, current.state].filter(Boolean).join(', ')}{current.category ? ` · ${current.category}` : ''}</p></div>
            <span className="activity-pill">{current.activeReason}</span>
          </div>

          <section className="selection-summary">
            <span><Sparkles size={17} /> Why Webvidence picked this</span>
            <p>{current.selectionReason}</p>
            <div className="main-opportunity"><b>{current.opportunity}</b><small>{current.opportunityEvidence}</small></div>
          </section>

          <section className="contact-paths-compact">
            <div><span>Best ways to reach them</span>{bestContact ? <small>{contactLabel(bestContact.kind)} is the strongest public path found{bestContact.kind === 'email' ? ' · confirm the address before sending' : ''}</small> : <small>Review the public listing before contacting</small>}</div>
            <div className="contact-chip-row">
              {current.contactPaths.slice(0, 5).map((path) => <a key={path.id} href={contactHref(path, current, draft)} target="_blank" rel="noreferrer" className={path.id === bestContact?.id ? 'best' : ''}>{contactIcon(path.kind)}<span>{contactLabel(path.kind)}</span>{path.id === bestContact?.id ? <em>Best</em> : null}</a>)}
              {!current.contactPaths.length && current.website ? <a href={current.website} target="_blank" rel="noreferrer"><Globe2 size={16} /><span>Website</span></a> : null}
            </div>
          </section>

          <div className="session-approach-row">
            <span>Approach</span>
            <div className="session-approach-toggle" role="group" aria-label="Outreach approach">
              <button className={approach === 'conversation' ? 'active' : ''} type="button" onClick={() => void chooseApproach('conversation')} disabled={busy} aria-pressed={approach === 'conversation'}><MessageCircle size={14} /> Conversation</button>
              <button className={approach === 'website_finding' ? 'active' : ''} type="button" onClick={() => void chooseApproach('website_finding')} disabled={busy} aria-pressed={approach === 'website_finding'}><Sparkles size={14} /> Evidence</button>
            </div>
          </div>

          {!draftOpen ? (
            <div className="session-primary-actions">
              <button className="btn primary session-contact-button" type="button" onClick={() => void prepareDraft()} disabled={busy}><MessageCircle size={18} />{busy ? 'Preparing…' : approach === 'website_finding' ? 'Use evidence' : 'Start conversation'}</button>
              <button className="btn quiet session-pass-button" type="button" onClick={() => setPassOpen((value) => !value)}><X size={17} /> Not a fit</button>
            </div>
          ) : null}

          {passOpen && !draftOpen ? <div className="pass-reasons"><span>Why are you passing?</span><div>{PASS_REASONS.map((reason) => <button key={reason} type="button" onClick={() => void pass(reason)} disabled={busy}>{PASS_REASON_LABELS[reason]}</button>)}</div></div> : null}

          {draftOpen && draft ? (
            <section className="session-draft">
              <div className="session-draft-head"><div><span>{contactLabel(bestContact?.kind || draft.contact_channel || draft.channel)} message</span><b>Ready to review</b></div><button type="button" onClick={() => setDraftOpen(false)}>Close</button></div>
              {draft.subject !== null ? <input value={draft.subject || ''} aria-label="Email subject" onChange={(event) => setDrafts((all) => ({ ...all, [current.leadId]: { ...draft, subject: event.target.value } }))} /> : null}
              <textarea value={draft.body} aria-label="Message draft" onChange={(event) => setDrafts((all) => ({ ...all, [current.leadId]: { ...draft, body: event.target.value } }))} />
              <div className="session-draft-actions"><button className="btn primary" type="button" onClick={() => void copyAndOpen()}><Clipboard size={17} /> Copy{bestContact ? ` & open ${contactLabel(bestContact.kind)}` : ''}</button><button className="btn" type="button" onClick={() => setShowConfirm(true)}>I already sent it</button></div>
              <button className="change-approach" type="button" onClick={() => setAdvancedOpen((value) => !value)}>Change contact method <ChevronDown size={15} /></button>
              {advancedOpen ? <div className="alternate-contact-row">{current.contactPaths.map((path) => <a key={path.id} href={contactHref(path, current, draft)} target="_blank" rel="noreferrer">{contactIcon(path.kind)} {contactLabel(path.kind)}</a>)}</div> : null}
            </section>
          ) : null}

          <details className="prospect-details">
            <summary>More about this business <ChevronDown size={16} /></summary>
            <div className="prospect-detail-links">
              {current.website ? <a href={current.website} target="_blank" rel="noreferrer"><Globe2 size={16} /> Open website <ExternalLink size={14} /></a> : null}
              {current.googleMapsUrl ? <a href={current.googleMapsUrl} target="_blank" rel="noreferrer"><MapPin size={16} /> Google listing <ExternalLink size={14} /></a> : null}
              <Link href={`/dashboard/leads/${current.leadId}`}>Full audit and lead record <ArrowUpRight size={14} /></Link>
            </div>
            <div className="audit-finding-list">{current.findings.slice(0, 6).map((finding) => <div key={finding.code}><span className={finding.severity}>{finding.severity}</span><div><b>{finding.label}</b><p>{finding.evidence}</p></div></div>)}</div>
          </details>
          {error ? <div className="notice notice-error">{error}</div> : null}
          {notice ? <div className="session-toast"><Check size={16} /> {notice}</div> : null}
        </article>
      </main>

      {showConfirm && draft ? <div className="send-confirm-layer"><section className="send-confirm-sheet session-confirm"><span className="confirm-icon"><Check size={22} /></span><h3>Did that message get sent?</h3><p>Confirm it once so Webvidence can schedule the right follow-up and move to the next prospect.</p><button className="btn primary" type="button" onClick={() => void markSent()} disabled={busy}>{busy ? 'Saving…' : 'Yes, it was sent'}</button><button className="btn quiet" type="button" onClick={() => setShowConfirm(false)}>Not yet</button></section></div> : null}
    </div>
  );
}

function SessionComplete({ reviewed, contacted, passed }: { reviewed: number; contacted: number; passed: number }) {
  return <div className="session-complete"><div className="completion-check"><Check size={34} /></div><span className="session-kicker">Session complete</span><h1>You’re done for today.</h1><p>You reviewed {reviewed} prospects, started {contacted} conversation{contacted === 1 ? '' : 's'}, and passed on {passed} poor fit{passed === 1 ? '' : 's'}.</p><div className="completion-stats"><div><b>{reviewed}</b><span>reviewed</span></div><div><b>{contacted}</b><span>contacted</span></div><div><b>{passed}</b><span>passed</span></div></div><RoutinePrompt compact /><div className="completion-links"><Link className="btn primary" href="/dashboard">Done for today</Link><Link href="/dashboard/leads">View pipeline</Link></div></div>;
}

function chooseBestContact(item: SessionItem) {
  const order = ['facebook', 'email', 'contact_form', 'quote_form', 'booking_form', 'instagram', 'phone', 'linkedin', 'tiktok', 'youtube'];
  return [...item.contactPaths].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] || null;
}
function contactLabel(kind: string) { return ({ email: 'Email', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', phone: 'Phone', contact_form: 'Contact form', quote_form: 'Quote form', booking_form: 'Booking form', text: 'Text' } as Record<string, string>)[kind] || 'Contact'; }
function contactIcon(kind: string) { if (kind === 'email') return <Mail size={16} />; if (kind === 'facebook') return <Facebook size={16} />; if (kind === 'instagram') return <Instagram size={16} />; if (kind === 'linkedin') return <Linkedin size={16} />; if (kind === 'phone') return <Phone size={16} />; return <Globe2 size={16} />; }
function contactHref(path: ContactPath | null, item: SessionItem, draft: Draft | null) {
  if (!path) return item.website || item.googleMapsUrl || '';
  if (path.kind === 'email') return `mailto:${path.value}${draft ? `?subject=${encodeURIComponent(draft.subject || '')}&body=${encodeURIComponent(draft.body)}` : ''}`;
  if (path.kind === 'phone') {
    const number = path.value.replace(/[^+\d]/g, '');
    return draft ? `sms:${number}?body=${encodeURIComponent(draft.body)}` : `tel:${number}`;
  }
  return path.value;
}
