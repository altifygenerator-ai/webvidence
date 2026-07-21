import type { Metadata } from 'next';
import Link from 'next/link';
import { ConversationFirstApplication } from '@/components/conversation-first-application';
import { JsonLd } from '@/components/json-ld';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { absoluteUrl, publicMetadata, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Conversation-First Outreach for Web Designers',
  description:
    'A custom outreach audit and message system for freelance web designers who want to start better conversations before pitching a website.',
  path: '/conversation-first-outreach',
  keywords: [
    'conversation first outreach',
    'web design outreach system',
    'freelance web designer sales',
    'get web design clients',
    'cold outreach for web designers',
    'web design sales consulting',
    'website outreach messages',
  ],
});

const weakOpeners = [
  'I looked at your website.',
  'Would you like a free website audit?',
  'I noticed a few SEO problems.',
  'I made you a free demo.',
];

const method = [
  {
    number: '01',
    title: 'Notice something real',
    copy: 'Use an actual post, project, service, review, truck, photo, location, or business change. Never invent a reason to message somebody.',
  },
  {
    number: '02',
    title: 'Ask one easy question',
    copy: 'Start with something the owner can answer naturally, usually about where work comes from, what they are growing, or what is keeping them busy.',
  },
  {
    number: '03',
    title: 'Learn before pitching',
    copy: 'Their answer tells you whether there is a real problem to solve. Sometimes the right move is another question. Sometimes it is not pitching at all.',
  },
  {
    number: '04',
    title: 'Introduce the offer when it fits',
    copy: 'Connect your website or marketing service to something the owner already said instead of dropping the same sales paragraph on every business.',
  },
];

const deliverables = [
  'A review of your current offer, prospecting, outreach, and follow-up process',
  'Clear rules for deciding which businesses are actually worth contacting',
  'Conversation-first opener patterns built around your services and target markets',
  'Follow-up questions for different kinds of prospect replies',
  'Natural transitions for introducing your website offer only when there is a fit',
  'Pricing, objection, no-response, and stop-contact guidance',
  'Custom AI instructions based on your real writing style and sales process',
  'A simple 30-day outreach routine you can repeat without mass automation',
  'A recorded walkthrough of the finished system',
];

const faq = [
  {
    question: 'Is this a course?',
    answer:
      'No. The beta offer is a custom audit and setup built around your services, target clients, current messages, pricing, and natural writing style.',
  },
  {
    question: 'Does this guarantee replies or clients?',
    answer:
      'No. Nobody can guarantee that a business owner will answer or buy. The goal is to make your outreach less generic, help you qualify prospects better, and give you a repeatable way to start real conversations.',
  },
  {
    question: 'Is this mass outreach automation?',
    answer:
      'No. The system is built around reviewing real businesses, using truthful observations, asking relevant questions, and deciding when not to pitch. You stay in control of every message.',
  },
  {
    question: 'Do I need Webvidence?',
    answer:
      'No. The strategy can be used with your current research process. Webvidence supports the workflow by helping find businesses, organize evidence, draft messages, and track follow-ups.',
  },
  {
    question: 'What happens after I apply?',
    answer:
      'I will review what you send and reply personally. If the beta looks like a fit, we will confirm the scope, payment, and what I need from you before any work starts.',
  },
];

export default function ConversationFirstOutreachPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  const pageUrl = absoluteUrl('/conversation-first-outreach');

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      '@id': `${pageUrl}#service`,
      name: 'Conversation-First Outreach Audit and Setup',
      description:
        'A custom outreach audit and message system for freelance web designers who want to qualify prospects and start better conversations before pitching.',
      provider: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: absoluteUrl('/'),
      },
      audience: {
        '@type': 'Audience',
        audienceType: 'Freelance web designers, independent web developers, and small web agencies',
      },
      areaServed: 'Worldwide',
      offers: {
        '@type': 'Offer',
        name: 'Founding beta setup',
        price: '149',
        priceCurrency: 'USD',
        availability: 'https://schema.org/LimitedAvailability',
        url: `${pageUrl}#apply`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Webvidence', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Conversation-First Outreach', item: pageUrl },
      ],
    },
  ];

  return (
    <>
      <JsonLd data={schema} />
      <MarketingHeader />
      <main className="conversation-page">
        <section className="conversation-hero">
          <div className="shell conversation-hero-grid">
            <div className="conversation-hero-copy">
              <div className="section-code"><span>01</span> Conversation-first outreach for web designers</div>
              <h1>Stop opening every conversation with a website pitch.</h1>
              <p className="conversation-hero-lede">
                Most “I looked at your website” messages get ignored because the business owner already knows what is coming next. Build an outreach process that asks better questions, finds real needs, and introduces your offer only when there is a reason to.
              </p>
              <div className="conversation-hero-actions">
                <a className="conversation-primary-action" href="#apply"><span>Apply for a beta setup</span><b>↗</b></a>
                <a className="conversation-text-link" href="#method">See how it works <span>↓</span></a>
              </div>
              <div className="conversation-hero-note">
                <b>Not a template pack.</b> Not mass automation. Not a promise of guaranteed clients.
              </div>
            </div>

            <div className="conversation-example-board" aria-label="Conversation-first outreach example">
              <div className="conversation-board-label">ONE BUSINESS. TWO VERY DIFFERENT OPENERS.</div>
              <article className="conversation-message weak">
                <div className="conversation-message-head"><span>Ignored opener</span><small>Pitch is obvious</small></div>
                <p>“I checked out your website and noticed a few things that may be hurting your SEO. Would you like me to send over a free audit?”</p>
                <div className="conversation-message-status">No reason to answer</div>
              </article>
              <article className="conversation-message strong">
                <div className="conversation-message-head"><span>Conversation-first</span><small>Easy to answer</small></div>
                <p>“I saw the post about the new brush clearing work. Does most of that kind of work come through Facebook, or is it mainly referrals right now?”</p>
                <div className="conversation-message-reply">
                  <small>Possible reply</small>
                  “Mostly referrals, but we are trying to get more of that kind of work.”
                </div>
              </article>
              <div className="conversation-board-foot">The question reveals whether there is a real reason to keep talking.</div>
            </div>
          </div>
        </section>

        <section className="conversation-process-strip">
          <div className="shell">
            <span>NOTICE SOMETHING REAL</span><i />
            <span>ASK ONE QUESTION</span><i />
            <span>LEARN THE NEED</span><i />
            <span>PITCH ONLY WHEN IT FITS</span>
          </div>
        </section>

        <section className="conversation-problem shell">
          <div className="conversation-problem-copy">
            <div className="section-code"><span>02</span> Why the usual outreach gets ignored</div>
            <h2>Personalized does not always mean worth answering.</h2>
            <p>
              Adding the business name and mentioning the website does not change what the owner sees. They still know a pitch is coming before the conversation has even started.
            </p>
            <p>
              The better approach is not hiding the sale. It is stopping long enough to find out whether this business has a problem you can honestly help with.
            </p>
          </div>
          <div className="conversation-weak-list">
            <small>Openers business owners see every day</small>
            {weakOpeners.map((opener, index) => (
              <div key={opener}><span>{String(index + 1).padStart(2, '0')}</span><p>“{opener}”</p><b>×</b></div>
            ))}
          </div>
        </section>

        <section id="method" className="conversation-method">
          <div className="shell">
            <div className="conversation-section-intro">
              <div>
                <div className="section-code"><span>03</span> The method</div>
                <h2>Curiosity first. Sales second.</h2>
              </div>
              <p>A simple process for learning what is actually going on before deciding whether your service belongs in the conversation.</p>
            </div>
            <div className="conversation-method-grid">
              {method.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="conversation-origin shell">
          <div className="conversation-origin-mark">REAL OUTREACH / REAL LESSONS</div>
          <div>
            <div className="section-code"><span>04</span> Why I built this</div>
            <h2>I learned it by getting ignored.</h2>
          </div>
          <div className="conversation-origin-copy">
            <p>
              I run Hometown Web Services from Amity, Arkansas. I have tested outreach with actual local service businesses, sent messages that went nowhere, changed the way I opened conversations, and paid attention to what led to real replies.
            </p>
            <p>
              Webvidence came from the same problem. Building websites has become easier. Finding good prospects and getting them to talk to you has not.
            </p>
          </div>
        </section>

        <section className="conversation-offer">
          <div className="shell conversation-offer-grid">
            <div className="conversation-offer-copy">
              <div className="section-code"><span>05</span> Founding beta offer</div>
              <h2>Your own conversation-first outreach system.</h2>
              <p>
                I will review what you sell, who you target, how you currently reach out, what happens after somebody replies, and where the process keeps falling apart. Then I will build a practical system around your actual business.
              </p>
              <div className="conversation-input-list">
                <small>Built from your</small>
                <span>Services</span><span>Target markets</span><span>Pricing</span><span>Portfolio</span><span>Natural voice</span><span>Current messages</span>
              </div>
            </div>

            <article className="conversation-offer-card">
              <div className="conversation-offer-card-head">
                <div><small>CONVERSATION-FIRST OUTREACH</small><h3>Audit + custom setup</h3></div>
                <span>5 BETA SPOTS</span>
              </div>
              <ul>
                {deliverables.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="conversation-offer-price">
                <div><small>Founding beta price</small><strong>$149</strong></div>
                <p>One-time. Scope is confirmed before payment. No subscription required.</p>
              </div>
              <a className="conversation-primary-action full" href="#apply"><span>Apply for a spot</span><b>↗</b></a>
            </article>
          </div>
        </section>

        <section className="conversation-fit shell">
          <div className="conversation-fit-column good">
            <div className="section-code"><span>06</span> This is for</div>
            <h2>Web designers who can do the work but need a better way to start conversations.</h2>
            <ul>
              <li>You sell websites, redesigns, SEO cleanup, maintenance, or related services.</li>
              <li>You are tired of competing under the same “I need a website” posts.</li>
              <li>Your messages feel generic even after you personalize them.</li>
              <li>You want a process you can use yourself, not a mass-sending machine.</li>
            </ul>
          </div>
          <div className="conversation-fit-column bad">
            <div className="section-code"><span>07</span> This is not for</div>
            <h2>People looking for a secret script that guarantees clients.</h2>
            <ul>
              <li>Anyone trying to blast thousands of automated messages.</li>
              <li>Anyone who wants fake personalization or made-up observations.</li>
              <li>Anyone expecting guaranteed replies, rankings, revenue, or clients.</li>
              <li>Anyone unwilling to review the business and think before pitching.</li>
            </ul>
          </div>
        </section>

        <section className="conversation-webvidence-link">
          <div className="shell conversation-webvidence-grid">
            <div>
              <div className="section-code"><span>08</span> The method and the software</div>
              <h2>Strategy tells you what to do. Webvidence helps you do it.</h2>
              <p>
                The custom system covers prospect judgment, questions, replies, transitions, and follow-up. Webvidence supports the daily work by finding businesses, checking their public presence, organizing evidence, preparing drafts, and keeping the next action visible.
              </p>
              <Link className="conversation-text-link light" href="/#product-tour">See how Webvidence works <span>↗</span></Link>
            </div>
            <div className="conversation-workflow-list">
              {[
                'Find businesses worth reviewing',
                'Choose the strongest reason to start a conversation',
                'Draft an opener in your own voice',
                'Track the reply and ask the next useful question',
                'Introduce the offer only when a need is clear',
              ].map((item, index) => (
                <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section id="apply" className="conversation-apply shell">
          <div className="conversation-apply-copy">
            <div className="section-code"><span>09</span> Apply for the beta</div>
            <h2>Show me what you are doing now.</h2>
            <p>
              Tell me what you sell, who you want to reach, and where outreach keeps breaking down. I will review it personally and let you know whether this beta is a good fit.
            </p>
            <div className="conversation-apply-promise">
              <b>No pressure and no automatic checkout.</b>
              <span>The application opens in your email app so you can review it before sending.</span>
            </div>
          </div>
          <ConversationFirstApplication supportEmail={supportEmail} />
        </section>

        <section className="conversation-faq">
          <div className="shell">
            <div className="conversation-section-intro">
              <div><div className="section-code"><span>10</span> Straight answers</div><h2>Before you apply.</h2></div>
            </div>
            <div className="conversation-faq-list">
              {faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}<span>+</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="conversation-final">
          <div className="shell conversation-final-inner">
            <div>
              <div className="section-code"><span>11</span> Better conversations start before the pitch</div>
              <h2>Stop sending the same website message everybody else is sending.</h2>
              <p>Build a process that helps you notice more, ask better questions, and know when your offer actually belongs in the conversation.</p>
            </div>
            <a className="conversation-primary-action large" href="#apply"><span>Apply for a beta setup</span><b>↗</b></a>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
