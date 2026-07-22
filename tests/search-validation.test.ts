import { describe, expect, it } from 'vitest';
import { isCountryOnlyLocation, validateBusinessCategory } from '@/lib/search/validation';

describe('local business search validation', () => {
  it('rejects country-only locations', () => {
    expect(isCountryOnlyLocation('United States')).toBe(true);
    expect(isCountryOnlyLocation('Argentina')).toBe(true);
    expect(isCountryOnlyLocation('AR')).toBe(true);
    expect(isCountryOnlyLocation('Little Rock')).toBe(false);
  });

  it('rejects several comma-separated or unrelated categories', () => {
    expect(validateBusinessCategory('roofers, plumbers').valid).toBe(false);
    expect(validateBusinessCategory('roofers and restaurants').valid).toBe(false);
  });

  it('rejects target personas that Google Places cannot reliably locate', () => {
    expect(validateBusinessCategory('Shopify store owners').valid).toBe(false);
    expect(validateBusinessCategory('SDRs').valid).toBe(false);
  });

  it.each(['HVAC contractors', 'Heating and air conditioning', 'Lawn care and landscaping', 'Wedding venues', 'Cabin rentals', 'Tree services', 'Auto repair', 'Property management companies'])('keeps valid category %s', (category) => {
    expect(validateBusinessCategory(category)).toEqual({ valid: true, message: null });
  });
});
