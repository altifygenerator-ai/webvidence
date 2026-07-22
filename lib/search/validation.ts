import { COUNTRIES } from '@/lib/countries';

const VAGUE_CATEGORIES = new Set([
  'business',
  'businesses',
  'company',
  'companies',
  'local businesses',
  'small businesses',
]);

const PERSONA_PATTERNS = [
  /\bshopify\s+(store\s+)?owners?\b/i,
  /\be-?commerce\s+(store\s+)?owners?\b/i,
  /\bsdrs?\b/i,
  /\bsaas\s+(founders?|companies|businesses)\b/i,
  /\bmarketing\s+agencies\b/i,
  /\bnationwide\b/i,
  /\bacross\s+the\s+(us|country|united states)\b/i,
];

const COUNTRY_ONLY = new Set([
  ...COUNTRIES.flatMap((country) => [country.name.toLowerCase(), country.code.toLowerCase()]),
  'united states of america', 'usa', 'us', 'uk',
]);

export type CategoryValidation = {
  valid: boolean;
  message: string | null;
};

export function validateBusinessCategory(value: string): CategoryValidation {
  const category = value.trim();
  if (!category) {
    return { valid: false, message: 'Enter one kind of local business.' };
  }

  if (VAGUE_CATEGORIES.has(category.toLowerCase())) {
    return {
      valid: false,
      message: 'Search one kind of local business at a time. Try “roofers,” “cabin rentals,” or “restaurants.”',
    };
  }

  const commaParts = category.split(',').map((part) => part.trim()).filter(Boolean);
  const hasExplicitAlternatives = /\s+or\s+|\s*\/\s*/i.test(category);
  const hasClearlySeparateAndCategories = looksLikeSeparateAndCategories(category);
  if (commaParts.length > 1 || hasExplicitAlternatives || hasClearlySeparateAndCategories) {
    return {
      valid: false,
      message: 'Search one kind of local business at a time. Try “roofers,” “cabin rentals,” or “restaurants.”',
    };
  }

  if (PERSONA_PATTERNS.some((pattern) => pattern.test(category))) {
    return {
      valid: false,
      message: 'Google Places works best with a local business category, such as “HVAC contractors” or “wedding venues.”',
    };
  }

  return { valid: true, message: null };
}

export function isCountryOnlyLocation(value: string) {
  return COUNTRY_ONLY.has(value.trim().toLowerCase());
}

const CATEGORY_NOUNS = /\b(roofers?|restaurants?|plumbers?|electricians?|dentists?|lawyers?|attorneys?|cabins?|hotels?|cleaners?|landscapers?|mechanics?|contractors?|salons?|spas?|realtors?|photographers?|painters?|tree services?|auto repair|property management|wedding venues?)\b/i;

function looksLikeSeparateAndCategories(value: string) {
  const parts = value.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return false;

  const knownCompound = /\b(heating and air conditioning|air conditioning and heating|lawn care and landscaping|landscaping and lawn care|tree trimming and removal|towing and recovery|plumbing and heating|bed and breakfast|arts and crafts)\b/i;
  if (knownCompound.test(value)) return false;

  return parts.every((part) => CATEGORY_NOUNS.test(part));
}
