'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { COUNTRIES } from '@/lib/countries';

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
  status: 'active' | 'paused' | 'archived';
};


type UsageSummary = {
  plan: string;
  usage: { search: number; audit: number; message: number };
  limits: { search: number; audit: number; message: number };
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
  const [mode, setMode] = useState<'demo' | 'live' | ''>('');
  const [auditingId, setAuditingId] = useState('');
  const pendingLeadIds = leads.filter((lead) => lead.auditStatus === 'queued' || lead.auditStatus === 'running').map((lead) => lead.id);
  const pendingKey = pendingLeadIds.join(',');
  const [loadingStage, setLoadingStage] = useState('Locating the market…');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignLoading, setCampaignLoading] = useState('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([fetch('/api/campaigns'), fetch('/api/usage')])
      .then(async ([campaignResponse, usageResponse]) => {
        const campaignData = await campaignResponse.json();
        const usageData = await usageResponse.json();
        if (!campaignResponse.ok) throw new Error(campaignData.error || 'Could not load campaigns.');
        if (!usageResponse.ok) throw new Error(usageData.error || 'Could not load usage.');
        if (active) {
          setCampaigns(campaignData.campaigns || []);
          setUsage(usageData);
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
          if (item.audit) {
            return {
              ...lead,
              audit: item.audit,
              opportunityScore: item.audit.score,
              auditStatus: item.status === 'failed' ? 'failed' : 'completed',
              auditError: item.error || null,
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
    setLoading(true);
    setLoadingStage('Locating the market…');
    setError('');
    setNotice('');
    setLeads([]);
    const stages = [
      'Searching Google for active businesses…',
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
      const formData = new FormData(event.currentTarget);
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
      await refreshUsage();
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
      await refreshUsage();
      setAuditingId('');
    }
  }

  return (
    <AppShell>
      <div className="topline">
        <div>
          <div className="eyebrow">Live prospect search</div>
          <h2>Find website opportunities</h2>
        </div>
        {mode && <span className={`tag ${mode === 'live' ? 'tag-live' : 'tag-demo'}`}>{mode} data</span>}
      </div>


      {campaigns.some((campaign) => campaign.status !== 'archived') ? (
        <section className="campaign-manager">
          <div className="campaign-manager-head"><div><div className="eyebrow">Saved markets</div><h3>Active campaigns</h3></div><small>Archive a market when you want to free an active campaign slot.</small></div>
          <div className="campaign-manager-list">
            {campaigns.filter((campaign) => campaign.status !== 'archived').map((campaign) => (
              <article key={campaign.id}>
                <div><b>{campaign.category}</b><span>{campaign.location} · {campaign.radius_miles} miles</span></div>
                <span className="tag">{campaign.status}</span>
                <div className="campaign-actions">
                  <button className="btn" type="button" onClick={() => void updateCampaign(campaign.id, campaign.status === 'paused' ? 'active' : 'paused')} disabled={campaignLoading === campaign.id}>{campaign.status === 'paused' ? 'Resume' : 'Pause'}</button>
                  <button className="btn" type="button" onClick={() => void updateCampaign(campaign.id, 'archived')} disabled={campaignLoading === campaign.id}>{campaignLoading === campaign.id ? 'Saving…' : 'Archive'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {usage ? (
        <div className="search-usage-bar" aria-label="Current plan usage">
          <span><b>{usage.usage.search}</b> of <b>{usage.limits.search}</b> searches used this month</span>
          <span><b>{usage.usage.audit}</b> of <b>{usage.limits.audit}</b> analyses used</span>
          <span className="tag">{usage.plan} plan</span>
        </div>
      ) : null}

      <form className="search-form" onSubmit={run}>
        <label>
          <span>Business type</span>
          <input className="input" name="category" placeholder="Roofers, plumbers, cabin rentals…" required />
        </label>
        <fieldset className="location-field-group">
          <legend>Market location</legend>
          <div className="location-fields">
            <input className="input" name="city" placeholder="City or postal code" autoComplete="address-level2" aria-label="City or postal code" required />
            <input className="input" name="region" placeholder="State / province" autoComplete="address-level1" aria-label="State or province" />
            <select className="input" name="countryCode" defaultValue="US" autoComplete="country" aria-label="Country" required>
              {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
          </div>
        </fieldset>
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
          <select className="input" name="auditCount" defaultValue="5">
            <option value="0">Find only</option>
            <option value="3">First 3</option>
            <option value="5">First 5</option>
            <option value="10">First 10</option>
          </select>
        </label>
        <button className="btn primary search-submit" disabled={loading}>
          {loading ? <><span className="mini-spinner" /> Processing search…</> : 'Run live search'}
        </button>
      </form>

      <p className="search-help">
        Enter a city or postal code, add the state or province when helpful, and choose the country. Google locates that market, searches within the radius you choose, and Webvidence audits the selected business websites.
      </p>

      {loading && <div className="search-progress" role="status" aria-live="polite"><span className="search-spinner"/><div><b>{loadingStage}</b><small>The business search should finish quickly. Website analyses continue in the background.</small></div></div>}
      {error && <div className="notice notice-error"><b>Search could not finish.</b><br/>{error}<small className="error-help">Check the location spelling, Google API restrictions, plan usage, and server terminal for details.</small></div>}
      {notice && <div className="notice">{notice}</div>}

      {!loading && !error && mode && leads.length === 0 ? <div className="notice">No matching businesses were returned inside that radius. Try a broader category, a larger radius, or a nearby city.</div> : null}

      {leads.length > 0 && (
        <section className="section results-section">
          <div className="results-heading">
            <div>
              <div className="eyebrow">Search results</div>
              <h3>{leads.length} businesses collected</h3>
            </div>
            <small>Highest evidence scores indicate stronger website opportunities.</small>
          </div>

          <div className="prospect-list">
            {leads.map((lead, index) => (
              <article className="prospect-card" key={lead.id}>
                <div className="prospect-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="prospect-main">
                  <div className="prospect-titleline">
                    <div>
                      <small>{lead.category || 'Local business'} · {lead.distanceMiles ?? '?'} miles</small>
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
                  </div>

                  {lead.audit ? (
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
                    <button className="btn primary" onClick={() => analyze(lead.id)} disabled={auditingId === lead.id || lead.auditStatus === 'queued' || lead.auditStatus === 'running'}>
                      {auditingId === lead.id || lead.auditStatus === 'queued' || lead.auditStatus === 'running'
                        ? 'Analysis running…'
                        : lead.auditStatus === 'failed'
                          ? 'Retry analysis'
                          : lead.audit ? 'Run fresh analysis' : 'Analyze website'}
                    </button>
                    {lead.website && <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Open website</a>}
                    {lead.googleMapsUrl && <a className="btn" href={lead.googleMapsUrl} target="_blank" rel="noreferrer">Google listing</a>}
                    <Link className="btn outreach-link" href={`/dashboard/leads/${lead.id}`}>{lead.audit ? 'Create outreach' : 'Open lead file'}</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
