# Webvidence SEO and Google Search Console setup

Canonical production URL: `https://www.webvidence.app`

## Before deploying

1. In Vercel, make `www.webvidence.app` the primary production domain.
2. Keep `webvidence.app` connected so it can redirect to the `www` domain.
3. Set `NEXT_PUBLIC_APP_URL=https://www.webvidence.app` in the Vercel Production environment.
4. Set `NEXT_PUBLIC_SUPPORT_EMAIL` to the real support address.
5. Redeploy after changing environment variables.

The code also contains a permanent host redirect from `webvidence.app` to `www.webvidence.app`.

## Public SEO URLs

After deployment, verify these return HTTP 200:

- `https://www.webvidence.app/`
- `https://www.webvidence.app/pricing`
- `https://www.webvidence.app/faq`
- `https://www.webvidence.app/scores`
- `https://www.webvidence.app/terms`
- `https://www.webvidence.app/privacy`
- `https://www.webvidence.app/sitemap.xml`
- `https://www.webvidence.app/robots.txt`
- `https://www.webvidence.app/opengraph-image`

## Add Google Search Console

1. Open Google Search Console.
2. Add a **Domain property** using `webvidence.app` without `https://` or `www`.
3. Add the DNS TXT record Google provides at the DNS host.
4. Wait for DNS to update, then verify the property.
5. Open **Sitemaps** and submit `https://www.webvidence.app/sitemap.xml`.
6. Use **URL inspection** on the homepage, pricing, FAQ, and scores pages.
7. Request indexing after the deployed pages are visible to Google.

Domain verification is preferred. If HTML-tag verification is used instead, copy only the verification token into the Vercel environment variable `GOOGLE_SITE_VERIFICATION` and redeploy.

## Structured data checks

Test these deployed pages with Google's Rich Results Test and Schema.org Validator:

- Homepage: Organization, WebSite, WebPage, software application details and offers
- Pricing: software offers and BreadcrumbList
- FAQ: FAQPage and BreadcrumbList
- Scores: WebPage and BreadcrumbList
- Terms and Privacy: WebPage and BreadcrumbList

No ratings or reviews are fabricated in the schema. A software-app rich result may not be available until genuine review data exists, but the markup still describes the application and plans.

## Indexing rules

The sitemap contains only public marketing and legal pages. Dashboard, API, auth callback, and logout routes are blocked in robots.txt. Login, signup, confirmation, and password-recovery pages include `noindex` metadata.
