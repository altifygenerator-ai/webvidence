'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStage } from '@/lib/onboarding';

const STEPS = ['Find', 'Review', 'Draft', 'Send', 'Repeat'];
const STEP_INDEX: Record<OnboardingStage, number> = { first_search: 0, review: 1, draft: 2, send: 3, repeat: 4, active: 5 };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SessionItem = { lead_id: string; position: number; status: string; leads?: { name?: string } | Array<{ name?: string }> | null };
type Routine = { days: number[]; preferredTime: string; sessionSize: number; remindersEnabled: boolean } | null;

export function TodaySession(props: {
  stage: OnboardingStage;
  activeSession: { id: string; target_size: number; items: SessionItem[] } | null;
  completedToday: boolean;
  queueCount: number;
  routine: Routine;
  stats: { reviewed: number; contacted: number; passed: number; followUpsCleared: number; repliesRecorded: number; sessionsCompleted: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeItems = props.activeSession?.items || [];
  const worked = activeItems.filter((item) => !['pending', 'working'].includes(item.status)).length;
  const next = activeItems.find((item) => ['pending', 'working'].includes(item.status));
  const nextHref = props.activeSession && next ? `/dashboard/leads/${next.lead_id}?session=${props.activeSession.id}#outreach` : null;
  const sessionSize = props.routine?.sessionSize || 3;
  const actionsReady = Math.min(props.queueCount, sessionSize);

  async function startSession() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'today' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not prepare a session.');
      if (data.href) router.push(data.href);
      else router.push('/dashboard/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare a session.');
      setBusy(false);
    }
  }

  const showFind = props.stage === 'first_search' || props.queueCount === 0;
  const heading = props.activeSession
    ? 'Finish your current session'
    : props.completedToday
      ? 'Session complete'
      : showFind
        ? 'Find your next prospects'
        : `${actionsReady} action${actionsReady === 1 ? '' : 's'} ready`;

  return (
    <section className="today-session-card" aria-label="Today prospecting session">
      <div className="today-session-head">
        <div><span className="eyebrow">Today</span><h2>{heading}</h2></div>
        {props.activeSession ? <span className="tag">{worked} of {props.activeSession.target_size} worked</span>
          : props.completedToday ? <span className="tag">Good stopping point</span>
          : showFind ? <span className="tag">Queue empty</span>
          : <span className="tag">About {Math.max(4, actionsReady * 3)} minutes</span>}
      </div>

      {props.stage !== 'active' ? (
        <div className="today-onboarding" aria-label="Onboarding progress">
          <small>Find → Review → Draft → Send → Repeat</small>
          <div>{STEPS.map((step, index) => <span key={step} className={index < STEP_INDEX[props.stage] ? 'done' : index === STEP_INDEX[props.stage] ? 'current' : ''}>{step}</span>)}</div>
          <p>{onboardingText(props.stage)}</p>
        </div>
      ) : null}

      <div className="today-session-cta">
        {nextHref ? <Link className="btn primary" href={nextHref}>Continue session</Link>
          : props.completedToday ? <><span>You finished a meaningful batch. Stop here and come back for the next prepared session.</span>{!props.routine ? <Link className="btn" href="/dashboard/settings#routine">Set next routine</Link> : null}</>
          : showFind ? <Link className="btn primary" href="/dashboard/campaigns">Find prospects</Link>
          : <button className="btn primary" type="button" disabled={busy} onClick={() => void startSession()}>{busy ? 'Preparing…' : 'Start session'}</button>}
        {!props.activeSession && props.queueCount > 0 && !showFind && !props.completedToday ? <span>Work {actionsReady} prospect{actionsReady === 1 ? '' : 's'} one at a time. Contact or pass both count, then the session stops.</span> : null}
        {props.stage === 'repeat' && !props.routine && !props.completedToday ? <Link className="btn" href="/dashboard/settings#routine">Set when you will return</Link> : null}
      </div>

      <div className="today-weekly-head">
        <div><span className="eyebrow">This week</span><b>Useful work, not message volume</b></div>
        <small>{routineSummary(props.routine)}</small>
      </div>
      <div className="today-stat-grid">
        <div><b>{props.stats.reviewed}</b><span>reviewed</span></div>
        <div><b>{props.stats.contacted}</b><span>contacted</span></div>
        <div><b>{props.stats.passed}</b><span>passed</span></div>
        <div><b>{props.stats.followUpsCleared}</b><span>follow-ups cleared</span></div>
        <div><b>{props.stats.repliesRecorded}</b><span>replies recorded</span></div>
        <div><b>{props.stats.sessionsCompleted}</b><span>sessions completed</span></div>
      </div>
      <p className="weekly-consistency-note"><b>Weekly consistency:</b> {props.stats.sessionsCompleted ? `${props.stats.sessionsCompleted} session${props.stats.sessionsCompleted === 1 ? '' : 's'} completed this week.` : 'No completed session yet this week.'} Finishing a planned session a day late still counts as useful weekly progress.</p>

      {error ? <div className="notice notice-error">{error}</div> : null}
    </section>
  );
}

function routineSummary(routine: Routine) {
  if (!routine) return 'No routine set yet. Finish onboarding by choosing when you want to return.';
  const days = routine.days.map((day) => DAY_LABELS[day]).join(', ');
  return `${days || 'Selected days'} · ${String(routine.preferredTime || '09:00').slice(0, 5)} · ${routine.sessionSize} per session${routine.remindersEnabled ? ' · email reminders on' : ' · email reminders off'}`;
}

function onboardingText(stage: OnboardingStage) {
  if (stage === 'first_search') return 'Run one focused search. Webvidence will prepare the first prospect instead of leaving you with a list to sort.';
  if (stage === 'review') return 'Open the recommended prospect. A review only counts when you actually work the prospect, not when an audit finishes automatically.';
  if (stage === 'draft') return 'Conversation-first is the default. Prepare one useful draft before worrying about deeper settings.';
  if (stage === 'send') return 'Send manually through the real contact path, then confirm it so follow-ups stay accurate.';
  if (stage === 'repeat') return 'Choose when you will prospect again. The repeat step is what turns one successful send into a routine.';
  return '';
}
