'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { COUNTRIES } from '@/lib/countries';
import { isCountryOnlyLocation, validateBusinessCategory } from '@/lib/search/validation';
import {
  getPlainLeadReason,
  getTopContactRecommendations,
  isRecommendationPending,
  type ContactRecommendation,
} from '@/lib/leads/recommendation';

type Finding = {
  code: string;
  label: string;
  severity: 'high' | 'medium' | 'low' | 'positive';
  evidence: string;
};

type Audit = {
  id?: string;
  score: number;
  findings: Finding[];
  status: string;
  performanceScore: number | null;
  accessibilityScore: number | null;
  seoScore: number | null;
  pagesCrawled?: number;
};

type Lead = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  state: string;
  website: string | null;
  phone: string | null;
  reviews: number;
  rating: number | null;
  googleMapsUrl: string | null;
  distanceMiles: number | null;
  opportunityScore: number | null;
  status?: string;
  audit: Audit | null;
  auditStatus?: 'queued' | 'running' | 'completed' | 'failed' | 'limit_reached';
  auditJobId?: string | null;
  auditError?: string | null;
};


type Campaign = {
  id: string;
  name: string;
  category: string;
  location: string;
  radius_miles: number;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
};


type UsageSummary = {
  plan: string;
  usage: { search: number; audit: number; message: number };
  limits: { search: number; audit: number; message: number };
};

type MomentumSummary = {
  sentToday: number;
  sentThisWeek: number;
};

type SearchResponse = {
  mode?: 'demo' | 'live';
  count?: number;
  warning?: string;
  auditWarning?: string | null;
  error?: string;
  leads?: Lead[];
  center?: { formattedAddress?: string };
  auditJobIds?: string[];
};

export default function Campaigns() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchGuidance, setSearchGuidance] = useState('');
  const [mode, setMode] = useState<'demo' | 'live' | ''>('');
  const [auditingId, setAuditingId] = useState('');
  const pendingLeadIds = leads.filter((lead) => lead.auditStatus === 'queued' || lead.auditStatus === 'running').map((lead) => lead.id);
  const pendingKey = pendingLeadIds.join(',');
  const [loadingStage, setLoadingStage] = useState('Locating the market…');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignManagerOpen, setCampaignManagerOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('webvidence:active-campaigns-panel') === 'open';
  });
  const [campaignLoading, setCampaignLoading] = useState('');
  const [openingCampaignId, setOpeningCampaignId] = useState('');
  const [openedCampaign, setOpenedCampaign] = useState<Campaign | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [momentum, setMomentum] = useState<MomentumSummary>({ sentToday: 0, sentThisWeek: 0 });
  const [dailyTarget, setDailyTarget] = useState(() => {
    if (typeof window === 'undefined') return 5;
    const saved = Number(window.sessionStorage.getItem('webvidence:daily-outreach-target') || 5);
    return Number.isFinite(saved) ? Math.max(5, saved) : 5;
  });

  function toggleCampaignManager() {
    setCampaignManagerOpen((current) => {
      const next = !current;
      window.sessionStorage.setItem('webvidence:active-campaigns-panel', next ? 'open' : 'closed');
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    const offset = new Date().getTimezoneOffset();
    void Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/usage'),
      fetch(`/api/outreach-momentum?tzOffset=${offset}`, { cache: 'no-store' }),
    ])
      .then(async ([campaignResponse, usageResponse, momentumResponse]) => {
        const campaignData = await campaignResponse.json();
        const usageData = await usageResponse.json();
        const momentumData = await momentumResponse.json();
        if (!campaignResponse.ok) throw new Error(campaignData.error || 'Could not load campaigns.');
        if (!usageResponse.ok) throw new Error(usageData.error || 'Could not load usage.');
        if (active) {
          setCampaigns(campaignData.campaigns || []);
          setUsage(usageData);
          if (momentumResponse.ok) {
            const sentToday = Number(momentumData.sentToday || 0);
            setMomentum({ sentToday, sentThisWeek: Number(momentumData.sentThisWeek || 0) });
            setDailyTarget((current) => Math.max(current, Math.ceil(Math.max(1, sentToday) / 5) * 5));
          }
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);


  useEffect(() => {
    const currentLeadIds = pendingKey.split(',').filter(Boolean);
    if (!currentLeadIds.length) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/audit-jobs?leadIds=${encodeURIComponent(currentLeadIds.join(','))}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || cancelled) return;
        setLeads((current) => current.map((lead) => {
          const item = data.items?.find((candidate: { leadId: string }) => candidate.leadId === lead.id);
          if (!item) return lead;
          if (item.status === 'completed' && item.audit) {
            return {
              ...lead,
              audit: item.audit,
              opportunityScore: item.audit.score,
              auditStatus: 'completed',
              auditError: null,
            };
          }
          return {
            ...lead,
            auditStatus: item.status,
            auditError: item.error || null,
          };
        }));
        const usageResponse = await fetch('/api/usage', { cache: 'no-store' });
        if (usageResponse.ok) setUsage(await usageResponse.json());
      } catch {
        // Polling resumes on the next interval.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pendingKey]);

  async function refreshUsage() {
    const response = await fetch('/api/usage', { cache: 'no-store' });
    if (response.ok) setUsage(await response.json());
  }

  async function refreshMomentum() {
    const offset = new Date().getTimezoneOffset();
    const response = await fetch(`/api/outreach-momentum?tzOffset=${offset}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const sentToday = Number(data.sentToday || 0);
    setMomentum({ sentToday, sentThisWeek: Number(data.sentThisWeek || 0) });
    setDailyTarget((current) => Math.max(current, Math.ceil(Math.max(1, sentToday) / 5) * 5));
  }

  function addThreeMore() {
    setDailyTarget((current) => {
      const next = Math.max(current, momentum.sentToday) + 3;
      window.sessionStorage.setItem('webvidence:daily-outreach-target', String(next));
      return next;
    });
  }

  async function openCampaign(campaign: Campaign) {
    setOpeningCampaignId(campaign.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/campaigns?campaignId=${encodeURIComponent(campaign.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not reopen that campaign.');
      setLeads(data.leads || []);
      setOpenedCampaign(data.campaign || campaign);
      setMode('live');
      setNotice(`${data.count || 0} saved prospect${data.count === 1 ? '' : 's'} loaded from ${campaign.category} in ${campaign.location}. Reopening a campaign does not use a search credit.`);
      window.setTimeout(() => document.getElementById('campaign-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (campaignError) {
      setError(campaignError instanceof Error ? campaignError.message : 'Could not reopen that campaign.');
    } finally {
      setOpeningCampaignId('');
    }
  }

  async function updateCampaign(campaignId: string, status: 'active' | 'paused' | 'archived') {
    setCampaignLoading(campaignId);
    setError('');
    try {
      const response = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaignId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update campaign.');
      setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? data.campaign : campaign));
      setNotice(status === 'archived' ? 'Campaign archived. That active campaign slot is available again.' : `Campaign marked ${status}.`);
    } catch (campaignError) {
      setError(campaignError instanceof Error ? campaignError.message : 'Could not update campaign.');
    } finally {
      setCampaignLoading('');
    }
  }

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const categoryCheck = validateBusinessCategory(String(formData.get('category') || ''));
    const city = String(formData.get('city') || '').trim();
    if (!categoryCheck.valid) {
      setSearchGuidance(categoryCheck.message || 'Enter one kind of local business.');
      return;
    }
    if (!city || isCountryOnlyLocation(city)) {
      setSearchGuidance('Enter a city or postal code, not only a country.');
      return;
    }
    setSearchGuidance('');
    setLoading(true);
    setLoadingStage('Locating the market…');
    setError('');
    setNotice('');
    setLeads([]);
    setOpenedCampaign(null);
    const stages = [
      'Searching several parts of the market…',
      'Collecting websites and business details…',
      'Saving prospects to your workspace…',
      'Queuing selected websites for analysis…',
      'Preparing the results…',
    ];
    let stageIndex = 0;
    const progressTimer = window.setInterval(() => {
      setLoadingStage(stages[Math.min(stageIndex, stages.length - 1)]);
      stageIndex += 1;
    }, 1800);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      const json = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(json.error || 'Search failed.');
      setLeads(json.leads || []);
      setMode(json.mode || '');
      setNotice(json.warning || json.auditWarning || `${json.count || 0} businesses found near ${json.center?.formattedAddress || 'that location'}.`);
      const campaignResponse = await fetch('/api/campaigns');
      if (campaignResponse.ok) { const campaignJson = await campaignResponse.json(); setCampaigns(campaignJson.campaigns || []); }
      await Promise.all([refreshUsage(), refreshMomentum()]);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Search failed.');
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  }

  async function analyze(leadId: string) {
    setAuditingId(leadId);
    setError('');
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Analysis failed.');
      setLeads((current) => current.map((lead) => {
        if (lead.id !== leadId) return lead;
        if (json.status === 'completed' && json.audit) {
          return { ...lead, audit: json.audit, opportunityScore: json.audit.score, auditStatus: 'completed', auditError: null };
        }
        return { ...lead, auditStatus: 'queued', auditJobId: json.jobId || null, auditError: null };
      }));
      setNotice(json.message || 'Analysis started in the background.');
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : 'Analysis failed.');
    } finally {
      await Promise.all([refreshUsage(), refreshMomentum()]);
      setAuditingId('');
    }
  }

  const activeCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status !== 'archived'),
    [campaigns],
  );
  const activeCampaignCount = activeCampaigns.filter((campaign) => campaign.status === 'active').length;
  const pausedCampaignCount = activeCampaigns.filter((campaign) => campaign.status === 'paused').length;
  const campaignSummary = [
    `${activeCampaigns.length} saved market${activeCampaigns.length === 1 ? '' : 's'}`,
    activeCampaignCount ? `${activeCampaignCount} active` : '',
    pausedCampaignCount ? `${pausedCampaignCount} paused` : '',
  ].filter(Boolean).join(' · ');

  const recommendations = useMemo(
    () => getTopContactRecommendations(leads, 3),
    [leads],
  );
  const recommendationIds = new Set(recommendations.map((item) => item.lead.id));
  const pendingRecommendationChecks = leads.filter(isRecommendationPending).length;
  const targetComplete = momentum.sentToday >= dailyTarget;
  const remainingInTarget = Math.max(0, dailyTarget - momentum.sentToday);

  return (
    <AppShell>
      <div className="topline">
        <div>
          <div className="eyebrow">Live prospect search</div>
          <h2>Find businesses worth reviewing</h2>
        </div>
        {mode && <span className={`tag ${mode === 'live' ? 'tag-live' : 'tag-demo'}`}>{mode} data</span>}
      </div>


      {activeCampaigns.length ? (
        <section className="campaign-manager" aria-label="Active campaigns">
          <button
            className="campaign-manager-head campaign-manager-toggle"
            type="button"
            aria-expanded={campaignManagerOpen}
            aria-controls="active-campaigns-content"
            onClick={toggleCampaignManager}
          >
            <span className="campaign-manager-heading">
              <span className="eyebrow">Saved markets</span>
              <strong>Active campaigns</strong>
              <small>{campaignSummary}</small>
            </span>
            <span className="campaign-manager-summary-end">
              <b>{activeCampaigns.length > 99 ? '99+' : activeCampaigns.length}</b>
              <i aria-hidden="true">{campaignManagerOpen ? '−' : '+'}</i>
            </span>
          </button>
          {campaignManagerOpen ? (
            <div className="campaign-manager-content" id="active-campaigns-content">
              <div className="campaign-manager-list">
                {activeCampaigns.map((campaign) => (
                  <article key={campaign.id}>
                    <div><b>{campaign.category}</b><span>{campaign.location} · {campaign.radius_miles} miles</span></div>
                    <span className="tag">{campaign.status}</span>
                    <div className="campaign-actions">
                      <button className="btn" type="button" onClick={() => void openCampaign(campaign)} disabled={openingCampaignId === campaign.id}>{openingCampaignId === campaign.id ? 'Opening…' : 'Open results'}</button>
                      <button className="btn" type="button" onClick={() => void updateCampaign(campaign.id, campaign.status === 'paused' ? 'active' : 'paused')} disabled={campaignLoading === campaign.id}>{campaign.status === 'paused' ? 'Resume' : 'Pause'}</button>
                      <button className="btn" type="button" onClick={() => void updateCampaign(campaign.id, 'archived')} disabled={campaignLoading === campaign.id}>{campaignLoading === campaign.id ? 'Saving…' : 'Archive'}</button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="campaign-manager-footnote">Archive a market when you want to free an active campaign slot.</div>
            </div>
          ) : null}
        </section>
      ) : null}

      {usage ? (
        <div className="search-usage-bar" aria-label="Current plan usage">
          <span><b>{usage.usage.search}</b> of <b>{usage.limits.search}</b> searches used this month</span>
          <span><b>{usage.usage.audit}</b> of <b>{usage.limits.audit}</b> analyses used</span>
          <span className="tag">{usage.plan} plan</span>
        </div>
      ) : null}

      {usage?.usage.search === 0 ? (
        <div className="search-first-tip">
          <b>Good first search</b>
          <span>Use one business type, one city, and start with 3 analyses.</span>
        </div>
      ) : null}

      <form className="search-form" onSubmit={run}>
        <div className="search-basics">
          <label>
            <span>Business type</span>
            <input className="input" name="category" placeholder="Roofers" required aria-describedby="business-type-guidance" onChange={(event) => { const result = validateBusinessCategory(event.target.value); setSearchGuidance(result.valid ? '' : result.message || ''); }} />
          </label>
          <label>
            <span>Location</span>
            <input className="input" name="city" placeholder="Little Rock or 72201" autoComplete="address-level2" aria-label="City or postal code" required />
          </label>
          <button className="btn primary search-submit" disabled={loading}>
            {loading ? <><span className="mini-spinner" /> Processing search…</> : 'Find businesses'}
          </button>
        </div>
        <details className="search-options-disclosure">
          <summary>Search options <small>50 miles · mixed results · analyze 3</small></summary>
          <div className="search-options-grid">
            <label>
              <span>State / province</span>
              <input className="input" name="region" placeholder="Arkansas" autoComplete="address-level1" />
            </label>
            <label>
              <span>Country</span>
              <select className="input" name="countryCode" defaultValue="US" autoComplete="country" required>
                {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </select>
            </label>
            <label>
              <span>Radius</span>
              <select className="input" name="radiusMiles" defaultValue="50">
                <option value="25">25 miles</option>
                <option value="50">50 miles</option>
                <option value="75">75 miles</option>
                <option value="100">100 miles</option>
              </select>
            </label>
            <label>
              <span>Result mix</span>
              <select className="input" name="resultMode" defaultValue="mixed" title="Choose how Webvidence builds the result set">
                <option value="mixed">Mixed opportunities</option>
                <option value="hidden">Hidden opportunities</option>
                <option value="best_match">Best Google matches</option>
                <option value="closest">Closest first</option>
              </select>
            </label>
            <label>
              <span>Businesses</span>
              <select className="input" name="maxResults" defaultValue="10">
                <option value="10">Up to 10</option>
                <option value="20" disabled={usage?.plan === 'free'}>Up to 20</option>
                <option value="30" disabled={usage?.plan === 'free'}>Up to 30</option>
                <option value="40" disabled={usage?.plan === 'free'}>Up to 40</option>
              </select>
            </label>
            <label>
              <span>Analyze now</span>
              <select className="input" name="auditCount" defaultValue="3">
                <option value="0">Find only</option>
                <option value="3">Start with 3</option>
                <option value="5">Start with 5</option>
                <option value="10">First 10</option>
              </select>
            </label>
          </div>
        </details>
      </form>

      {searchGuidance ? (
        <div className="search-guidance" id="business-type-guidance" role="alert">
          {searchGuidance}
        </div>
      ) : null}

      <details className="search-help-disclosure">
        <summary>How the result mixes work</summary>
        <p>
          Mixed search checks several parts of the radius instead of only returning Google’s first batch. Hidden opportunities leans toward smaller listings, fewer reviews, and businesses without a website. Previous campaign results stay saved and are skipped when enough new matches are available.
        </p>
      </details>

      {loading && <div className="search-progress" role="status" aria-live="polite"><span className="search-spinner"/><div><b>{loadingStage}</b><small>The business search should finish quickly. Website analyses continue in the background.</small></div></div>}
      {error && <div className="notice notice-error"><b>Could not finish.</b><br/>{error}<small className="error-help">Check the location spelling, Google API restrictions, plan usage, and server terminal for details.</small></div>}
      {notice && <div className="notice">{notice}</div>}

      {!loading && !error && mode && leads.length === 0 ? <div className="notice">{openedCampaign ? 'No active prospects remain in this campaign. Archived leads are still available from the pipeline archive.' : 'No matching businesses were returned inside that radius. Try a broader category, a larger radius, or a nearby city.'}</div> : null}

      {leads.length > 0 && (
        <section className="section results-section" id="campaign-results">
          <div className="results-heading">
            <div>
              <div className="eyebrow">Search results</div>
              <h3>{leads.length} {openedCampaign ? 'saved businesses' : 'businesses collected'}</h3>
            </div>
            <small>{openedCampaign ? `Loaded from ${openedCampaign.category} in ${openedCampaign.location}. No search credit was used.` : 'Webvidence highlights businesses worth reviewing, but you still decide who is worth contacting.'}</small>
          </div>

          <section className="start-here-block" aria-label="Businesses to review first">
            <div className="start-here-head">
              <div>
                <div className="eyebrow">Start here</div>
                <h4>{recommendations.length ? 'Best places to review first' : pendingRecommendationChecks ? 'Finding the best places to review first…' : 'No clear recommendation yet'}</h4>
                <p className="start-here-support">Based on the available business details, contact options, website evidence, and your previous activity.</p>
              </div>
              <div className="outreach-progress-compact">
                <b>{momentum.sentToday} of {dailyTarget}</b>
                <span>contacted today</span>
              </div>
            </div>
            <div className="outreach-progress-track" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (momentum.sentToday / Math.max(1, dailyTarget)) * 100)}%` }} />
            </div>

            {recommendations.length ? (
              <>
                <div className="recommended-desktop-list">
                  {recommendations.map((item, index) => (
                    <RecommendationRow
                      key={item.lead.id}
                      item={item}
                      index={index}
                      nextLeadIds={recommendations.slice(index + 1).map((candidate) => candidate.lead.id)}
                    />
                  ))}
                </div>
                <div className="recommended-mobile-list">
                  <RecommendationRow
                    item={recommendations[0]}
                    index={0}
                    nextLeadIds={recommendations.slice(1).map((candidate) => candidate.lead.id)}
                  />
                  {recommendations.length > 1 ? (
                    <details>
                      <summary>{recommendations.length - 1} more recommended lead{recommendations.length === 2 ? '' : 's'}</summary>
                      <div>
                        {recommendations.slice(1).map((item, index) => (
                          <RecommendationRow
                            key={item.lead.id}
                            item={item}
                            index={index + 1}
                            nextLeadIds={recommendations.slice(index + 2).map((candidate) => candidate.lead.id)}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="recommendation-empty">
                {pendingRecommendationChecks
                  ? `${pendingRecommendationChecks} website check${pendingRecommendationChecks === 1 ? ' is' : 's are'} still running. A recommendation will appear as soon as there is enough evidence.`
                  : 'The current results need a little more review before Webvidence can confidently put one first.'}
              </div>
            )}

            {targetComplete ? (
              <div className="batch-complete-row">
                <span><b>Good stopping point.</b> You contacted {momentum.sentToday} business{momentum.sentToday === 1 ? '' : 'es'} today.</span>
                <button className="btn" type="button" onClick={addThreeMore}>Add 3 more</button>
              </div>
            ) : (
              <small className="batch-helper">{remainingInTarget} left in this batch. Stop whenever the work is no longer useful.</small>
            )}
          </section>

          <div className="all-results-heading">
            <h4>All results</h4>
            <span>{recommendationIds.size} recommended first</span>
          </div>

          <div className="prospect-list">
            {leads.map((lead, index) => {
              const contacted = isContactedLead(lead.status);
              const manualReview = Boolean(lead.audit?.findings.some((finding) => ['automated_check_blocked', 'website_unreachable', 'unsafe_or_invalid_url'].includes(finding.code)));
              const plainReason = manualReview
                ? 'The automated check could not finish, so this one needs a quick manual look.'
                : getPlainLeadReason(lead);
              const nextLeadIds = recommendations.filter((item) => item.lead.id !== lead.id).map((item) => item.lead.id);
              return (
              <article className={`prospect-card ${contacted ? 'prospect-contacted' : ''} ${recommendationIds.has(lead.id) ? 'prospect-recommended' : ''}`} key={lead.id}>
                <div className="prospect-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="prospect-main">
                  <div className="prospect-titleline">
                    <div>
                      <small>{lead.category || 'Local business'} · {lead.distanceMiles ?? '?'} miles</small>
                      {contacted ? <span className="contacted-badge">{formatLeadStatus(lead.status)}</span> : null}
                      {recommendationIds.has(lead.id) && !contacted ? <span className="recommended-badge">Recommended</span> : null}
                      <h3>{lead.name}</h3>
                      <p>{lead.address || [lead.city, lead.state].filter(Boolean).join(', ')}</p>
                    </div>
                    <div className={`prospect-score ${lead.opportunityScore === null ? 'pending' : ''}`}>
                      <strong>{lead.opportunityScore ?? '—'}</strong>
                      <span>evidence score</span>
                    </div>
                  </div>

                  <div className="prospect-facts">
                    <span><b>{lead.rating ?? '—'}</b> rating</span>
                    <span><b>{lead.reviews}</b> reviews</span>
                    <span><b>{lead.phone || 'Not listed'}</b> phone</span>
                    <span className={lead.website ? '' : 'fact-alert'}><b>{lead.website ? 'Website found' : 'No website'}</b></span>
                    {manualReview ? <span className="fact-review"><b>Manual review needed</b></span> : null}
                  </div>

                  {lead.audit ? (
                    <>
                      <div className="prospect-plain-summary">
                        <b>What stood out</b>
                        <span>{plainReason}</span>
                      </div>
                      <details className="prospect-details">
                        <summary>View full findings and scores</summary>
                        <div className="finding-list">
                          {lead.audit.findings.slice(0, 5).map((finding) => (
                            <div className={`finding-chip severity-${finding.severity}`} key={`${lead.id}-${finding.code}`}>
                              <span>{finding.severity}</span>
                              <b>{finding.label}</b>
                              <small>{finding.evidence}</small>
                            </div>
                          ))}
                          <div className="score-strip">
                            <span>Performance <b>{lead.audit.performanceScore ?? '—'}</b></span>
                            <span>Accessibility <b>{lead.audit.accessibilityScore ?? '—'}</b></span>
                            <span>SEO <b>{lead.audit.seoScore ?? '—'}</b></span>
                            <span>Pages <b>{lead.audit.pagesCrawled ?? '—'}</b></span>
                          </div>
                        </div>
                      </details>
                    </>
                  ) : (
                    <div className={`unanalyzed-note ${lead.auditStatus === 'failed' ? 'audit-failed-note' : ''}`}>
                      {lead.auditStatus === 'queued' || lead.auditStatus === 'running'
                        ? <><span className="mini-spinner" /> Website analysis is running in the background.</>
                        : lead.auditStatus === 'failed'
                          ? `Analysis did not finish: ${lead.auditError || 'The site could not be processed.'}`
                          : 'Not analyzed yet. The business record is real and saved to your pipeline.'}
                    </div>
                  )}

                  <div className="prospect-actions">
                    {lead.audit ? (
                      <Link className="btn primary outreach-link" href={buildLeadHref(lead.id, nextLeadIds)}>{contacted ? 'Open contacted lead' : manualReview ? 'Review manually' : 'Review and draft'}</Link>
                    ) : (
                      <button className="btn primary" onClick={() => analyze(lead.id)} disabled={auditingId === lead.id || lead.auditStatus === 'queued' || lead.auditStatus === 'running'}>
                        {auditingId === lead.id || lead.auditStatus === 'queued' || lead.auditStatus === 'running'
                          ? 'Analysis running…'
                          : lead.auditStatus === 'failed'
                            ? 'Retry analysis'
                            : 'Analyze website'}
                      </button>
                    )}
                    {lead.website && <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Open website</a>}
                    {lead.googleMapsUrl && <a className="btn" href={lead.googleMapsUrl} target="_blank" rel="noreferrer">Google listing</a>}
                    {!lead.audit ? <Link className="btn outreach-link" href={buildLeadHref(lead.id, nextLeadIds)}>Open lead file</Link> : null}
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function RecommendationRow({
  item,
  index,
  nextLeadIds,
}: {
  item: ContactRecommendation<Lead>;
  index: number;
  nextLeadIds: string[];
}) {
  return (
    <article className="recommendation-row">
      <span className="recommendation-number">{index + 1}</span>
      <div>
        <b>{item.lead.name}</b>
        <p>{item.reason}</p>
        {item.signals.length ? <small>{item.signals.slice(0, 2).join(' · ')}</small> : null}
      </div>
      <Link className="btn primary" href={buildLeadHref(item.lead.id, nextLeadIds)} onClick={() => void recordRecommendedOpen(item.lead.id)}>
        Review business
      </Link>
    </article>
  );
}

async function recordRecommendedOpen(leadId: string) {
  try {
    await fetch('/api/product-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'recommended_prospect_opened', leadId, surface: 'campaign_results' }),
      keepalive: true,
    });
  } catch {
    // Recommendation tracking must never block navigation.
  }
}

function buildLeadHref(leadId: string, nextLeadIds: string[]) {
  const params = new URLSearchParams({ source: 'search' });
  if (nextLeadIds.length) params.set('queue', nextLeadIds.join(','));
  return `/dashboard/leads/${leadId}?${params.toString()}#outreach`;
}

function isContactedLead(status: string | undefined) {
  return ['contacted', 'replied', 'interested', 'follow_up', 'quote_sent', 'won', 'lost', 'not_interested', 'do_not_contact'].includes(status || '');
}

function formatLeadStatus(status: string | undefined) {
  return String(status || 'contacted').replaceAll('_', ' ');
}
