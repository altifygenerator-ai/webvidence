'use client';

import { FormEvent, useMemo, useState } from 'react';

type FeedbackFormProps = {
  defaultEmail?: string;
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const featureOptions = [
  ['business_search', 'Finding businesses'],
  ['online_presence', 'Reviewing online presence'],
  ['website_audits', 'Website audits'],
  ['best_places', 'Best places to start'],
  ['outreach_drafts', 'Drafting outreach'],
  ['channel_openers', 'Opening messages in text or email'],
  ['follow_up_tracking', 'Follow-up tracking'],
  ['pipeline', 'Pipeline'],
  ['outreach_profile', 'Outreach profile settings'],
] as const;

const replyOptions = [
  ['normal_conversation', 'Normal conversation'],
  ['more_information', 'Asked for more information'],
  ['interested', 'Interested in services'],
  ['call_or_meeting', 'Call or meeting'],
  ['pricing', 'Requested pricing'],
  ['not_interested', 'Not interested'],
  ['other', 'Other'],
] as const;

function checked(form: FormData, name: string) {
  return form.get(name) === 'on';
}

export function FeedbackForm({ defaultEmail = '' }: FeedbackFormProps) {
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [contactedCount, setContactedCount] = useState('none');
  const [outcome, setOutcome] = useState('not_yet');
  const [permissionLevel, setPermissionLevel] = useState('private');
  const [rating, setRating] = useState('');

  const hasContacted = contactedCount !== 'none';
  const canChoosePublicUses = permissionLevel !== 'private';
  const ratingLabel = useMemo(() => rating ? `${rating}/10` : 'Choose a rating', [rating]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState('submitting');
    setMessage('');

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      businessName: form.get('businessName'),
      website: form.get('website'),
      usageFrequency: form.get('usageFrequency'),
      featuresUsed: form.getAll('featuresUsed'),
      previousWorkflow: form.get('previousWorkflow'),
      easeImpact: form.get('easeImpact'),
      timeSavingDetail: form.get('timeSavingDetail'),
      contactedCount: form.get('contactedCount'),
      noContactReason: hasContacted ? '' : form.get('noContactReason'),
      repliesCount: hasContacted ? form.get('repliesCount') : 'not_applicable',
      replyTypes: hasContacted ? form.getAll('replyTypes') : [],
      outcome: hasContacted ? form.get('outcome') : 'not_yet',
      projectRange: hasContacted && outcome === 'paid_project' ? form.get('projectRange') : 'not_applicable',
      workflowMostHelpful: form.get('workflowMostHelpful'),
      roughOrConfusing: form.get('roughOrConfusing'),
      wouldUseMore: form.get('wouldUseMore'),
      usefulnessRating: form.get('usefulnessRating'),
      testimonialText: form.get('testimonialText'),
      additionalMessage: form.get('additionalMessage'),
      permissionLevel: form.get('permissionLevel'),
      allowWrittenQuote: canChoosePublicUses && checked(form, 'allowWrittenQuote'),
      allowOutcomeDetails: canChoosePublicUses && checked(form, 'allowOutcomeDetails'),
      allowBusinessIdentity: canChoosePublicUses && checked(form, 'allowBusinessIdentity'),
      allowLightEditing: canChoosePublicUses && checked(form, 'allowLightEditing'),
      allowAnonymousStats: canChoosePublicUses && checked(form, 'allowAnonymousStats'),
      complimentaryAccess: checked(form, 'complimentaryAccess'),
      contactPage: form.get('contactPage'),
    };

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The feedback could not be submitted.');
      setSubmitState('success');
      formElement.reset();
      setContactedCount('none');
      setOutcome('not_yet');
      setPermissionLevel('private');
      setRating('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : 'The feedback could not be submitted.');
    }
  }

  if (submitState === 'success') {
    return (
      <div className="feedback-success" role="status">
        <span>Received</span>
        <h2>Thank you for the straight feedback.</h2>
        <p>Your response was saved. Nothing will be used publicly outside the permission you selected.</p>
        <button className="feedback-secondary-button" type="button" onClick={() => setSubmitState('idle')}>Send another response</button>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <div className="feedback-honeypot" aria-hidden="true">
        <label>Contact page<input name="contactPage" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <section className="feedback-section">
        <div className="feedback-section-number">01</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>About you</p>
            <h2>A little context</h2>
          </div>
          <div className="feedback-fields two-column">
            <label className="feedback-field"><span>Name <small>optional</small></span><input name="name" autoComplete="name" maxLength={120} /></label>
            <label className="feedback-field"><span>Email</span><input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} maxLength={254} required /></label>
            <label className="feedback-field"><span>Business or studio <small>optional</small></span><input name="businessName" autoComplete="organization" maxLength={160} /></label>
            <label className="feedback-field"><span>Website <small>optional</small></span><input name="website" inputMode="url" placeholder="yourstudio.com" maxLength={240} /></label>
          </div>
        </div>
      </section>

      <section className="feedback-section">
        <div className="feedback-section-number">02</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>How you use it</p>
            <h2>Your current workflow</h2>
          </div>
          <div className="feedback-fields">
            <label className="feedback-field"><span>How often have you used Webvidence?</span><select name="usageFrequency" defaultValue="" required><option value="" disabled>Select one</option><option value="once">Just once</option><option value="few_times">A few times</option><option value="weekly">About once a week</option><option value="several_weekly">Several times a week</option><option value="most_workdays">Most workdays</option></select></label>

            <fieldset className="feedback-fieldset">
              <legend>Which parts have you used?</legend>
              <div className="feedback-choice-grid">
                {featureOptions.map(([value, text]) => <label className="feedback-check" key={value}><input type="checkbox" name="featuresUsed" value={value} /><span>{text}</span></label>)}
              </div>
            </fieldset>

            <label className="feedback-field"><span>Before Webvidence, how were you handling prospecting?</span><textarea name="previousWorkflow" rows={4} maxLength={1800} placeholder="Google Maps, spreadsheets, Facebook groups, checking sites one at a time, another tool, etc." /></label>

            <label className="feedback-field"><span>Has Webvidence made the process quicker or easier?</span><select name="easeImpact" defaultValue="" required><option value="" disabled>Select one</option><option value="a_lot">A lot</option><option value="somewhat">Somewhat</option><option value="not_really">Not really</option><option value="harder">It has made it harder</option><option value="too_early">Too early to tell</option></select></label>

            <label className="feedback-field"><span>What part has saved you the most time?</span><textarea name="timeSavingDetail" rows={3} maxLength={1800} /></label>
          </div>
        </div>
      </section>

      <section className="feedback-section">
        <div className="feedback-section-number">03</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>Real outcomes</p>
            <h2>What happened after the search?</h2>
          </div>
          <div className="feedback-fields">
            <label className="feedback-field"><span>How many businesses found through Webvidence have you contacted?</span><select name="contactedCount" value={contactedCount} onChange={(event) => setContactedCount(event.target.value)} required><option value="none">Not yet</option><option value="one_to_five">1–5</option><option value="six_to_fifteen">6–15</option><option value="sixteen_to_thirty">16–30</option><option value="over_thirty">More than 30</option></select></label>

            {!hasContacted ? (
              <label className="feedback-field feedback-conditional"><span>What has stopped you from contacting one?</span><select name="noContactReason" defaultValue=""><option value="">Select one or write more below</option><option>Still reviewing leads</option><option>Messages do not feel right yet</option><option>Not sure who to contact first</option><option>Contact information was missing</option><option>I have not had time</option><option>The businesses did not look useful</option><option>Something in the app was confusing</option><option>Other</option></select></label>
            ) : (
              <div className="feedback-conditional feedback-fields">
                <label className="feedback-field"><span>Have any of those businesses responded?</span><select name="repliesCount" defaultValue="none"><option value="none">No responses yet</option><option value="one">One response</option><option value="a_few">A few responses</option><option value="several">Several responses</option><option value="not_checked">I have not checked yet</option></select></label>
                <fieldset className="feedback-fieldset">
                  <legend>What kinds of responses have you received?</legend>
                  <div className="feedback-choice-grid">
                    {replyOptions.map(([value, text]) => <label className="feedback-check" key={value}><input type="checkbox" name="replyTypes" value={value} /><span>{text}</span></label>)}
                  </div>
                </fieldset>
                <label className="feedback-field"><span>Has it led to any real work or next step?</span><select name="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="not_yet">Not yet</option><option value="promising_conversation">A promising conversation</option><option value="call_or_meeting">A call or meeting</option><option value="quote_or_proposal">A quote or proposal</option><option value="paid_project">A paid project</option><option value="referral">A referral</option><option value="prefer_not">Prefer not to say</option></select></label>
                {outcome === 'paid_project' ? <label className="feedback-field feedback-conditional"><span>Optional project-value range</span><select name="projectRange" defaultValue="prefer_not"><option value="under_250">Under $250</option><option value="250_500">$250–$500</option><option value="500_1000">$500–$1,000</option><option value="1000_2500">$1,000–$2,500</option><option value="over_2500">More than $2,500</option><option value="prefer_not">Prefer not to say</option></select></label> : null}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="feedback-section">
        <div className="feedback-section-number">04</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>What is useful</p>
            <h2>Tell me where it helps and where it does not</h2>
          </div>
          <div className="feedback-fields">
            <label className="feedback-field"><span>What has helped your workflow the most?</span><textarea name="workflowMostHelpful" rows={4} maxLength={2200} placeholder="Finding businesses faster, deciding who to contact, drafting messages, keeping up with follow-ups, etc." /></label>
            <label className="feedback-field"><span>What still feels rough, confusing, or unnecessary?</span><textarea name="roughOrConfusing" rows={4} maxLength={2200} /></label>
            <label className="feedback-field"><span>What would make you use Webvidence more regularly?</span><textarea name="wouldUseMore" rows={4} maxLength={2200} /></label>
            <label className="feedback-field feedback-range"><span>Overall, how useful has Webvidence been? <b>{ratingLabel}</b></span><input type="range" name="usefulnessRating" min="1" max="10" step="1" value={rating} onChange={(event) => setRating(event.target.value)} required /><div><small>1 · Not useful yet</small><small>10 · Part of my normal workflow</small></div></label>
          </div>
        </div>
      </section>

      <section className="feedback-section feedback-quote-section">
        <div className="feedback-section-number">05</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>In your own words</p>
            <h2>What would you tell another freelancer?</h2>
          </div>
          <div className="feedback-fields">
            <label className="feedback-field"><span>Your message about Webvidence <small>optional</small></span><textarea name="testimonialText" rows={6} maxLength={3000} placeholder="What has it helped with, how does it fit into your workflow, and who do you think it would be useful for?" /></label>
            <label className="feedback-field"><span>Anything else you want me to know?</span><textarea name="additionalMessage" rows={4} maxLength={3000} /></label>
          </div>
        </div>
      </section>

      <section className="feedback-section feedback-permission-section">
        <div className="feedback-section-number">06</div>
        <div className="feedback-section-body">
          <div className="feedback-section-heading">
            <p>Your permission</p>
            <h2>You control what can be shared</h2>
            <span>Feedback is used privately for product improvement by default. Public use only follows the permission selected here.</span>
          </div>
          <div className="feedback-fields">
            <label className="feedback-field"><span>Can Webvidence use any of this feedback publicly?</span><select name="permissionLevel" value={permissionLevel} onChange={(event) => setPermissionLevel(event.target.value)}><option value="private">Keep everything private</option><option value="anonymous">You may quote me anonymously</option><option value="first_name">You may use my first name</option><option value="name_business">You may use my name and business</option><option value="contact_first">Contact me before using anything publicly</option></select></label>

            {canChoosePublicUses ? (
              <fieldset className="feedback-fieldset feedback-permission-options">
                <legend>What specifically may be used?</legend>
                <div className="feedback-choice-stack">
                  <label className="feedback-check"><input type="checkbox" name="allowWrittenQuote" /><span>My written message or another quote from this response</span></label>
                  <label className="feedback-check"><input type="checkbox" name="allowOutcomeDetails" /><span>Results I reported, such as replies, calls, proposals, referrals, or paid work</span></label>
                  {permissionLevel === 'name_business' || permissionLevel === 'contact_first' ? <label className="feedback-check"><input type="checkbox" name="allowBusinessIdentity" /><span>My business name and website</span></label> : null}
                  <label className="feedback-check"><input type="checkbox" name="allowLightEditing" /><span>Lightly shorten my wording for length without changing what I meant</span></label>
                  <label className="feedback-check"><input type="checkbox" name="allowAnonymousStats" /><span>Include my answers in anonymous combined statistics</span></label>
                </div>
              </fieldset>
            ) : null}

            <label className="feedback-check feedback-disclosure"><input type="checkbox" name="complimentaryAccess" /><span>I received free or complimentary Webvidence access as a tester.</span></label>
            <p className="feedback-permission-note">Giving public-use permission is optional and does not affect your account. You can ask Webvidence to stop using your feedback in future marketing by contacting support.</p>
          </div>
        </div>
      </section>

      {submitState === 'error' ? <div className="feedback-error" role="alert">{message}</div> : null}
      <div className="feedback-submit-row">
        <p>Submitting saves this response so it can be reviewed. Honest criticism is welcome.</p>
        <button className="feedback-submit" type="submit" disabled={submitState === 'submitting' || !rating}>{submitState === 'submitting' ? 'Sending…' : 'Submit feedback'}<b>↗</b></button>
      </div>
    </form>
  );
}
