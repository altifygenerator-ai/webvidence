'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStage } from '@/lib/onboarding';

const STEPS = ['Find', 'Review', 'Draft', 'Send', 'Repeat'];
const STEP_INDEX: Record<OnboardingStage, number> = { first_search: 0, review: 1, draft: 2, send: 3, repeat: 4, active: 5 };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SessionItem = { lead_id: string; position: number; status: string; leads?: { name?: string } | Array<{ name?: string }> | null };
type Routine = { days: number[]; preferredTime: string; sessionSize: number; remindersEnabled: boolean; areaLocation?: string | null; areaRadiusMiles?: number } | null;

type Stats = {
  reviewed: number;
  contacted: number;
  passed: number;
  followUpsCleared: number;
  repliesRecorded: number;
  sessionsCompleted: number;
};

export function TodaySession(props: {
  stage: OnboardingStage;
  activeSession: { id: string; target_size: number; items: SessionItem[] } | null;
  completedToday: boolean;
  queueCount: number;
  routine: Routine;
  stats: Stats;
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
  const showFind = props.stage === 'first_search' || props.queueCount === 0;

  async function startSession() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'today' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not prepare a session.');
      if (data.href) router.push(data.href);
      else router.push('/dashboard/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare a session.');
      setBusy(false);
    }
  }

  if (props.completedToday && !props.activeSession) {
    return (
      <section className="today-session-card today-session-complete" aria-label="Today prospecting session complete">
        <div className="today-complete-mark" aria-hidden="true">✓</div>
        <div className="today-complete-copy">
          <span className="eyebrow">Today</span>
          <h2>You&apos;re done for today.</h2>
          <p>You reached a clean stopping point. Webvidence will keep your pipeline and watched market ready for the next useful session.</p>
        </div>
        <div className="today-completion-results" aria-label="This week's progress">
          <Metric value={props.stats.reviewed} label="reviewed" />
          <Metric value={props.stats.contacted} label="contacted" />
          <Metric value={props.stats.passed} label="passed" />
          <Metric value={props.stats.sessionsCompleted} label="sessions" />
        </div>
        <div className="today-complete-footer">
          <span>{routineSummary(props.routine)}{areaSummary(props.routine) ? <> · {areaSummary(props.routine)}</> : null}</span>
          <div className="today-complete-actions">
            <button className="btn today-start-another" type="button" disabled={busy} onClick={() => void startSession()}>
              {busy ? 'Checking your market…' : 'Start another session'}
            </button>
            {!props.routine ? <Link className="btn primary" href="/dashboard/settings#routine">Set next routine</Link> : null}
            <Link className="btn quiet" href="/dashboard/leads">View pipeline</Link>
            {props.queueCount === 0 ? <Link className="btn quiet" href="/dashboard/campaigns">Find more prospects</Link> : null}
          </div>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}
      </section>
    );
  }

  const heading = props.activeSession
    ? 'Your session is in progress'
    : showFind
      ? 'Find your next prospects'
      : `${actionsReady} prospect${actionsReady === 1 ? '' : 's'} ready`;

  return (
    <section className="today-session-card" aria-label="Today prospecting session">
      <div className="today-session-head">
        <div>
          <span className="eyebrow">Today</span>
          <h2>{heading}</h2>
          <p className="today-session-subcopy">
            {props.activeSession
              ? 'Pick up exactly where you left off. Contact or pass each prospect, then stop.'
              : showFind
                ? 'Choose one market. Webvidence will turn the strongest results into a small, finishable session.'
                : `A focused batch is ready. About ${Math.max(4, actionsReady * 3)} minutes.`}
          </p>
        </div>
        {props.activeSession ? <SessionDots total={props.activeSession.target_size} worked={worked} /> : null}
      </div>

      <div className="today-session-action-row">
        {nextHref ? <Link className="btn primary today-primary-action" href={nextHref}>Continue session</Link>
          : showFind ? <Link className="btn primary today-primary-action" href="/dashboard/campaigns">Find a market</Link>
          : <button className="btn primary today-primary-action" type="button" disabled={busy} onClick={() => void startSession()}>{busy ? 'Preparing…' : 'Start session'}</button>}
        <span className="today-routine-line">{routineSummary(props.routine)}</span>
      </div>
      {areaSummary(props.routine) ? <div className="today-area-line"><span>Automatic area: {areaSummary(props.routine)}</span><Link href="/dashboard/settings#routine">Change</Link></div> : null}

      {props.stage !== 'active' ? (
        <div className="today-onboarding-compact" aria-label="Onboarding progress">
          <div className="today-onboarding-steps">
            {STEPS.map((step, index) => <span key={step} className={index < STEP_INDEX[props.stage] ? 'done' : index === STEP_INDEX[props.stage] ? 'current' : ''}><i aria-hidden="true" />{step}</span>)}
          </div>
          <p>{onboardingText(props.stage)}</p>
        </div>
      ) : null}

      <div className="today-week-strip" aria-label="This week's useful work">
        <div><span className="eyebrow">This week</span><b>Useful work</b></div>
        <Metric value={props.stats.reviewed} label="reviewed" />
        <Metric value={props.stats.contacted} label="contacted" />
        <Metric value={props.stats.passed} label="passed" />
        <Metric value={props.stats.followUpsCleared + props.stats.repliesRecorded} label="follow-ups / replies" />
        <Metric value={props.stats.sessionsCompleted} label="sessions" />
      </div>

      {props.stage === 'repeat' && !props.routine ? (
        <div className="today-repeat-nudge"><span>One last step: choose when you want the next batch ready.</span><Link href="/dashboard/settings#routine">Set routine →</Link></div>
      ) : null}
      {error ? <div className="notice notice-error">{error}</div> : null}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="today-metric"><b>{value}</b><span>{label}</span></div>;
}

function SessionDots({ total, worked }: { total: number; worked: number }) {
  return (
    <div className="today-session-dots" aria-label={`${worked} of ${total} prospects worked`}>
      <b>{worked} of {total}</b>
      <div>{Array.from({ length: total }, (_, index) => <i key={index} className={index < worked ? 'done' : index === worked ? 'current' : ''} />)}</div>
    </div>
  );
}

function routineSummary(routine: Routine) {
  if (!routine) return 'No routine set yet';
  const days = routine.days.map((day) => DAY_LABELS[day]).join(', ');
  return `${days || 'Selected days'} · ${String(routine.preferredTime || '09:00').slice(0, 5)}${routine.remindersEnabled ? ' · reminders on' : ''}`;
}

function areaSummary(routine: Routine) {
  if (!routine?.areaLocation) return '';
  const location = routine.areaLocation.split(',').slice(0, 2).join(',').trim() || routine.areaLocation;
  return `${location} · ${Number(routine.areaRadiusMiles || 25)} mi`;
}

function onboardingText(stage: OnboardingStage) {
  if (stage === 'first_search') return 'Start with one market. The first good prospect will open directly into the workflow.';
  if (stage === 'review') return 'Work the recommended prospect. A review only counts when you actually open or act on it.';
  if (stage === 'draft') return 'Start one real conversation. Conversation-first is already selected for you.';
  if (stage === 'send') return 'Send manually, then confirm it once so Webvidence can keep the next step accurate.';
  if (stage === 'repeat') return 'Choose when you want to return so this becomes a routine instead of a one-off search.';
  return '';
}
