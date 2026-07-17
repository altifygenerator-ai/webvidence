export type Coordinates = { latitude: number; longitude: number };

export type SearchResultMode = 'mixed' | 'best_match' | 'hidden' | 'closest';

export type GoogleBusiness = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  website: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number;
  businessStatus: string | null;
  googleMapsUrl: string | null;
  distanceMiles: number | null;
  raw: unknown;
};

export type SearchCandidate = {
  business: GoogleBusiness;
  sourceRank: number;
  bestMatchRank: number | null;
  areaIndex: number;
  hits: number;
};

type GeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlaceResponse = {
  id?: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: Coordinates;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  pureServiceAreaBusiness?: boolean;
};

type TextSearchResponse = {
  places?: PlaceResponse[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
};

type SearchArea = {
  center: Coordinates;
  radiusMiles: number;
  isFullMarket: boolean;
};

const MILES_TO_METERS = 1609.344;
const EARTH_RADIUS_MILES = 3958.7613;
const GOLDEN_ANGLE = 137.507764;

export function boundingBox(center: Coordinates, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0;
  const lngDivisor = Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01);
  const lngDelta = radiusMiles / (69.172 * lngDivisor);

  return {
    low: {
      latitude: Math.max(-90, center.latitude - latDelta),
      longitude: normalizeLongitude(center.longitude - lngDelta),
    },
    high: {
      latitude: Math.min(90, center.latitude + latDelta),
      longitude: normalizeLongitude(center.longitude + lngDelta),
    },
  };
}

function normalizeLongitude(value: number) {
  let normalized = value;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

export function distanceMiles(a: Coordinates, b: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function geocodeLocation(location: string, apiKey: string, countryCode?: string) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', location);
  if (countryCode) {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    url.searchParams.set('components', `country:${normalizedCountryCode}`);
    url.searchParams.set('region', normalizedCountryCode.toLowerCase());
  }
  url.searchParams.set('key', apiKey);

  const response = await fetchWithTimeout(url, { method: 'GET' }, 12_000);
  const body = (await response.json()) as GeocodeResponse;

  if (!response.ok || body.status !== 'OK') {
    throw new Error(body.error_message || `Google could not locate “${location}” (${body.status || response.status}).`);
  }

  const result = body.results?.[0];
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error(`Google could not locate “${location}”.`);
  }

  return {
    coordinates: { latitude: lat, longitude: lng },
    formattedAddress: result?.formatted_address || location,
  };
}

export function buildSearchAreas(
  center: Coordinates,
  radiusMiles: number,
  requestBudget: number,
  seed: string,
): SearchArea[] {
  const count = Math.max(1, Math.min(8, Math.floor(requestBudget)));
  const areas: SearchArea[] = [{ center, radiusMiles, isFullMarket: true }];
  if (count === 1) return areas;

  const angleOffset = hashString(seed) % 360;
  const localRadius = Math.max(2, Math.min(radiusMiles, radiusMiles * (count <= 3 ? 0.48 : 0.36)));
  const rings = [0.42, 0.68, 0.82];

  for (let index = 1; index < count; index += 1) {
    const ring = rings[(index - 1) % rings.length];
    const angle = angleOffset + (index - 1) * GOLDEN_ANGLE;
    areas.push({
      center: destinationPoint(center, radiusMiles * ring, angle),
      radiusMiles: localRadius,
      isFullMarket: false,
    });
  }

  return areas;
}

export function selectBusinesses(
  candidates: SearchCandidate[],
  options: {
    maxResults: number;
    mode: SearchResultMode;
    seed: string;
    excludedPlaceIds?: Iterable<string>;
  },
) {
  const maxResults = Math.max(1, options.maxResults);
  const excluded = new Set(options.excludedPlaceIds || []);
  const unseen = candidates.filter((candidate) => !excluded.has(candidate.business.id));
  const previouslySeen = candidates.filter((candidate) => excluded.has(candidate.business.id));
  const selected = selectFromPool(unseen, maxResults, options.mode, options.seed);

  if (selected.length < maxResults) {
    const fallback = selectFromPool(previouslySeen, maxResults - selected.length, options.mode, `${options.seed}:seen`);
    selected.push(...fallback);
  }

  return selected.slice(0, maxResults).map((candidate) => candidate.business);
}

function selectFromPool(
  candidates: SearchCandidate[],
  maxResults: number,
  mode: SearchResultMode,
  seed: string,
) {
  if (!candidates.length || maxResults <= 0) return [];

  if (mode === 'best_match') {
    return [...candidates]
      .sort((a, b) => compareBestMatch(a, b) || compareDistance(a, b))
      .slice(0, maxResults);
  }

  if (mode === 'closest') {
    return [...candidates]
      .sort((a, b) => compareDistance(a, b) || compareBestMatch(a, b))
      .slice(0, maxResults);
  }

  if (mode === 'hidden') {
    return [...candidates]
      .sort((a, b) => hiddenOpportunityScore(b, seed) - hiddenOpportunityScore(a, seed))
      .slice(0, maxResults);
  }

  const selected: SearchCandidate[] = [];
  const selectedIds = new Set<string>();
  const add = (items: SearchCandidate[], count: number) => {
    for (const item of items) {
      if (selected.length >= maxResults || count <= 0) break;
      if (selectedIds.has(item.business.id)) continue;
      selected.push(item);
      selectedIds.add(item.business.id);
      count -= 1;
    }
  };

  const bestMatches = [...candidates].sort((a, b) => compareBestMatch(a, b) || compareDistance(a, b));
  const hidden = [...candidates].sort((a, b) => hiddenOpportunityScore(b, seed) - hiddenOpportunityScore(a, seed));
  const withoutWebsite = deterministicShuffle(candidates.filter((candidate) => !candidate.business.website), `${seed}:no-site`);
  const areaSpread = spreadAcrossAreas(candidates, `${seed}:areas`);
  const shuffled = deterministicShuffle(candidates, `${seed}:fill`);

  add(bestMatches, Math.max(1, Math.ceil(maxResults * 0.25)));
  add(hidden, Math.max(1, Math.ceil(maxResults * 0.35)));
  add(withoutWebsite, Math.ceil(maxResults * 0.15));
  add(areaSpread, Math.ceil(maxResults * 0.15));
  add(shuffled, maxResults);

  return selected.slice(0, maxResults);
}

function hiddenOpportunityScore(candidate: SearchCandidate, seed: string) {
  const business = candidate.business;
  let score = 0;

  if (!business.website) score += 60;
  if (business.reviews <= 5) score += 42;
  else if (business.reviews <= 20) score += 34;
  else if (business.reviews <= 50) score += 26;
  else if (business.reviews <= 100) score += 17;
  else if (business.reviews <= 250) score += 9;

  if (business.phone) score += 4;
  if (business.rating !== null && business.rating >= 4) score += 4;
  if (business.rating !== null && business.rating < 3.5) score -= 8;
  if (candidate.bestMatchRank === null) score += 7;
  if (candidate.hits === 1) score += 5;

  score += deterministicUnit(`${seed}:${business.id}`) * 8;
  return score;
}

function spreadAcrossAreas(candidates: SearchCandidate[], seed: string) {
  const groups = new Map<number, SearchCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.areaIndex) || [];
    group.push(candidate);
    groups.set(candidate.areaIndex, group);
  }

  const areaIndexes = deterministicShuffle(
    Array.from(groups.keys()).sort((a, b) => Number(a === 0) - Number(b === 0)),
    seed,
  );
  const queues = areaIndexes.map((areaIndex) => deterministicShuffle(groups.get(areaIndex) || [], `${seed}:${areaIndex}`));
  const spread: SearchCandidate[] = [];
  let remaining = queues.reduce((total, queue) => total + queue.length, 0);

  while (remaining > 0) {
    for (const queue of queues) {
      const candidate = queue.shift();
      if (!candidate) continue;
      spread.push(candidate);
      remaining -= 1;
    }
  }

  return spread;
}

function compareBestMatch(a: SearchCandidate, b: SearchCandidate) {
  const aRank = a.bestMatchRank ?? Number.POSITIVE_INFINITY;
  const bRank = b.bestMatchRank ?? Number.POSITIVE_INFINITY;
  if (aRank !== bRank) return aRank - bRank;
  if (a.hits !== b.hits) return b.hits - a.hits;
  return a.sourceRank - b.sourceRank;
}

function compareDistance(a: SearchCandidate, b: SearchCandidate) {
  return (a.business.distanceMiles ?? Number.POSITIVE_INFINITY) -
    (b.business.distanceMiles ?? Number.POSITIVE_INFINITY);
}

function deterministicShuffle<T>(items: T[], seed: string) {
  return [...items]
    .map((item, index) => ({ item, rank: deterministicUnit(`${seed}:${index}:${stableItemKey(item)}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item);
}

function stableItemKey(value: unknown) {
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (value && typeof value === 'object' && 'business' in value) {
    const candidate = value as SearchCandidate;
    return candidate.business.id;
  }
  return JSON.stringify(value);
}

function deterministicUnit(value: string) {
  return hashString(value) / 0xffffffff;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function destinationPoint(start: Coordinates, miles: number, bearingDegrees: number): Coordinates {
  const angularDistance = miles / EARTH_RADIUS_MILES;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude1 = (start.latitude * Math.PI) / 180;
  const longitude1 = (start.longitude * Math.PI) / 180;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) +
    Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude2 = longitude1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
    Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2),
  );

  return {
    latitude: (latitude2 * 180) / Math.PI,
    longitude: normalizeLongitude((longitude2 * 180) / Math.PI),
  };
}

export async function searchBusinesses(options: {
  category: string;
  center: Coordinates;
  radiusMiles: number;
  maxResults: number;
  apiKey: string;
  countryCode?: string;
  resultMode?: SearchResultMode;
  requestBudget?: number;
  poolSize?: number;
  seed?: string;
  excludePlaceIds?: Iterable<string>;
}) {
  const {
    category,
    center,
    radiusMiles,
    maxResults,
    apiKey,
    countryCode,
    resultMode = 'mixed',
    requestBudget = 3,
    poolSize = Math.max(maxResults, 40),
    seed = `${category}:${center.latitude}:${center.longitude}`,
    excludePlaceIds,
  } = options;

  const boundedRequestBudget = Math.max(1, Math.min(8, Math.floor(requestBudget)));
  const boundedPoolSize = Math.max(maxResults, Math.min(poolSize, boundedRequestBudget * 20));
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.primaryTypeDisplayName',
    'places.formattedAddress',
    'places.addressComponents',
    'places.location',
    'places.websiteUri',
    'places.nationalPhoneNumber',
    'places.rating',
    'places.userRatingCount',
    'places.businessStatus',
    'places.googleMapsUri',
    'places.pureServiceAreaBusiness',
    'nextPageToken',
  ].join(',');

  const collected = new Map<string, SearchCandidate>();
  let requests = 0;
  let areasSearched = 0;

  const collectPlaces = (places: PlaceResponse[], areaIndex: number, rankOffset = 0) => {
    for (let index = 0; index < places.length; index += 1) {
      const business = placeToBusiness(places[index], category, center, radiusMiles, countryCode);
      if (!business) continue;

      const sourceRank = rankOffset + index;
      const existing = collected.get(business.id);
      if (existing) {
        existing.hits += 1;
        existing.sourceRank = Math.min(existing.sourceRank, sourceRank);
        if (areaIndex === 0) {
          existing.bestMatchRank = Math.min(existing.bestMatchRank ?? Number.POSITIVE_INFINITY, sourceRank);
        }
        continue;
      }

      collected.set(business.id, {
        business,
        sourceRank,
        bestMatchRank: areaIndex === 0 ? sourceRank : null,
        areaIndex,
        hits: 1,
      });
    }
  };

  if (resultMode === 'best_match') {
    let pageToken: string | undefined;
    while (requests < boundedRequestBudget && collected.size < boundedPoolSize) {
      try {
        const body = await requestTextSearch({
          category,
          rectangle: boundingBox(center, radiusMiles),
          apiKey,
          countryCode,
          fieldMask,
          pageToken,
        });
        collectPlaces(body.places || [], 0, requests * 20);
        requests += 1;
        areasSearched = 1;
        pageToken = body.nextPageToken;
        if (!pageToken) break;
      } catch (error) {
        requests += 1;
        if (!collected.size) throw error;
        console.warn('A later Google Places results page could not be loaded:', error);
        break;
      }
    }
  } else {
    const areas = buildSearchAreas(center, radiusMiles, boundedRequestBudget, seed);
    const responses = await mapWithConcurrency(areas, 3, async (area) => {
      try {
        return {
          body: await requestTextSearch({
            category,
            rectangle: boundingBox(area.center, area.radiusMiles),
            apiKey,
            countryCode,
            fieldMask,
          }),
          error: null,
        };
      } catch (error) {
        return { body: null, error };
      }
    });

    requests = responses.length;
    responses.forEach((result, areaIndex) => {
      if (result.body) {
        areasSearched += 1;
        collectPlaces(result.body.places || [], areaIndex);
      }
    });
    if (!areasSearched) {
      const firstError = responses.find((result) => result.error)?.error;
      throw firstError instanceof Error ? firstError : new Error('Google Places search failed for every market area.');
    }
    if (areasSearched < areas.length) {
      console.warn(`${areas.length - areasSearched} Google Places market area request(s) failed, but the search continued with the remaining results.`);
    }
  }

  const candidatePool = Array.from(collected.values());
  const selectionPool = candidatePool.length > boundedPoolSize
    ? selectFromPool(candidatePool, boundedPoolSize, resultMode, `${seed}:pool`)
    : candidatePool;
  const excluded = new Set(excludePlaceIds || []);
  const businesses = selectBusinesses(selectionPool, {
    maxResults,
    mode: resultMode,
    seed,
    excludedPlaceIds: excluded,
  });

  return {
    businesses,
    requests,
    areasSearched,
    candidatesConsidered: selectionPool.length,
    unseenCandidates: selectionPool.filter((candidate) => !excluded.has(candidate.business.id)).length,
    resultMode,
  };
}

async function requestTextSearch(options: {
  category: string;
  rectangle: ReturnType<typeof boundingBox>;
  apiKey: string;
  countryCode?: string;
  fieldMask: string;
  pageToken?: string;
}) {
  const requestBody: Record<string, unknown> = {
    textQuery: options.category,
    pageSize: 20,
    languageCode: 'en',
    includePureServiceAreaBusinesses: true,
    locationRestriction: { rectangle: options.rectangle },
  };
  if (options.countryCode) requestBody.regionCode = options.countryCode.toUpperCase();
  if (options.pageToken) requestBody.pageToken = options.pageToken;

  const response = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': options.apiKey,
        'X-Goog-FieldMask': options.fieldMask,
      },
      body: JSON.stringify(requestBody),
    },
    15_000,
  );

  const body = (await response.json()) as TextSearchResponse;
  if (!response.ok) {
    throw new Error(body.error?.message || `Google Places search failed (${response.status}).`);
  }
  return body;
}

function placeToBusiness(
  place: PlaceResponse,
  category: string,
  center: Coordinates,
  radiusMiles: number,
  countryCode?: string,
): GoogleBusiness | null {
  if (!place.id || !place.displayName?.text) return null;
  const miles = place.location ? distanceMiles(center, place.location) : null;
  if (miles !== null && miles > radiusMiles + 0.25) return null;
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return null;

  const city = component(place.addressComponents, ['locality', 'postal_town']) ||
    component(place.addressComponents, ['administrative_area_level_2']);
  const state = component(place.addressComponents, ['administrative_area_level_1'], true);
  const postalCode = component(place.addressComponents, ['postal_code']);
  const placeCountryCode = component(place.addressComponents, ['country'], true).toUpperCase();
  if (countryCode && placeCountryCode && placeCountryCode !== countryCode.toUpperCase()) return null;

  return {
    id: place.id,
    name: place.displayName.text,
    category: place.primaryTypeDisplayName?.text || category,
    address: place.formattedAddress || '',
    city,
    state,
    postalCode,
    countryCode: placeCountryCode,
    latitude: place.location?.latitude ?? center.latitude,
    longitude: place.location?.longitude ?? center.longitude,
    website: normalizeWebsite(place.websiteUri),
    phone: place.nationalPhoneNumber || null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviews: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
    businessStatus: place.businessStatus || null,
    googleMapsUrl: place.googleMapsUri || null,
    distanceMiles: miles === null ? null : Math.round(miles * 10) / 10,
    raw: place,
  };
}

function component(components: AddressComponent[] | undefined, types: string[], short = false) {
  const match = components?.find((item) => item.types?.some((type) => types.includes(type)));
  return (short ? match?.shortText : match?.longText) || '';
}

function normalizeWebsite(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

async function fetchWithTimeout(input: string | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export const GOOGLE_SEARCH_LIMITS = {
  maxPlacesPerQuery: 160,
  maxRadiusMiles: 100,
  metersPerMile: MILES_TO_METERS,
};
