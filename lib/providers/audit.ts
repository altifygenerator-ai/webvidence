import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { runPageSpeed, type PageSpeedScores } from '@/lib/providers/pagespeed';

export type Finding = {
  code: string;
  label: string;
  severity: 'high' | 'medium' | 'low' | 'positive';
  evidence: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type WebsiteAudit = {
  score: number;
  findings: Finding[];
  status: 'completed' | 'partial' | 'failed';
  websiteUrl: string | null;
  finalUrl: string | null;
  httpStatus: number | null;
  pageTitle: string | null;
  metaDescription: string | null;
  pagesCrawled: number;
  performanceScore: number | null;
  accessibilityScore: number | null;
  seoScore: number | null;
  bestPracticesScore: number | null;
  raw: Record<string, unknown>;
};

type AccessIssue = {
  type: 'blocked' | 'unreachable' | 'invalid';
  reason: string;
  httpStatus?: number | null;
};

type PageSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  html: string;
  title: string | null;
  description: string | null;
  textLength: number;
  hasForm: boolean;
  hasTel: boolean;
  hasSchema: boolean;
  hasContactLink: boolean;
  links: string[];
  accessBlocked: boolean;
  accessReason: string | null;
};

const MAX_PAGES = 6;
const MAX_PAGE_BYTES = 1_500_000;
const PAGE_TIMEOUT_MS = 10_000;

export async function auditWebsite(url: string | null, options?: { runPageSpeed?: boolean; maxPages?: number }) {
  const findings: Finding[] = [];

  if (!url) {
    findings.push({
      code: 'no_site',
      label: 'No website found',
      severity: 'high',
      evidence: 'The Google business listing does not include a website.',
    });
    return finish({
      url: null,
      finalUrl: null,
      httpStatus: null,
      title: null,
      description: null,
      findings,
      pageSpeed: null,
      status: 'completed',
      pages: [],
    });
  }

  let safeUrl: URL;
  try {
    safeUrl = await validatePublicUrl(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The website URL is invalid.';
    findings.push({
      code: 'unsafe_or_invalid_url',
      label: 'Website URL could not be safely checked',
      severity: 'high',
      evidence: reason,
      sourceUrl: url,
    });
    return finish({
      url,
      finalUrl: null,
      httpStatus: null,
      title: null,
      description: null,
      findings,
      pageSpeed: null,
      status: 'partial',
      pages: [],
      accessIssue: { type: 'invalid', reason, httpStatus: null },
    });
  }

  const pageLimit = Math.max(1, Math.min(options?.maxPages || MAX_PAGES, MAX_PAGES));
  let homepage: PageSnapshot | null = null;
  let status: WebsiteAudit['status'] = 'completed';
  let accessIssue: AccessIssue | null = null;
  const pages: PageSnapshot[] = [];
  const pageErrors: Array<{ url: string; message: string; httpStatus?: number }> = [];

  try {
    homepage = await fetchPageSnapshot(safeUrl);
    pages.push(homepage);

    if (homepage.accessBlocked) {
      status = 'partial';
      accessIssue = {
        type: 'blocked',
        reason: homepage.accessReason || 'The website blocked the automated review.',
        httpStatus: homepage.httpStatus,
      };
      findings.push({
        code: 'automated_check_blocked',
        label: 'Automated review was blocked',
        severity: 'low',
        evidence: `${accessIssue.reason} The website exists, but its content needs a manual review before outreach.`,
        sourceUrl: homepage.finalUrl,
        metadata: { httpStatus: homepage.httpStatus, manualReviewRequired: true },
      });
    } else if (homepage.httpStatus === 404 || homepage.httpStatus === 410) {
      status = 'partial';
      findings.push({
        code: 'homepage_not_found',
        label: 'Listed website returns a missing-page response',
        severity: 'high',
        evidence: `The listed homepage returned HTTP ${homepage.httpStatus} when Webvidence checked it.`,
        sourceUrl: homepage.finalUrl,
        metadata: { httpStatus: homepage.httpStatus },
      });
    } else if (homepage.httpStatus >= 400) {
      status = 'partial';
      findings.push({
        code: 'homepage_http_error',
        label: 'Website returned an error',
        severity: 'high',
        evidence: `The homepage returned HTTP ${homepage.httpStatus}.`,
        sourceUrl: homepage.finalUrl,
        metadata: { httpStatus: homepage.httpStatus },
      });
    } else {
      const candidates = prioritizeInternalLinks(homepage.links, new URL(homepage.finalUrl)).slice(0, pageLimit - 1);
      const extraPages = await mapWithConcurrency(candidates, 2, async (candidate) => {
        try {
          const page = await fetchPageSnapshot(new URL(candidate));
          if (page.accessBlocked || page.httpStatus >= 400) {
            pageErrors.push({
              url: candidate,
              message: page.accessReason || `The linked page returned HTTP ${page.httpStatus}.`,
              httpStatus: page.httpStatus,
            });
            return null;
          }
          return page;
        } catch (error) {
          pageErrors.push({
            url: candidate,
            message: describeFetchError(error),
          });
          return null;
        }
      });
      pages.push(...extraPages.filter((page): page is PageSnapshot => Boolean(page)));
      inspectSite(pages, findings);
    }

    if (pageErrors.length > 0) {
      status = 'partial';
      findings.push({
        code: 'partial_crawl',
        label: 'Some linked pages could not be checked',
        severity: 'low',
        evidence: `${pageErrors.length} linked page${pageErrors.length === 1 ? '' : 's'} could not be fetched during the sample crawl.`,
        sourceUrl: homepage.finalUrl,
        metadata: { failedPages: pageErrors },
      });
    }
  } catch (error) {
    const message = describeFetchError(error);
    const failureType = classifyFetchFailure(error);
    findings.push({
      code: 'website_unreachable',
      label: 'Website could not be reached by the automated review',
      severity: 'high',
      evidence: `${message} A manual check is recommended before outreach.`,
      sourceUrl: safeUrl.toString(),
      metadata: { failureType, manualReviewRequired: true },
    });
    accessIssue = { type: 'unreachable', reason: message, httpStatus: null };
    status = 'partial';
  }

  let pageSpeed: PageSpeedScores | null = null;
  const finalUrl = homepage?.finalUrl || safeUrl.toString();
  if (options?.runPageSpeed !== false) {
    pageSpeed = await runPageSpeed(finalUrl, process.env.PAGESPEED_API_KEY);
    addPageSpeedFindings(pageSpeed, findings, finalUrl);
    if (pageSpeed.error) status = 'partial';
  }

  return finish({
    url: safeUrl.toString(),
    finalUrl,
    httpStatus: homepage?.httpStatus ?? null,
    title: homepage?.title ?? null,
    description: homepage?.description ?? null,
    findings,
    pageSpeed,
    status,
    pages,
    pageErrors,
    accessIssue,
  });
}

function inspectSite(pages: PageSnapshot[], findings: Finding[]) {
  const homepage = pages[0];
  inspectHomepage(homepage, findings);

  const hasAnyForm = pages.some((page) => page.hasForm);
  const hasAnyTel = pages.some((page) => page.hasTel);
  const hasAnySchema = pages.some((page) => page.hasSchema);
  const hasAnyContactLink = pages.some((page) => page.hasContactLink);
  const servicePages = pages.filter((page) => isServiceLikeUrl(page.finalUrl));

  if (!hasAnyForm) {
    findings.push({
      code: 'no_form',
      label: 'No inquiry form detected',
      severity: 'medium',
      evidence: `No form element was detected across ${pages.length} checked page${pages.length === 1 ? '' : 's'}.`,
      sourceUrl: homepage.finalUrl,
      metadata: { pagesChecked: pages.length },
    });
  }

  if (!hasAnyTel) {
    findings.push({
      code: 'phone_cta',
      label: 'No clickable phone link detected',
      severity: 'medium',
      evidence: `No tel: link was detected across ${pages.length} checked page${pages.length === 1 ? '' : 's'}.`,
      sourceUrl: homepage.finalUrl,
      metadata: { pagesChecked: pages.length },
    });
  }

  if (!hasAnySchema) {
    findings.push({
      code: 'schema',
      label: 'No JSON-LD structured data detected',
      severity: 'low',
      evidence: `No application/ld+json block was detected across ${pages.length} checked page${pages.length === 1 ? '' : 's'}.`,
      sourceUrl: homepage.finalUrl,
      metadata: { pagesChecked: pages.length },
    });
  }

  if (!hasAnyContactLink) {
    findings.push({
      code: 'weak_primary_cta',
      label: 'No clear contact or booking path detected',
      severity: 'medium',
      evidence: `The sampled navigation did not reveal an obvious contact, quote, estimate, booking, or appointment path across ${pages.length} checked page${pages.length === 1 ? '' : 's'}.`,
      sourceUrl: homepage.finalUrl,
      metadata: { pagesChecked: pages.length },
    });
  }

  if (pages.length >= 3 && servicePages.length === 0) {
    findings.push({
      code: 'service_structure',
      label: 'No dedicated service page found in the sampled site',
      severity: 'medium',
      evidence: `Webvidence checked ${pages.length} pages selected from the main navigation and did not find a clearly labeled service page.`,
      sourceUrl: homepage.finalUrl,
      metadata: { pagesChecked: pages.length },
    });
  } else if (servicePages.length > 0) {
    findings.push({
      code: 'service_structure_positive',
      label: 'Dedicated service content was detected',
      severity: 'positive',
      evidence: `${servicePages.length} sampled page${servicePages.length === 1 ? '' : 's'} appeared to be dedicated to services or offerings.`,
      sourceUrl: servicePages[0].finalUrl,
      metadata: { servicePages: servicePages.map((page) => page.finalUrl) },
    });
  }

  const missingDescriptions = pages.filter((page) => !page.description);
  if (pages.length >= 2 && missingDescriptions.length >= Math.ceil(pages.length / 2)) {
    findings.push({
      code: 'site_meta_descriptions',
      label: 'Several sampled pages are missing meta descriptions',
      severity: 'low',
      evidence: `${missingDescriptions.length} of ${pages.length} checked pages did not include a meta description.`,
      sourceUrl: missingDescriptions[0]?.finalUrl || homepage.finalUrl,
      metadata: { missingPages: missingDescriptions.map((page) => page.finalUrl) },
    });
  }

  const normalizedTitles = pages.map((page) => page.title?.trim().toLowerCase()).filter(Boolean) as string[];
  const uniqueTitles = new Set(normalizedTitles);
  if (normalizedTitles.length >= 3 && uniqueTitles.size < normalizedTitles.length) {
    findings.push({
      code: 'duplicate_titles',
      label: 'Duplicate page titles detected',
      severity: 'low',
      evidence: `${normalizedTitles.length - uniqueTitles.size + 1} sampled pages appear to reuse a page title.`,
      sourceUrl: homepage.finalUrl,
    });
  }

  if (!findings.some((finding) => finding.severity !== 'positive')) {
    findings.push({
      code: 'healthy_sample',
      label: 'No obvious problems found in the sampled pages',
      severity: 'positive',
      evidence: `The basic inspection of ${pages.length} page${pages.length === 1 ? '' : 's'} did not reveal an immediate technical or conversion problem.`,
      sourceUrl: homepage.finalUrl,
    });
  }
}

function inspectHomepage(page: PageSnapshot, findings: Finding[]) {
  if (!page.title) {
    findings.push({
      code: 'missing_title',
      label: 'Missing homepage title',
      severity: 'high',
      evidence: 'No usable <title> element was detected on the homepage.',
      sourceUrl: page.finalUrl,
    });
  } else if (page.title.length < 20 || page.title.length > 65) {
    findings.push({
      code: 'weak_title',
      label: 'Homepage title may be poorly optimized',
      severity: 'low',
      evidence: `The homepage title is ${page.title.length} characters long.`,
      sourceUrl: page.finalUrl,
    });
  }

  if (!page.description) {
    findings.push({
      code: 'meta_description',
      label: 'Missing homepage meta description',
      severity: 'medium',
      evidence: 'No meta description was detected in the homepage HTML.',
      sourceUrl: page.finalUrl,
    });
  }

  if (!/<meta[^>]+name=["']viewport["']/i.test(page.html)) {
    findings.push({
      code: 'viewport',
      label: 'Mobile viewport was not detected',
      severity: 'high',
      evidence: 'The homepage does not appear to include a viewport meta tag.',
      sourceUrl: page.finalUrl,
    });
  }

  if (page.textLength < 700) {
    findings.push({
      code: 'thin_home',
      label: 'Homepage appears thin',
      severity: 'low',
      evidence: `Only about ${page.textLength} readable characters were detected on the homepage.`,
      sourceUrl: page.finalUrl,
    });
  }

  const currentYear = new Date().getFullYear();
  const copyrightYears = Array.from(page.html.matchAll(/(?:©|copyright)[^<]{0,50}(20\d{2})/gi))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const newestCopyright = copyrightYears.length ? Math.max(...copyrightYears) : null;
  if (newestCopyright && newestCopyright <= currentYear - 3) {
    findings.push({
      code: 'old_copyright',
      label: 'Copyright year looks outdated',
      severity: 'low',
      evidence: `The newest visible copyright year detected was ${newestCopyright}.`,
      sourceUrl: page.finalUrl,
    });
  }
}

function addPageSpeedFindings(scores: PageSpeedScores, findings: Finding[], sourceUrl: string) {
  if (scores.error) {
    findings.push({
      code: 'pagespeed_unavailable',
      label: 'PageSpeed analysis was unavailable',
      severity: 'low',
      evidence: scores.error,
      sourceUrl,
    });
    return;
  }

  scoreFinding('performance', 'Mobile performance', scores.performance, findings, sourceUrl, 50, 75);
  scoreFinding('accessibility', 'Accessibility', scores.accessibility, findings, sourceUrl, 70, 90);
  scoreFinding('seo_score', 'Technical SEO', scores.seo, findings, sourceUrl, 70, 90);
  scoreFinding('best_practices', 'Web best practices', scores.bestPractices, findings, sourceUrl, 70, 90);
}

function scoreFinding(
  code: string,
  label: string,
  value: number | null,
  findings: Finding[],
  sourceUrl: string,
  highCutoff: number,
  mediumCutoff: number,
) {
  if (value === null) return;
  if (value < highCutoff) {
    findings.push({ code, label: `${label} score is weak`, severity: 'high', evidence: `Google PageSpeed returned ${value}/100 on mobile.`, sourceUrl, metadata: { score: value } });
  } else if (value < mediumCutoff) {
    findings.push({ code, label: `${label} has room to improve`, severity: 'medium', evidence: `Google PageSpeed returned ${value}/100 on mobile.`, sourceUrl, metadata: { score: value } });
  } else {
    findings.push({ code, label: `${label} tested well`, severity: 'positive', evidence: `Google PageSpeed returned ${value}/100 on mobile.`, sourceUrl, metadata: { score: value } });
  }
}

function finish(input: {
  url: string | null;
  finalUrl: string | null;
  httpStatus: number | null;
  title: string | null;
  description: string | null;
  findings: Finding[];
  pageSpeed: PageSpeedScores | null;
  status: WebsiteAudit['status'];
  pages: PageSnapshot[];
  pageErrors?: Array<{ url: string; message: string; httpStatus?: number }>;
  accessIssue?: AccessIssue | null;
}): WebsiteAudit {
  const issuePoints = input.findings.reduce((total, finding) => {
    if (finding.severity === 'high') return total + 20;
    if (finding.severity === 'medium') return total + 11;
    if (finding.severity === 'low') return total + 4;
    return total - 2;
  }, 0);
  const score = Math.max(8, Math.min(98, input.url ? 25 + issuePoints : 94));

  return {
    score,
    findings: input.findings,
    status: input.status,
    websiteUrl: input.url,
    finalUrl: input.pageSpeed?.finalUrl || input.finalUrl,
    httpStatus: input.httpStatus,
    pageTitle: input.title,
    metaDescription: input.description,
    pagesCrawled: input.pages.length,
    performanceScore: input.pageSpeed?.performance ?? null,
    accessibilityScore: input.pageSpeed?.accessibility ?? null,
    seoScore: input.pageSpeed?.seo ?? null,
    bestPracticesScore: input.pageSpeed?.bestPractices ?? null,
    raw: {
      pages: input.pages.map((page) => ({
        requestedUrl: page.requestedUrl,
        finalUrl: page.finalUrl,
        httpStatus: page.httpStatus,
        title: page.title,
        metaDescription: page.description,
        textLength: page.textLength,
        accessBlocked: page.accessBlocked,
        accessReason: page.accessReason,
      })),
      pageErrors: input.pageErrors || [],
      accessIssue: input.accessIssue || null,
      manualReviewRequired: Boolean(input.accessIssue),
      crawlLimit: MAX_PAGES,
      pagespeed: input.pageSpeed?.raw ?? null,
      pagespeedError: input.pageSpeed?.error ?? null,
    },
  };
}

async function fetchPageSnapshot(initialUrl: URL): Promise<PageSnapshot> {
  const fetched = await fetchPublicPage(initialUrl);
  const response = fetched.response;
  const contentType = response.headers.get('content-type') || '';
  const textLike = !contentType || /(?:text|html|xhtml|json|xml)/i.test(contentType);
  const statusCouldBeBlocked = [401, 403, 406, 409, 418, 429, 451, 503].includes(response.status);
  if (!textLike && !statusCouldBeBlocked) {
    throw new Error(`The page returned ${contentType || 'an unknown content type'} instead of HTML.`);
  }

  const html = textLike || statusCouldBeBlocked ? await readLimitedText(response, MAX_PAGE_BYTES) : '';
  const finalUrl = fetched.finalUrl.toString();
  const accessReason = detectAutomatedAccessBlock(response.status, html, response.headers);
  const accessBlocked = Boolean(accessReason);
  return {
    requestedUrl: initialUrl.toString(),
    finalUrl,
    httpStatus: response.status,
    html,
    title: extractTitle(html),
    description: extractMetaDescription(html),
    textLength: stripHtml(html).length,
    hasForm: !accessBlocked && /<form\b/i.test(html),
    hasTel: !accessBlocked && /href\s*=\s*["']tel:/i.test(html),
    hasSchema: !accessBlocked && /application\/ld\+json/i.test(html),
    hasContactLink: !accessBlocked && /href\s*=\s*["'][^"']*(contact|quote|estimate|book|appointment|schedule)/i.test(html),
    links: accessBlocked ? [] : extractInternalLinks(html, new URL(finalUrl)),
    accessBlocked,
    accessReason,
  };
}

export function detectAutomatedAccessBlock(status: number, html: string, headers?: Headers) {
  if (status === 429) return 'The website rate-limited the automated check with HTTP 429.';
  if ([401, 403, 406, 418, 451].includes(status)) {
    return `The website denied the automated check with HTTP ${status}.`;
  }

  const lower = html.toLowerCase();
  const server = headers?.get('server')?.toLowerCase() || '';
  const challengeMarkers = [
    'cf-chl-',
    'challenge-platform',
    'checking your browser',
    'verify you are human',
    'enable javascript and cookies to continue',
    'attention required! | cloudflare',
    '<title>just a moment',
    'just a moment...',
  ];
  const hasChallenge = challengeMarkers.some((marker) => lower.includes(marker));
  const likelyChallengePage = hasChallenge && (lower.length < 250_000 || server.includes('cloudflare'));
  if (likelyChallengePage || (status === 503 && (server.includes('cloudflare') || hasChallenge))) {
    return 'The website showed a bot-protection or browser-verification page instead of its normal content.';
  }

  return null;
}

function extractInternalLinks(html: string, base: URL) {
  const links = new Set<string>();
  const matches = html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi);
  for (const match of matches) {
    try {
      const link = new URL(decodeEntities(match[1]), base);
      if (!['http:', 'https:'].includes(link.protocol)) continue;
      if (!sameSite(link.hostname, base.hostname)) continue;
      if (link.username || link.password || link.port) continue;
      if (/\.(?:pdf|jpg|jpeg|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i.test(link.pathname)) continue;
      link.hash = '';
      link.search = '';
      const normalized = link.toString().replace(/\/$/, '') || link.origin;
      if (normalized === base.toString().replace(/\/$/, '')) continue;
      links.add(normalized);
    } catch {
      // Ignore malformed navigation links.
    }
  }
  return Array.from(links);
}

function prioritizeInternalLinks(links: string[], homepage: URL) {
  const excluded = /\/(privacy|terms|login|sign-?in|cart|checkout|wp-admin|feed|tag|author|category)(\/|$)/i;
  return [...links]
    .filter((link) => !excluded.test(new URL(link).pathname))
    .sort((a, b) => linkPriority(b, homepage) - linkPriority(a, homepage));
}

function linkPriority(value: string, homepage: URL) {
  const url = new URL(value);
  const path = url.pathname.toLowerCase();
  let score = 0;
  if (/(service|services|what-we-do|solutions|offerings)/.test(path)) score += 100;
  if (/(contact|quote|estimate|book|appointment|schedule)/.test(path)) score += 85;
  if (/(location|service-area|areas-we-serve)/.test(path)) score += 75;
  if (/(about|team|company)/.test(path)) score += 45;
  if (/(gallery|portfolio|projects|work)/.test(path)) score += 35;
  if (url.origin === homepage.origin) score += 10;
  score -= Math.min(path.split('/').filter(Boolean).length * 2, 12);
  return score;
}

function isServiceLikeUrl(value: string) {
  const path = new URL(value).pathname.toLowerCase();
  return /\/(service|services|what-we-do|solutions|offerings|repairs?|installation|cleaning|roofing|plumbing|landscaping)(\/|$|-)/i.test(path);
}

function sameSite(a: string, b: string) {
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return normalize(a) === normalize(b);
}

function extractTitle(html: string) {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return value ? decodeEntities(stripTags(value)).trim().slice(0, 300) || null : null;
}

function extractMetaDescription(html: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/name\s*=\s*["']description["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i)?.[1];
    if (content) return decodeEntities(content).trim().slice(0, 500) || null;
  }
  return null;
}

function stripHtml(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim();
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

export async function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites can be checked.');
  if (url.username || url.password) throw new Error('Website URLs containing credentials are not allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard website ports can be checked.');

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isBlockedHostname(hostname)) throw new Error('Local or internal hostnames cannot be checked.');

  const records = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateOrReservedIp(record.address))) {
    throw new Error('Private or reserved network addresses cannot be checked.');
  }
  return url;
}

async function fetchPublicPage(initialUrl: URL) {
  let current = initialUrl;
  const visited = new Set<string>();

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    current = await validatePublicUrl(current.toString());
    if (visited.has(current.toString())) throw new Error('The website redirected in a loop.');
    visited.add(current.toString());

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetchPageResponse(current);
      if (![500, 502, 503, 504].includes(response.status) || attempt === 1) break;
      await response.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!response) throw new Error('The website did not return a response.');

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get('location');
    if (!location) throw new Error('The website returned a redirect without a destination.');
    current = new URL(location, current);
  }

  throw new Error('The website redirected too many times.');
}


async function fetchPageResponse(url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WebvidenceAudit/1.1; +https://webvidence.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('The page response was too large to inspect safely.');
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('The page response was too large to inspect safely.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

function describeFetchError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'The website did not respond before the 10-second safety timeout.';
    if (/ENOTFOUND|getaddrinfo|name.*resolved/i.test(error.message)) return 'The website domain could not be resolved.';
    if (/certificate|SSL|TLS/i.test(error.message)) return 'The website could not establish a secure connection.';
    if (/too large/i.test(error.message)) return error.message;
    if (/redirect/i.test(error.message)) return error.message;
    if (/content type|instead of HTML/i.test(error.message)) return error.message;
  }
  return 'The website could not be fetched by the audit service. It may be offline, blocking automated checks, or temporarily unavailable.';
}

function classifyFetchFailure(error: unknown) {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'AbortError') return 'timeout';
  if (/ENOTFOUND|getaddrinfo|resolved/i.test(error.message)) return 'dns';
  if (/certificate|SSL|TLS/i.test(error.message)) return 'tls';
  if (/redirect/i.test(error.message)) return 'redirect';
  if (/too large/i.test(error.message)) return 'oversized';
  if (/content type|instead of HTML/i.test(error.message)) return 'non_html';
  return 'fetch';
}

function isBlockedHostname(hostname: string) {
  const exact = new Set([
    'localhost',
    'metadata',
    'metadata.google.internal',
    'kubernetes.default',
    'kubernetes.default.svc',
    'host.docker.internal',
  ]);
  if (exact.has(hostname)) return true;
  return ['.local', '.localhost', '.internal', '.home', '.lan', '.arpa'].some((suffix) => hostname.endsWith(suffix));
}

export function isPrivateOrReservedIp(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) return isPrivateOrReservedIp(normalized.slice(7));

  if (normalized.includes(':')) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('64:ff9b:')
    );
  }

  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return true;
  const octets = normalized.split('.').map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
