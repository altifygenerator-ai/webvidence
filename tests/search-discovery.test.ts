import { describe, expect, it } from 'vitest';
import {
  buildSearchAreas,
  selectBusinesses,
  type GoogleBusiness,
  type SearchCandidate,
} from '../lib/providers/google-places';

function business(id: string, options: Partial<GoogleBusiness> = {}): GoogleBusiness {
  return {
    id,
    name: `Business ${id}`,
    category: 'Plumber',
    address: `${id} Main St`,
    city: 'Testville',
    state: 'AR',
    postalCode: '71921',
    countryCode: 'US',
    latitude: 34,
    longitude: -93,
    website: `https://${id}.example.com`,
    phone: '555-0100',
    rating: 4.5,
    reviews: 100,
    businessStatus: 'OPERATIONAL',
    googleMapsUrl: null,
    distanceMiles: 5,
    raw: {},
    ...options,
  };
}

function candidate(
  id: string,
  options: Omit<Partial<SearchCandidate>, 'business'> & { business?: Partial<GoogleBusiness> } = {},
): SearchCandidate {
  return {
    business: business(id, options.business),
    sourceRank: options.sourceRank ?? 10,
    bestMatchRank: options.bestMatchRank ?? null,
    areaIndex: options.areaIndex ?? 1,
    hits: options.hits ?? 1,
  };
}

describe('market discovery coverage', () => {
  it('keeps the original full-market search and adds deterministic local areas', () => {
    const center = { latitude: 34.5037, longitude: -93.0552 };
    const first = buildSearchAreas(center, 50, 5, 'same-search');
    const second = buildSearchAreas(center, 50, 5, 'same-search');

    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first[0]).toEqual({ center, radiusMiles: 50, isFullMarket: true });
    expect(first.slice(1).every((area) => area.isFullMarket === false)).toBe(true);
    expect(first.slice(1).some((area) => area.center.latitude !== center.latitude)).toBe(true);
  });

  it('prioritizes smaller and no-website listings in hidden-opportunity mode', () => {
    const candidates = [
      candidate('established', { bestMatchRank: 0, business: { reviews: 3000 } }),
      candidate('small-site', { business: { reviews: 12 } }),
      candidate('no-site', { business: { reviews: 4, website: null } }),
    ];

    const selected = selectBusinesses(candidates, {
      maxResults: 2,
      mode: 'hidden',
      seed: 'hidden-test',
    });

    expect(selected.map((item) => item.id)).toContain('no-site');
    expect(selected.map((item) => item.id)).toContain('small-site');
  });

  it('skips businesses already saved in the campaign when enough new matches exist', () => {
    const candidates = [
      candidate('seen', { bestMatchRank: 0 }),
      candidate('new-1', { bestMatchRank: 1 }),
      candidate('new-2', { bestMatchRank: 2 }),
    ];

    const selected = selectBusinesses(candidates, {
      maxResults: 2,
      mode: 'best_match',
      seed: 'exclude-test',
      excludedPlaceIds: ['seen'],
    });

    expect(selected.map((item) => item.id)).toEqual(['new-1', 'new-2']);
  });

  it('uses saved businesses only as fallback when the new pool is too small', () => {
    const candidates = [
      candidate('seen', { bestMatchRank: 0 }),
      candidate('new', { bestMatchRank: 1 }),
    ];

    const selected = selectBusinesses(candidates, {
      maxResults: 2,
      mode: 'best_match',
      seed: 'fallback-test',
      excludedPlaceIds: ['seen'],
    });

    expect(selected.map((item) => item.id)).toEqual(['new', 'seen']);
  });
});
