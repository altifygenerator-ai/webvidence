'use client';

import { FormEvent, useMemo, useState } from 'react';

type ApplicationForm = {
  name: string;
  email: string;
  website: string;
  services: string;
  prospects: string;
  currentOutreach: string;
  biggestProblem: string;
};

const initialForm: ApplicationForm = {
  name: '',
  email: '',
  website: '',
  services: '',
  prospects: '',
  currentOutreach: '',
  biggestProblem: '',
};

export function ConversationFirstApplication({ supportEmail }: { supportEmail: string }) {
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [opened, setOpened] = useState(false);

  const isReady = useMemo(
    () => Boolean(form.name.trim() && form.email.trim() && form.services.trim() && form.biggestProblem.trim()),
    [form],
  );

  function update<K extends keyof ApplicationForm>(key: K, value: ApplicationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReady) return;

    const subject = encodeURIComponent('Conversation-first outreach beta application');
    const body = encodeURIComponent(
      [
        'Conversation-first outreach beta application',
        '',
        `Name: ${form.name.trim()}`,
        `Email: ${form.email.trim()}`,
        `Website or portfolio: ${form.website.trim() || 'Not provided'}`,
        '',
        'What I sell:',
        form.services.trim(),
        '',
        'Businesses I want to contact:',
        form.prospects.trim() || 'Not provided',
        '',
        'What I currently send:',
        form.currentOutreach.trim() || 'Not provided',
        '',
        'Biggest outreach problem:',
        form.biggestProblem.trim(),
      ].join('\n'),
    );

    setOpened(true);
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <form className="conversation-application-form" onSubmit={submit}>
      <div className="conversation-form-grid">
        <label>
          <span>Your name *</span>
          <input
            required
            autoComplete="name"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Jake Smith"
          />
        </label>
        <label>
          <span>Email *</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="wide">
          <span>Website or portfolio</span>
          <input
            type="url"
            inputMode="url"
            value={form.website}
            onChange={(event) => update('website', event.target.value)}
            placeholder="https://"
          />
        </label>
        <label className="wide">
          <span>What services are you trying to sell? *</span>
          <textarea
            required
            rows={3}
            value={form.services}
            onChange={(event) => update('services', event.target.value)}
            placeholder="Small business websites, redesigns, SEO cleanup, maintenance..."
          />
        </label>
        <label className="wide">
          <span>What kinds of businesses are you trying to reach?</span>
          <textarea
            rows={3}
            value={form.prospects}
            onChange={(event) => update('prospects', event.target.value)}
            placeholder="Roofers around Little Rock, cabin owners, local contractors..."
          />
        </label>
        <label className="wide">
          <span>What are you sending now?</span>
          <textarea
            rows={4}
            value={form.currentOutreach}
            onChange={(event) => update('currentOutreach', event.target.value)}
            placeholder="Paste an opener, follow-up, or the rough approach you use now."
          />
        </label>
        <label className="wide">
          <span>Where does outreach keep breaking down? *</span>
          <textarea
            required
            rows={4}
            value={form.biggestProblem}
            onChange={(event) => update('biggestProblem', event.target.value)}
            placeholder="People do not answer, I pitch too early, I do not know who is worth contacting..."
          />
        </label>
      </div>

      <button className="conversation-apply-button" type="submit" disabled={!isReady}>
        <span>Open application email</span>
        <b>↗</b>
      </button>
      <p className="conversation-form-note">
        Nothing is submitted automatically. Your email app opens with these answers filled in so you can review everything before sending.
      </p>
      {opened ? (
        <p className="conversation-form-fallback">
          Email app did not open? Send the same details to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>
      ) : null}
    </form>
  );
}
