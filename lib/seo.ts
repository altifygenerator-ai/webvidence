import type { Metadata } from 'next';

export const SITE_URL = 'https://www.webvidence.app';
export const SITE_NAME = 'Webvidence';
export const DEFAULT_TITLE = 'Webvidence | Find Web Design Clients With Real Website Evidence';
export const DEFAULT_DESCRIPTION = 'Find local businesses, audit their websites, rank the strongest web design opportunities, and write outreach based on real findings.';

export const PUBLIC_KEYWORDS = [
  'find web design clients',
  'web design lead generation',
  'local business prospecting',
  'website audit tool for freelancers',
  'find businesses that need websites',
  'freelance web developer clients',
  'website redesign leads',
  'Google Maps prospecting',
  'web design outreach',
];

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString();
}

export function publicMetadata(options: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: 'website' | 'article';
}): Metadata {
  const url = absoluteUrl(options.path);
  return {
    title: options.title,
    description: options.description,
    keywords: options.keywords || PUBLIC_KEYWORDS,
    alternates: { canonical: url },
    openGraph: {
      type: options.type || 'website',
      url,
      siteName: SITE_NAME,
      title: options.title,
      description: options.description,
      images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630, alt: `${SITE_NAME} evidence-backed prospecting` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: options.title,
      description: options.description,
      images: [absoluteUrl('/twitter-image')],
    },
  };
}

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      noarchive: true,
    },
  },
};

export function privateMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    ...noIndexMetadata,
  };
}
