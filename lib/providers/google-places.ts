export type Coordinates = { latitude: number; longitude: number };

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

const MILES_TO_METERS = 1609.344;
const EARTH_RADIUS_MILES = 3958.7613;

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

export async function searchBusinesses(options: {
  category: string;
  center: Coordinates;
  radiusMiles: number;
  maxResults: number;
  apiKey: string;
  countryCode?: string;
}) {
  const { category, center, radiusMiles, maxResults, apiKey, countryCode } = options;
  const rectangle = boundingBox(center, radiusMiles);
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

  const collected = new Map<string, GoogleBusiness>();
  let pageToken: string | undefined;
  let requests = 0;

  while (collected.size < maxResults && requests < 3) {
    const requestBody: Record<string, unknown> = {
      textQuery: category,
      pageSize: 20,
      languageCode: 'en',
      includePureServiceAreaBusinesses: true,
      locationRestriction: { rectangle },
    };
    if (countryCode) requestBody.regionCode = countryCode.toUpperCase();
    if (pageToken) requestBody.pageToken = pageToken;

    const response = await fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(requestBody),
      },
      15_000,
    );

    const body = (await response.json()) as TextSearchResponse;
    requests += 1;

    if (!response.ok) {
      throw new Error(body.error?.message || `Google Places search failed (${response.status}).`);
    }

    for (const place of body.places || []) {
      if (!place.id || !place.displayName?.text) continue;
      const miles = place.location ? distanceMiles(center, place.location) : null;
      if (miles !== null && miles > radiusMiles + 0.25) continue;
      if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') continue;

      const city = component(place.addressComponents, ['locality', 'postal_town']) ||
        component(place.addressComponents, ['administrative_area_level_2']);
      const state = component(place.addressComponents, ['administrative_area_level_1'], true);
      const postalCode = component(place.addressComponents, ['postal_code']);
      const placeCountryCode = component(place.addressComponents, ['country'], true).toUpperCase();
      if (countryCode && placeCountryCode && placeCountryCode !== countryCode.toUpperCase()) continue;

      collected.set(place.id, {
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
      });
      if (collected.size >= maxResults) break;
    }

    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return {
    businesses: Array.from(collected.values())
      .sort((a, b) => (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY))
      .slice(0, maxResults),
    requests,
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
  maxPlacesPerQuery: 60,
  maxRadiusMiles: 100,
  metersPerMile: MILES_TO_METERS,
};
