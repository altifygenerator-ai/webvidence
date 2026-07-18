import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { absoluteUrl, publicMetadata, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Web Design Prospecting FAQ',
  description: 'Straight answers about how Webvidence finds businesses, audits websites, scores opportunities, handles outreach, and limits free and paid accounts.',
  path: '/faq',
  keywords: [
    'Webvidence FAQ',
    'web design prospecting tool',
    'find local web design clients',
    'website audit lead generation',
    'web design outreach software',
  ],
});

const faqs = [
  {
    question: 'What does Webvidence actually do?',
    answer: 'You enter a type of business, a location, and a search radius. Webvidence finds public business listings in that area, checks the websites attached to those listings, records useful findings, and ranks the businesses so you can decide which ones may be worth contacting.',
  },
  {
    question: 'Who is Webvidence made for?',
    answer: 'It is built mainly for freelance web designers, web developers, small studios, and local SEO providers who sell website work to local businesses.',
  },
  {
    question: 'Does Webvidence send cold emails or messages automatically?',
    answer: 'No. Webvidence can help draft an opener, email, text, or follow-up based on the saved findings, but you review, edit, and send the message yourself.',
  },
  {
    question: 'Where do the business results come from?',
    answer: 'Business names, addresses, phone numbers, ratings, review counts, websites, and map links are pulled through Google Maps Platform services. Website findings come from Webvidence checking public pages on the business website and running a mobile PageSpeed test when available.',
  },
  {
    question: 'How far can I search from a location?',
    answer: 'You can search around a city or postal code worldwide. Add the state or province when needed, choose the country, and select a radius. Results depend on what Google returns for that category and market, so a search is a useful prospect list rather than a promise that every business in the radius will appear.',
  },
  {
    question: 'How does Webvidence choose which businesses to show?',
    answer: 'Mixed search checks several parts of the selected radius, combines the matching listings, removes duplicates, and rotates in businesses that are not already saved in that campaign. You can also choose Hidden opportunities, Best Google matches, or Closest first. It is still based on businesses returned by Google, so it cannot guarantee every business in the market.',
  },
  {
    question: 'How many pages does the website audit check?',
    answer: 'Webvidence checks the homepage and can sample up to five useful internal pages. It gives priority to pages such as services, contact, booking, locations, about, and project pages when those links are available.',
  },
  {
    question: 'What does the opportunity score mean?',
    answer: 'A higher score means Webvidence found more reasons the business may be worth reviewing as a website opportunity. It is not a grade of the business and it does not guarantee the business will buy. The score combines website findings with a small activity boost based on Google review count.',
  },
  {
    question: 'Is a low score bad?',
    answer: 'Not for the business. A lower opportunity score usually means the sampled site tested fairly well or Webvidence did not find many obvious issues. It may simply be a lower-priority prospect for a redesign pitch.',
  },
  {
    question: 'Are the audit findings always correct?',
    answer: 'No automated audit is perfect. Websites can block checks, load content through scripts, hide features from the sampled pages, or change after an audit. Every finding includes evidence so you can verify it before contacting the business.',
  },
  {
    question: 'What happens when a website is offline or blocks the audit?',
    answer: 'Webvidence records that the website could not be reached and explains the type of problem when possible. A blocked or unreachable site can still be useful information, but it should be reviewed manually before you mention it in outreach.',
  },
  {
    question: 'What is included in the free plan?',
    answer: 'The current free plan includes 5 local searches, 10 charged website analyses, 20 outreach drafts, 5 active campaigns, and room for 50 open saved leads each month. A business with no website does not use a charged website-analysis credit.',
  },
  {
    question: 'How does the 7-day Freelancer trial work?',
    answer: 'Eligible new accounts can start the Freelancer plan with a card and use the full plan for 7 days. Stripe charges $39 per month when the trial ends unless you cancel first. The trial is available once per account and is not added to Starter or Studio checkout.',
  },
  {
    question: 'Can I cancel a paid plan or trial?',
    answer: 'Yes. Open the Stripe billing portal from the account area to cancel. A trial can be canceled before the first charge. Paid access normally continues through the end of the period already paid for.',
  },
  {
    question: 'Can another user see my searches or leads?',
    answer: 'Normal accounts are separated by workspace. Server-side authorization and Supabase row-level security are used to keep searches, leads, audits, notes, and drafts inside the correct account.',
  },
  {
    question: 'Does Webvidence guarantee clients or replies?',
    answer: 'No. It shortens the research process and gives you factual starting points. Your offer, pricing, communication, market, timing, and follow-up still determine whether a prospect replies or becomes a client.',
  },
];

export default function FAQPage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${absoluteUrl('/faq')}#faq`,
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'FAQ', item: absoluteUrl('/faq') },
    ],
  };

  return (
    <>
      <JsonLd data={[faqSchema, breadcrumbSchema]} />
      <MarketingHeader />
      <main className="resource-page shell">
        <header className="resource-hero">
          <div className="section-code"><span>01</span> Straight answers</div>
          <h1>Webvidence FAQ</h1>
          <p>What it finds, how the audit works, what the score means, and what the tool does not promise.</p>
        </header>

        <div className="faq-layout">
          <aside className="resource-aside">
            <div className="resource-aside-block">
              <span>Need the score breakdown?</span>
              <p>See the actual points used by the audit and how Google review activity affects the final opportunity score.</p>
              <Link className="text-link" href="/scores">How scoring works <span>↗</span></Link>
            </div>
            <div className="resource-aside-block">
              <span>Looking for the longer guides?</span>
              <p>Read practical notes on finding clients, reviewing websites, outreach, and follow-up without turning this site into a wall of blog posts.</p>
              <Link className="text-link" href="/articles">Browse articles <span>↗</span></Link>
            </div>
          </aside>
          <section className="faq-list" aria-label="Frequently asked questions">
            {faqs.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary><span>{String(index + 1).padStart(2, '0')}</span>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </section>
        </div>

        <section className="resource-cta">
          <div><small>Ready to test it?</small><h2>Run a real search before deciding.</h2></div>
          <Link className="action primary" href="/signup"><span>Open a free account</span><b>↗</b></Link>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
