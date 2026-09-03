'use client';

import { useState } from 'react';

type Routine = {
  days_of_week?: number[];
  preferred_time?: string;
  session_size?: number;
  reminder_email_enabled?: boolean;
  weekly_routine_enabled?: boolean;
  prospecting_area_location?: string | null;
  prospecting_area_radius_miles?: number | null;
} | null;

const DAYS = [[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[0,'Sun']] as const;
const AREA_RADII = [10, 15, 25, 50, 75, 100] as const;

export function RoutineSettingsForm({ initialRoutine, onSaved, compact = false }: { initialRoutine?: Routine; onSaved?: () => void; compact?: boolean }) {
  const [days, setDays] = useState<number[]>(initialRoutine?.days_of_week?.length ? initialRoutine.days_of_week : [1,2,3,4,5]);
  const [time, setTime] = useState(String(initialRoutine?.preferred_time || '09:00').slice(0,5));
  const [size, setSize] = useState(Number(initialRoutine?.session_size || 3));
  const [reminders, setReminders] = useState(Boolean(initialRoutine?.reminder_email_enabled));
  const [weekly, setWeekly] = useState(initialRoutine?.weekly_routine_enabled !== false);
  const [area, setArea] = useState(initialRoutine?.prospecting_area_location || '');
  const [areaRadius, setAreaRadius] = useState(Number(initialRoutine?.prospecting_area_radius_miles || 25));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  function toggleDay(day: number) {
    setDays((current) => current.includes(day) ? (current.length > 1 ? current.filter((item) => item !== day) : current) : [...current, day]);
  }

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = {
        daysOfWeek: days,
        preferredTime: time,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        sessionSize: size,
        reminderEmailEnabled: reminders,
        weeklyRoutineEnabled: weekly,
      };
      if (!compact) {
        body.prospectingArea = area;
        body.prospectingRadiusMiles = areaRadius;
      }
      const response = await fetch('/api/routine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save routine.');
      if (!compact && data.routine?.prospecting_area_location) {
        setArea(data.routine.prospecting_area_location);
        setAreaRadius(Number(data.routine.prospecting_area_radius_miles || areaRadius));
      }
      const areaMessage = !compact && area.trim()
        ? ` Automatic sessions will stay inside ${data.routine?.prospecting_area_location || area.trim()} (${Number(data.routine?.prospecting_area_radius_miles || areaRadius)} mi).`
        : '';
      setNotice(`${reminders ? 'Routine saved. Email reminders are enabled for useful triggers.' : 'Routine saved. Email reminders remain off.'}${areaMessage}`);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save routine.');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return <div className="routine-settings-form routine-settings-compact" id="routine">
      <div className="routine-compact-intro">
        <span className="eyebrow">Keep the rhythm</span>
        <h3>Want another batch ready later this week?</h3>
        <p>Pick a simple rhythm. Sessions stay at three prospects by default and you can fine-tune everything later in Settings.</p>
      </div>
      <div className="routine-presets routine-compact-presets" aria-label="Routine presets">
        <button type="button" className={days.join(',') === '1,3,5' ? 'active' : ''} onClick={() => { setDays([1,3,5]); setTime('09:00'); }}>Mon / Wed / Fri</button>
        <button type="button" className={days.join(',') === '1,2,3,4,5' ? 'active' : ''} onClick={() => { setDays([1,2,3,4,5]); setTime('09:00'); }}>Weekdays</button>
        <button type="button" className={days.join(',') === '1' ? 'active' : ''} onClick={() => { setDays([1]); setTime('09:00'); }}>Mondays</button>
      </div>
      <details className="routine-customize">
        <summary>Choose different days or time</summary>
        <div className="routine-customize-body">
          <div className="routine-day-picker" aria-label="Prospecting days">{DAYS.map(([day,label]) => <button key={day} type="button" className={days.includes(day) ? 'active' : ''} aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>{label}</button>)}</div>
          <label className="routine-compact-time"><span>Preferred time</span><input className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        </div>
      </details>
      <label className="routine-check routine-compact-reminder"><input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} /><span><b>Email me when useful work is ready</b><small>Only useful prospecting and follow-up reminders. No marketing blasts.</small></span></label>
      <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save next routine'}</button>
      {notice ? <div className="notice">{notice}</div> : null}{error ? <div className="notice notice-error">{error}</div> : null}
    </div>;
  }

  return <div className="routine-settings-form" id="routine">
    <div><span className="eyebrow">Prospecting routine</span><h3>Set a routine you can actually keep</h3><p>Choose where automatic work should come from, when you normally prospect, and how many businesses make a useful session. Manual searches can still use any location.</p></div>

    <section className="prospecting-area-settings" aria-labelledby="prospecting-area-title">
      <div className="prospecting-area-copy">
        <span className="eyebrow">Automatic prospecting area</span>
        <h4 id="prospecting-area-title">Keep prepared sessions close to the market you actually work</h4>
        <p>Set a city or postal code once. Today sessions and watched-market refreshes will only use businesses inside this radius. Leave it blank to keep the current anywhere-in-your-workspace behavior.</p>
      </div>
      <div className="prospecting-area-fields">
        <label><span>Market area</span><input className="input" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Hot Springs, Arkansas" autoComplete="address-level2" /></label>
        <label><span>Radius</span><select className="input" value={areaRadius} onChange={(event) => setAreaRadius(Number(event.target.value))}>{AREA_RADII.map((value) => <option key={value} value={value}>{value} miles</option>)}</select></label>
      </div>
      <small>Webvidence geocodes this location when you save it. It does not guess addresses or change locations you explicitly search for on the Find screen.</small>
    </section>

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
