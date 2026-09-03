import { describe, expect, it } from 'vitest';
import { distanceFromProspectingArea, getProspectingArea, leadInsideProspectingArea } from '../lib/retention/prospecting-area';

describe('prospecting area distance behavior', () => {
  const hotSpringsArea = {
    location: 'Hot Springs, AR, USA',
    prospecting_area_location: 'Hot Springs, AR, USA',
    prospecting_area_center_lat: 34.5037,
    prospecting_area_center_lng: -93.0552,
    prospecting_area_radius_miles: 75,
  };

  it('keeps Arkansas-region prospects while rejecting far-away states', () => {
    const area = getProspectingArea(hotSpringsArea);
    expect(area).not.toBeNull();
    if (!area) return;

    const littleRock = { latitude: 34.7465, longitude: -92.2896 };
    const chicago = { latitude: 41.8781, longitude: -87.6298 };
    const minneapolis = { latitude: 44.9778, longitude: -93.2650 };

    expect(leadInsideProspectingArea(littleRock, area)).toBe(true);
    expect(leadInsideProspectingArea(chicago, area)).toBe(false);
    expect(leadInsideProspectingArea(minneapolis, area)).toBe(false);
    expect(distanceFromProspectingArea(chicago, area)).toBeGreaterThan(area.radiusMiles);
  });

  it('rejects missing coordinates instead of guessing geography', () => {
    const area = getProspectingArea(hotSpringsArea);
    expect(area).not.toBeNull();
    if (!area) return;
    expect(leadInsideProspectingArea({ latitude: null, longitude: null }, area)).toBe(false);
  });

  it('rejects incomplete saved-area records instead of treating null coordinates as zero', () => {
    expect(getProspectingArea({
      prospecting_area_location: 'Hot Springs, AR',
      prospecting_area_center_lat: null,
      prospecting_area_center_lng: null,
      prospecting_area_radius_miles: 25,
    })).toBeNull();
  });
});
