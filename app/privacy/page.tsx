import { MarketingHeader } from '@/components/marketing-header';
import { MarketingFooter } from '@/components/marketing-footer';

const effectiveDate = 'July 15, 2026';

export default function Privacy() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  return (
    <>
      <MarketingHeader />
      <main className="legal-page shell">
        <div className="eyebrow">Effective {effectiveDate}</div>
        <h1>Privacy Policy</h1>
        <p className="legal-intro">This policy explains what Webvidence collects, why it is used, and the choices available to account holders.</p>

        <section><h2>1. Information you provide</h2><p>We collect account details such as name, email address, authentication information handled by Supabase, workspace settings, notes, lead status, follow-up dates, outreach preferences, and drafts you create or save.</p></section>
        <section><h2>2. Business and website information</h2><p>When you run a search, Webvidence processes public business listing information such as business name, address, category, phone number, website, rating, review count, location, and provider identifiers. When a website is analyzed, Webvidence may store page URLs, titles, descriptions, HTTP status, sampled page structure, PageSpeed scores, detected findings, and timestamps.</p></section>
        <section><h2>3. Billing information</h2><p>Stripe processes payment-card and billing information. Webvidence stores limited billing identifiers and subscription status, such as Stripe customer and subscription IDs, plan, renewal period, cancellation status, and payment state. Webvidence does not store complete payment-card numbers.</p></section>
        <section><h2>4. Technical and usage information</h2><p>We collect service logs, IP-derived security signals, browser and device information, page views, referrers, request timing, errors, usage counters, provider request units, and estimated API costs. This information is used for security, rate limiting, troubleshooting, analytics, billing enforcement, and product improvement.</p></section>
        <section><h2>5. How information is used</h2><p>Information is used to create and secure accounts, run searches and analyses, save work, generate requested drafts, enforce plan limits, process subscriptions, provide support, detect abuse, monitor costs and performance, comply with law, and improve the service.</p></section>
        <section><h2>6. Service providers</h2><p>Webvidence uses service providers that may process information on our behalf, including Supabase for authentication and database services, Google Maps Platform and PageSpeed Insights for business and website information, OpenAI for requested outreach generation when enabled, Stripe for billing, and Vercel for hosting, analytics, and performance monitoring. Their handling of information is governed by their own terms and privacy policies.</p></section>
        <section><h2>7. Sharing</h2><p>We do not sell personal information. Information may be shared with service providers needed to operate Webvidence, professional advisers, authorities when legally required, or a successor in connection with a merger, financing, acquisition, or sale of the service. Public business information may be shown back to authorized users who requested the search.</p></section>
        <section><h2>8. Retention</h2><p>Account and workspace data is retained while the account is active and for a reasonable period afterward for recovery, security, billing, dispute resolution, and legal compliance. Public business records and audits may be refreshed, archived, or deleted. Provider and security logs may be retained for shorter or longer periods depending on operational and legal needs.</p></section>
        <section><h2>9. Security</h2><p>Webvidence uses access controls, server-side authorization, database row-level security, encrypted connections, rate limits, signed billing webhooks, and private-network protections. No system can guarantee absolute security, so users should use a unique password and protect account access.</p></section>
        <section><h2>10. Your choices</h2><p>You can update workspace information, archive or delete eligible saved leads, cancel a paid plan, and request account-data access or deletion. Some records may be retained when required for billing, fraud prevention, security, legal obligations, or legitimate dispute resolution.</p></section>
        <section><h2>11. Cookies and authentication</h2><p>Webvidence uses essential cookies for authentication and session security. Vercel analytics and performance tools may collect limited usage information depending on deployment settings. Browser controls can limit nonessential storage, but blocking required authentication cookies may prevent the application from working.</p></section>
        <section><h2>12. Children</h2><p>Webvidence is a business tool and is not directed to children under 13. We do not knowingly collect personal information from children under 13.</p></section>
        <section><h2>13. Changes</h2><p>We may update this policy as providers, features, or legal requirements change. The effective date will be updated when changes are posted.</p></section>
        <section><h2>14. Contact</h2><p>Privacy questions or account-data requests can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></section>
      </main>
      <MarketingFooter />
    </>
  );
}
