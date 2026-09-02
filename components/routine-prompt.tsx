'use client';

import { useState } from 'react';
import { Bell, Check, Clock } from 'lucide-react';

const presets = [
  { label: 'Mon, Wed, Fri', days: [1, 3, 5] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Mondays', days: [1] },
] as const;

export function RoutinePrompt({ compact = false, onSaved }: { compact?: boolean; onSaved?: () => void }) {
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [time, setTime] = useState('09:00');
  const [emails, setEmails] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/routine', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weekdays: days, preferredTime: time,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          sessionSize: 3, reminderEmailsEnabled: emails,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your routine.');
      setSaved(true);
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your routine.');
    } finally { setSaving(false); }
  }

  if (saved) return <div className="routine-saved"><Check size={18} /><div><b>Your next session is set.</b><span>Webvidence will email only when useful work is ready.</span></div></div>;

  return (
    <section className={compact ? 'routine-prompt compact' : 'routine-prompt'}>
      <div className="routine-prompt-copy"><Bell size={20} /><div><h3>Want another batch ready later this week?</h3><p>Pick a light routine. You can change it anytime.</p></div></div>
      <div className="routine-presets" aria-label="Prospecting schedule">
        {presets.map((preset) => <button key={preset.label} type="button" className={String(days) === String(preset.days) ? 'active' : ''} onClick={() => setDays([...preset.days])}>{preset.label}</button>)}
      </div>
      <div className="routine-inline-fields">
        <label><Clock size={16} /><span>Ready at</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label className="routine-email-toggle"><input type="checkbox" checked={emails} onChange={(event) => setEmails(event.target.checked)} /><span>Email me when work is ready</span></label>
      </div>
      {error ? <div className="notice notice-error">{error}</div> : null}
      <button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save my routine'}</button>
    </section>
  );
}
