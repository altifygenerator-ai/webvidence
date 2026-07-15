import { MarketingHeader } from '@/components/marketing-header';
import { MarketingFooter } from '@/components/marketing-footer';

const effectiveDate = 'July 15, 2026';

export default function Terms() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  return (
    <>
      <MarketingHeader />
      <main className="legal-page shell">
        <div className="eyebrow">Effective {effectiveDate}</div>
        <h1>Terms of Service</h1>
        <p className="legal-intro">These terms govern use of Webvidence, including the business search, website analysis, saved lead, outreach drafting, billing, and account features.</p>

        <section><h2>1. Account use</h2><p>You must provide accurate account information, keep your login secure, and be legally able to enter this agreement. You are responsible for activity under your account and for promptly telling us about unauthorized access.</p></section>
        <section><h2>2. What Webvidence provides</h2><p>Webvidence helps users locate public business information, inspect publicly reachable websites, organize prospects, and draft outreach based on detected evidence. Search results, website findings, scores, contact details, and generated drafts may be incomplete, delayed, or wrong. You must review them before acting.</p></section>
        <section><h2>3. No guarantee of clients or results</h2><p>Webvidence does not guarantee replies, sales, rankings, revenue, client quality, or the accuracy or continued availability of any business listing or website. Opportunity scores are research aids, not promises or professional evaluations.</p></section>
        <section><h2>4. Acceptable use</h2><p>You may not use Webvidence to harass people, misrepresent your identity, send unlawful or deceptive messages, violate opt-outs, scrape restricted systems, access private networks, evade usage limits, interfere with the service, or resell data in violation of a provider’s terms. You are responsible for following laws and platform rules that apply to your outreach, including email, text, privacy, and consumer-protection requirements.</p></section>
        <section><h2>5. Public business data and third parties</h2><p>Some business information comes from third-party providers such as Google Maps Platform. Website analysis is based on public pages reachable at the time of the check. Third-party services have their own terms, availability, and data practices. Webvidence may remove, refresh, limit, or stop showing third-party information when required.</p></section>
        <section><h2>6. Outreach drafts</h2><p>Generated drafts are suggestions. You must verify every observation, recipient, claim, and contact method. Webvidence does not send outreach automatically in the current product. You remain responsible for messages you copy, edit, send, or record as sent.</p></section>
        <section><h2>7. Plans, limits, and fair use</h2><p>Plans include stated monthly limits for searches, analyses, drafts, campaigns, saved leads, exports, and team access. Limits reset according to the billing or usage period shown in the product. We may apply reasonable rate limits and abuse controls to protect users, providers, and service availability. Attempts to bypass plan limits may lead to suspension or termination.</p></section>
        <section><h2>8. Subscriptions, cancellation, and refunds</h2><p>Paid plans renew automatically until canceled. Prices and billing periods are shown before checkout. You can manage or cancel a subscription through the billing portal. Cancellation normally takes effect at the end of the paid period. Except where required by law or expressly stated otherwise, charges already paid are nonrefundable.</p></section>
        <section><h2>9. Your content</h2><p>You retain ownership of notes, outreach settings, and other content you enter. You grant Webvidence permission to process that content only as needed to operate, secure, support, and improve the service. Do not upload confidential information you do not have permission to use.</p></section>
        <section><h2>10. Suspension and termination</h2><p>We may suspend or terminate access for nonpayment, abuse, security threats, unlawful use, repeated provider complaints, or material violations of these terms. You may stop using the service at any time. Data may be retained or deleted according to the Privacy Policy and legal requirements.</p></section>
        <section><h2>11. Service availability and disclaimers</h2><p>The service is provided “as is” and “as available.” To the fullest extent permitted by law, Webvidence disclaims implied warranties, including merchantability, fitness for a particular purpose, noninfringement, and uninterrupted or error-free operation.</p></section>
        <section><h2>12. Limitation of liability</h2><p>To the fullest extent permitted by law, Webvidence will not be liable for indirect, incidental, special, consequential, exemplary, or lost-profit damages arising from the service, outreach activity, third-party data, or inability to use the service. Webvidence’s total liability for a claim will not exceed the amount you paid for the service during the three months before the event giving rise to the claim.</p></section>
        <section><h2>13. Changes</h2><p>We may update these terms as the product changes. Material changes will be posted with a new effective date and, when appropriate, communicated through the service or account email. Continued use after the effective date means you accept the updated terms.</p></section>
        <section><h2>14. Contact</h2><p>Questions about these terms can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></section>
      </main>
      <MarketingFooter />
    </>
  );
}
