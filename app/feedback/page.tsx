import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/feedback-form';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { getViewer } from '@/lib/security/auth';
import { privateMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = privateMetadata(
  'Share Feedback',
  'Tell Webvidence what has helped, what still gets in the way, and whether the workflow has led to outreach, replies, calls, proposals, or paid work.',
  '/feedback',
);

export default async function FeedbackPage() {
  const viewer = await getViewer();

  return (
    <>
      <MarketingHeader />
      <main className="feedback-page">
        <div className="shell feedback-layout">
          <aside className="feedback-intro">
            <div className="section-code"><span>FEEDBACK</span> Product check-in</div>
            <h1>Tell me what is actually working.</h1>
            <p>I want to know whether Webvidence is helping with the real job: finding businesses worth contacting, preparing outreach, keeping the work organized, and turning that effort into conversations.</p>
            <div className="feedback-brief">
              <div><b>2–4 minutes</b><span>Most questions are quick choices.</span></div>
              <div><b>Straight answers</b><span>Negative feedback is useful too.</span></div>
              <div><b>Your permission</b><span>Nothing is quoted publicly unless you allow it.</span></div>
            </div>
          </aside>
          <div className="feedback-form-column">
            <FeedbackForm defaultEmail={viewer?.email || ''} />
          </div>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
