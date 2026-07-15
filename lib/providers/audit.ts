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

export async function auditWebsite(url: string | null, options?: { runPageSpeed?: boolean }) {
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
    });
  }

  let safeUrl: URL;
  try {
    safeUrl = await validatePublicUrl(url);
  } catch (error) {
    findings.push({
      code: 'unsafe_or_invalid_url',
      label: 'Website URL could not be safely checked',
      severity: 'high',
      evidence: error instanceof Error ? error.message : 'The website URL is invalid.',
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
      status: 'failed',
    });
  }

  let html = '';
  let finalUrl = safeUrl.toString();
  let httpStatus: number | null = null;
  let title: string | null = null;
  let description: string | null = null;
  let status: WebsiteAudit['status'] = 'completed';

  try {
    const fetched = await fetchPublicHomepage(safeUrl);
    const response = fetched.response;
    finalUrl = fetched.finalUrl.toString();
    httpStatus = response.status;
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      findings.push({
        code: 'http_error',
        label: 'Website returned an error',
        severity: 'high',
        evidence: `The homepage returned HTTP ${response.status}.`,
        sourceUrl: finalUrl,
      });
    }

    if (!contentType.toLowerCase().includes('text/html')) {
      findings.push({
        code: 'not_html',
        label: 'Homepage did not return normal HTML',
        severity: 'high',
        evidence: `The response content type was ${contentType || 'unknown'}.`,
        sourceUrl: finalUrl,
      });
      status = 'partial';
    } else {
      html = await readLimitedText(response, 2_000_000);
      title = extractTitle(html);
      description = extractMetaDescription(html);
      inspectHtml(html, finalUrl, findings, title, description);
    }
  } catch (error) {
    findings.push({
      code: 'unreachable',
      label: 'Website could not be reached',
      severity: 'high',
      evidence: error instanceof Error && error.name === 'AbortError'
        ? 'The website did not respond within 12 seconds.'
        : 'The website could not be fetched by the audit service.',
      sourceUrl: safeUrl.toString(),
    });
    status = 'failed';
  }

  let pageSpeed: PageSpeedScores | null = null;
  if (options?.runPageSpeed !== false && status !== 'failed') {
    pageSpeed = await runPageSpeed(finalUrl, process.env.PAGESPEED_API_KEY);
    addPageSpeedFindings(pageSpeed, findings, finalUrl);
    if (pageSpeed.error) status = status === 'completed' ? 'partial' : status;
  }

  return finish({
    url: safeUrl.toString(),
    finalUrl,
    httpStatus,
    title,
    description,
    findings,
    pageSpeed,
    status,
  });
}

function inspectHtml(
  html: string,
  sourceUrl: string,
  findings: Finding[],
  title: string | null,
  description: string | null,
) {
  if (!title) {
    findings.push({
      code: 'missing_title',
      label: 'Missing page title',
      severity: 'high',
      evidence: 'No usable <title> element was detected on the homepage.',
      sourceUrl,
    });
  } else if (title.length < 20 || title.length > 65) {
    findings.push({
      code: 'weak_title',
      label: 'Homepage title may be poorly optimized',
      severity: 'low',
      evidence: `The homepage title is ${title.length} characters long.`,
      sourceUrl,
    });
  }

  if (!description) {
    findings.push({
      code: 'meta_description',
      label: 'Missing meta description',
      severity: 'medium',
      evidence: 'No meta description was detected in the homepage HTML.',
      sourceUrl,
    });
  }

  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    findings.push({
      code: 'viewport',
      label: 'Mobile viewport was not detected',
      severity: 'high',
      evidence: 'The homepage does not appear to include a viewport meta tag.',
      sourceUrl,
    });
  }

  if (!/<form\b/i.test(html)) {
    findings.push({
      code: 'no_form',
      label: 'No inquiry form detected',
      severity: 'medium',
      evidence: 'No form element was detected on the homepage.',
      sourceUrl,
    });
  }

  if (!/href\s*=\s*["']tel:/i.test(html)) {
    findings.push({
      code: 'phone_cta',
      label: 'No clickable phone link detected',
      severity: 'medium',
      evidence: 'No tel: link was detected on the homepage.',
      sourceUrl,
    });
  }

  if (!/application\/ld\+json/i.test(html)) {
    findings.push({
      code: 'schema',
      label: 'No JSON-LD structured data detected',
      severity: 'low',
      evidence: 'No application/ld+json block was detected on the homepage.',
      sourceUrl,
    });
  }

  if (!/href\s*=\s*["'][^"']*(contact|quote|estimate|book|appointment)/i.test(html)) {
    findings.push({
      code: 'weak_primary_cta',
      label: 'No clear contact or booking link detected',
      severity: 'medium',
      evidence: 'The homepage HTML did not reveal an obvious contact, quote, estimate, booking, or appointment link.',
      sourceUrl,
    });
  }

  const text = stripHtml(html);
  if (text.length < 700) {
    findings.push({
      code: 'thin_home',
      label: 'Homepage appears thin',
      severity: 'low',
      evidence: `Only about ${text.length} readable characters were detected on the homepage.`,
      sourceUrl,
    });
  }

  const currentYear = new Date().getFullYear();
  const copyrightYears = Array.from(html.matchAll(/(?:©|copyright)[^<]{0,50}(20\d{2})/gi))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const newestCopyright = copyrightYears.length ? Math.max(...copyrightYears) : null;
  if (newestCopyright && newestCopyright <= currentYear - 3) {
    findings.push({
      code: 'old_copyright',
      label: 'Copyright year looks outdated',
      severity: 'low',
      evidence: `The newest visible copyright year detected was ${newestCopyright}.`,
      sourceUrl,
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: 'healthy_homepage',
      label: 'No obvious homepage problems detected',
      severity: 'positive',
      evidence: 'The basic homepage inspection did not find an immediate technical or conversion problem.',
      sourceUrl,
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
    pagesCrawled: input.url ? 1 : 0,
    performanceScore: input.pageSpeed?.performance ?? null,
    accessibilityScore: input.pageSpeed?.accessibility ?? null,
    seoScore: input.pageSpeed?.seo ?? null,
    bestPracticesScore: input.pageSpeed?.bestPractices ?? null,
    raw: {
      pagespeed: input.pageSpeed?.raw ?? null,
      pagespeedError: input.pageSpeed?.error ?? null,
    },
  };
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

async function fetchPublicHomepage(initialUrl: URL) {
  let current = initialUrl;
  const visited = new Set<string>();

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    current = await validatePublicUrl(current.toString());
    if (visited.has(current.toString())) throw new Error('The website redirected in a loop.');
    visited.add(current.toString());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; WebvidenceAudit/1.0; +https://webvidence.app)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get('location');
    if (!location) throw new Error('The website returned a redirect without a destination.');
    current = new URL(location, current);
  }

  throw new Error('The website redirected too many times.');
}

async function readLimitedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('The homepage response was too large to inspect safely.');
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
      if (total > maxBytes) throw new Error('The homepage response was too large to inspect safely.');
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
