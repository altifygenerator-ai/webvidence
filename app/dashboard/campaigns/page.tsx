'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { StartSessionButton } from '@/components/start-session-button';
import { COUNTRIES } from '@/lib/countries';
import { getPlainLeadReason, getTopContactRecommendations } from '@/lib/leads/recommendation';
import { isCountryOnlyLocation, validateBusinessCategory } from '@/lib/search/validation';
import { ArrowRight, Check, ChevronDown, Clock3, Eye, Globe2, MapPin, Radar, Search, SlidersHorizontal } from 'lucide-react';

type Finding = { code: string; label: string; severity: 'high' | 'medium' | 'low' | 'positive'; evidence: string };
type Lead = { id: string; name: string; category: string; address: string; city: string; state: string; website: string | null; phone: string | null; reviews: number; rating: number | null; googleMapsUrl: string | null; distanceMiles: number | null; opportunityScore: number | null; status?: string; audit: null | { score: number; findings: Finding[] }; auditStatus?: string };
type Market = { id: string; category: string; location: string; radius_miles: number; status: string; watched_at: string | null; next_refresh_at: string | null; last_new_prospect_count: number };
type SearchResponse = { mode?: 'demo' | 'live'; count?: number; warning?: string; auditWarning?: string | null; error?: string; leads?: Lead[]; campaignId?: string; center?: { formattedAddress?: string } };

export default function FindPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('Locating the market…');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [guidance, setGuidance] = useState('');
  const [watching, setWatching] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/campaigns', { cache: 'no-store' }).then(async (response) => {
      if (response.ok && active) setMarkets((await response.json()).campaigns || []);
    });
    return () => { active = false; };
  }, []);
  async function loadMarkets() {
    const response = await fetch('/api/campaigns', { cache: 'no-store' });
    if (response.ok) setMarkets((await response.json()).campaigns || []);
  }

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const categoryCheck = validateBusinessCategory(String(formData.get('category') || ''));
    const city = String(formData.get('city') || '').trim();
    if (!categoryCheck.valid) return setGuidance(categoryCheck.message || 'Enter one kind of local business.');
    if (!city || isCountryOnlyLocation(city)) return setGuidance('Enter a city or postal code, not only a country.');
    setGuidance(''); setLoading(true); setError(''); setNotice(''); setLeads([]); setShowAll(false);
    const stages = ['Searching the market…', 'Checking public business details…', 'Preparing the best first prospects…'];
    let index = 0;
    const timer = window.setInterval(() => setLoadingStage(stages[Math.min(index++, stages.length - 1)]), 1500);
    try {
      const response = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(formData)) });
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(data.error || 'The search could not be completed.');
      setLeads(data.leads || []); setCampaignId(data.campaignId || '');
      setNotice(data.auditWarning || data.warning || `${data.count || 0} businesses found near ${data.center?.formattedAddress || 'that location'}.`);
      await loadMarkets();
    } catch (searchError) { setError(searchError instanceof Error ? searchError.message : 'The search could not be completed.'); }
    finally { window.clearInterval(timer); setLoading(false); }
  }

  async function setWatch(watched: boolean) {
    if (!campaignId) return;
    setWatching(true); setError('');
    try {
      const response = await fetch('/api/campaigns', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaignId, watched }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The market could not be updated.');
      setMarkets((current) => current.map((market) => market.id === data.campaign.id ? data.campaign : market));
      setNotice(watched ? 'Market watched. New worthwhile prospects can feed a future session.' : 'Market watch turned off.');
    } catch (watchError) { setError(watchError instanceof Error ? watchError.message : 'The market could not be updated.'); }
    finally { setWatching(false); }
  }

  const recommendations = useMemo(() => getTopContactRecommendations(leads, 3), [leads]);
  const currentMarket = markets.find((market) => market.id === campaignId);

  return (
    <AppShell>
      <div className="find-page">
        <header className="find-heading"><span className="session-kicker">Find</span><h1>Find a market worth working.</h1><p>Choose one business type and location. Webvidence will prepare the first few prospects worth a decision.</p></header>
        <form className="market-search-card" onSubmit={run}>
          <div className="market-search-main"><label><span>Business type</span><input className="input" name="category" placeholder="Roofers" required /></label><label><span>City or postal code</span><input className="input" name="city" placeholder="Little Rock or 72201" required /></label><button className="btn primary" disabled={loading}><Search size={18} /> {loading ? 'Searching…' : 'Find prospects'}</button></div>
          <details className="market-advanced"><summary><SlidersHorizontal size={16} /> Search options <ChevronDown size={16} /></summary><div><label><span>State / province</span><input className="input" name="region" placeholder="Arkansas" /></label><label><span>Country</span><select className="input" name="countryCode" defaultValue="US">{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label><span>Radius</span><select className="input" name="radiusMiles" defaultValue="50"><option value="25">25 miles</option><option value="50">50 miles</option><option value="75">75 miles</option><option value="100">100 miles</option></select></label><label><span>Result mix</span><select className="input" name="resultMode" defaultValue="mixed"><option value="mixed">Mixed opportunities</option><option value="hidden">Hidden opportunities</option><option value="best_match">Best Google matches</option><option value="closest">Closest first</option></select></label><input type="hidden" name="maxResults" value="10" /><input type="hidden" name="auditCount" value="3" /></div></details>
        </form>
        {guidance ? <div className="notice notice-error">{guidance}</div> : null}
        {loading ? <div className="market-loading"><span className="search-spinner" /><div><b>{loadingStage}</b><small>You can leave once the businesses are saved. Website checks continue in the background.</small></div></div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}
        {notice && !loading ? <div className="market-notice"><Check size={16} /> {notice}</div> : null}

        {leads.length ? <section className="prepared-results">
          <div className="prepared-results-head"><div><span className="session-kicker">Prepared session</span><h2>{recommendations.length || Math.min(3, leads.length)} prospects are ready.</h2><p>Selected for public activity, a usable opportunity, and a realistic next step.</p></div><div className="prepared-estimate"><Clock3 size={17} /><span>About 8 minutes</span></div></div>
          <div className="prepared-prospect-list">{(recommendations.length ? recommendations.map((item) => item.lead) : leads.slice(0, 3)).map((lead, index) => <article key={lead.id}><span>{index + 1}</span><div><small>{lead.category || 'Local business'} · {[lead.city, lead.state].filter(Boolean).join(', ')}</small><h3>{lead.name}</h3><p>{getPlainLeadReason(lead)}</p><div><em>{lead.reviews} reviews</em>{lead.website ? <em>Website found</em> : <em>No website linked</em>}</div></div><Link href={`/dashboard/leads/${lead.id}`}>Preview <ArrowRight size={15} /></Link></article>)}</div>
          <div className="prepared-actions"><StartSessionButton /><button className={currentMarket?.watched_at ? 'btn watched-button' : 'btn'} type="button" onClick={() => void setWatch(!currentMarket?.watched_at)} disabled={watching}><Radar size={17} />{watching ? 'Saving…' : currentMarket?.watched_at ? 'Market watched' : 'Watch this market'}</button></div>
          <p className="prepared-helper">Passing a poor fit counts as useful work. The goal is three good decisions, not three messages.</p>
          <button className="show-all-results" type="button" onClick={() => setShowAll((value) => !value)}><Eye size={16} /> {showAll ? 'Hide all results' : `See all ${leads.length} results`} <ChevronDown size={16} /></button>
          {showAll ? <div className="all-market-results">{leads.map((lead) => <article key={lead.id}><div><b>{lead.name}</b><span><MapPin size={14} /> {[lead.city, lead.state].filter(Boolean).join(', ')}</span></div><div><span>{lead.rating || '—'} rating</span><span>{lead.reviews} reviews</span></div><div>{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer"><Globe2 size={15} /> Website</a> : <span>No website linked</span>}<Link href={`/dashboard/leads/${lead.id}`}>Full record</Link></div></article>)}</div> : null}
        </section> : null}

        {markets.length ? <section className="saved-markets-clean"><div><span className="session-kicker">Your markets</span><h2>Saved and watched.</h2></div><div>{markets.filter((market) => market.status !== 'archived').map((market) => <article key={market.id}><span className={market.watched_at ? 'market-watch-dot on' : 'market-watch-dot'} /><div><b>{market.category}</b><span>{market.location} · {market.radius_miles} miles</span></div><em>{market.watched_at ? 'Watching' : 'Saved'}</em></article>)}</div></section> : null}
      </div>
    </AppShell>
  );
}
