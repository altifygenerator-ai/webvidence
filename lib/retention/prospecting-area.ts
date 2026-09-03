import { distanceMiles } from '@/lib/providers/google-places';

export type ProspectingArea = {
  location: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
};

type RoutineAreaInput = {
  prospecting_area_location?: unknown;
  prospecting_area_center_lat?: unknown;
  prospecting_area_center_lng?: unknown;
  prospecting_area_radius_miles?: unknown;
} | null | undefined;

export function getProspectingArea(routine: RoutineAreaInput): ProspectingArea | null {
  if (!routine) return null;
  const location = typeof routine.prospecting_area_location === 'string'
    ? routine.prospecting_area_location.trim()
    : '';
  const latitude = typeof routine.prospecting_area_center_lat === 'number'
    ? routine.prospecting_area_center_lat
    : Number.NaN;
  const longitude = typeof routine.prospecting_area_center_lng === 'number'
    ? routine.prospecting_area_center_lng
    : Number.NaN;
  const radiusMiles = typeof routine.prospecting_area_radius_miles === 'number'
    ? routine.prospecting_area_radius_miles
    : 25;

  if (!location || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusMiles)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (radiusMiles < 5 || radiusMiles > 100) return null;

  return { location, latitude, longitude, radiusMiles };
}

export function distanceFromProspectingArea(
  lead: { latitude?: number | null; longitude?: number | null },
  area: ProspectingArea,
) {
  if (typeof lead.latitude !== 'number' || typeof lead.longitude !== 'number') {
    return Number.POSITIVE_INFINITY;
  }
  return distanceMiles(
    { latitude: area.latitude, longitude: area.longitude },
    { latitude: lead.latitude, longitude: lead.longitude },
  );
}

export function leadInsideProspectingArea(
  lead: { latitude?: number | null; longitude?: number | null },
  area: ProspectingArea,
) {
  return distanceFromProspectingArea(lead, area) <= area.radiusMiles + 0.25;
}

export function shortProspectingAreaLabel(value: string) {
  return value.split(',').slice(0, 2).join(',').trim() || value;
}
