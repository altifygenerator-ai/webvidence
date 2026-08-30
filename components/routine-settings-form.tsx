'use client';

import { useState } from 'react';

type Routine = {
  days_of_week?: number[];
  preferred_time?: string;
  session_size?: number;
  reminder_email_enabled?: boolean;
  weekly_routine_enabled?: boolean;
} | null;

const DAYS = [[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[0,'Sun']] as const;

export function RoutineSettingsForm({ initialRoutine, onSaved, compact = false }: { initialRoutine?: Routine; onSaved?: () => void; compact?: boolean }) {
  const [days, setDays] = useState<number[]>(initialRoutine?.days_of_week?.length ? initialRoutine.days_of_week : [1,2,3,4,5]);
  const [time, setTime] = useState(String(initialRoutine?.preferred_time || '09:00').slice(0,5));
  const [size, setSize] = useState(Number(initialRoutine?.session_size || 3));
  const [reminders, setReminders] = useState(Boolean(initialRoutine?.reminder_email_enabled));
  const [weekly, setWeekly] = useState(initialRoutine?.weekly_routine_enabled !== false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');

  function toggleDay(day: number) {
    setDays((current) => current.includes(day) ? (current.length > 1 ? current.filter((item) => item !== day) : current) : [...current, day]);
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/routine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ daysOfWeek: days, preferredTime: time, timezoneOffsetMinutes: new Date().getTimezoneOffset(), sessionSize: size, reminderEmailEnabled: reminders, weeklyRoutineEnabled: weekly }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save routine.');
      setNotice(reminders ? 'Routine saved. Email reminders are enabled for useful triggers.' : 'Routine saved. Email reminders remain off.');
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save routine.'); } finally { setBusy(false); }
  }
  return <div className={`routine-settings-form ${compact ? 'routine-settings-compact' : ''}`} id="routine">
    <div><span className="eyebrow">Prospecting routine</span><h3>{compact ? 'When should Webvidence bring you back?' : 'Set a routine you can actually keep'}</h3><p>Choose when you normally prospect and how many businesses make a useful session. Three is the default stopping point.</p></div>
    <div className="routine-presets" aria-label="Routine presets">
      <button type="button" onClick={() => { setDays([1,3,5]); setTime('09:00'); }}>Mon, Wed, Fri mornings</button>
      <button type="button" onClick={() => { setDays([1,2,3,4,5]); setTime('09:00'); }}>Weekday mornings</button>
      <button type="button" onClick={() => { setDays([1]); setTime('09:00'); }}>Mondays</button>
      <span>Or choose your own below</span>
    </div>
    <div className="routine-day-picker" aria-label="Prospecting days">{DAYS.map(([day,label]) => <button key={day} type="button" className={days.includes(day) ? 'active' : ''} aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>{label}</button>)}</div>
    <div className="routine-field-grid">
      <label><span>Preferred time</span><input className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
      <label><span>Prospects per session</span><select className="input" value={size} onChange={(event) => setSize(Number(event.target.value))}>{[1,2,3,4,5,6,8,10].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <label className="routine-check"><input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} /><span><b>Email me when useful work is ready</b><small>Scheduled sessions, due follow-ups, new watched-market prospects, weekly routine prompts, and unfinished-work rescue. No marketing blasts.</small></span></label>
    <label className="routine-check"><input type="checkbox" checked={weekly} onChange={(event) => setWeekly(event.target.checked)} /><span><b>Include the weekly routine reminder</b><small>This only sends when email reminders above are enabled.</small></span></label>
    <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save routine'}</button>
    {notice ? <div className="notice">{notice}</div> : null}{error ? <div className="notice notice-error">{error}</div> : null}
  </div>;
}
