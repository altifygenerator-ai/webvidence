export type PageSpeedScores = {
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  finalUrl: string | null;
  raw: unknown | null;
  error?: string;
};

type PageSpeedResponse = {
  error?: { message?: string };
  lighthouseResult?: {
    finalUrl?: string;
    categories?: Record<string, { score?: number | null }>;
  };
};

export async function runPageSpeed(url: string, apiKey?: string): Promise<PageSpeedScores> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', 'mobile');
  endpoint.searchParams.append('category', 'performance');
  endpoint.searchParams.append('category', 'accessibility');
  endpoint.searchParams.append('category', 'seo');
  endpoint.searchParams.append('category', 'best-practices');
  if (apiKey) endpoint.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
    const body = (await response.json()) as PageSpeedResponse;
    if (!response.ok) {
      return empty(body.error?.message || `PageSpeed failed (${response.status}).`);
    }
    const categories = body.lighthouseResult?.categories || {};
    const performance = score(categories.performance?.score);
    const accessibility = score(categories.accessibility?.score);
    const seo = score(categories.seo?.score);
    const bestPractices = score(categories['best-practices']?.score);
    return {
      performance,
      accessibility,
      seo,
      bestPractices,
      finalUrl: body.lighthouseResult?.finalUrl || null,
      // Keep audits compact. The full Lighthouse response can be several MB and
      // is not needed after the four category scores have been extracted.
      raw: {
        finalUrl: body.lighthouseResult?.finalUrl || null,
        categories: { performance, accessibility, seo, bestPractices },
      },
    };
  } catch (error) {
    return empty(error instanceof Error ? error.message : 'PageSpeed request failed.');
  } finally {
    clearTimeout(timer);
  }
}

function score(value?: number | null) {
  return typeof value === 'number' ? Math.round(value * 100) : null;
}

function empty(error: string): PageSpeedScores {
  return {
    performance: null,
    accessibility: null,
    seo: null,
    bestPractices: null,
    finalUrl: null,
    raw: null,
    error,
  };
}
