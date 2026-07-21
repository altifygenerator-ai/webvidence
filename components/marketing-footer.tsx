import Link from 'next/link';

export function MarketingFooter() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  return (
    <footer className="marketing-footer">
      <div className="shell marketing-footer-inner">
        <div className="footer-brand">
          <Link className="wordmark footer-wordmark" href="/" aria-label="Webvidence home">
            <span>WEB</span><i>V</i><span>IDENCE</span>
          </Link>
          <p>Find local businesses, check the website, and keep the better opportunities organized.</p>
        </div>
        <div className="footer-links">
          <div><b>Product</b><Link href="/#product-tour">How it works</Link><Link href="/conversation-first-outreach">Outreach system</Link><Link href="/scores">Scores</Link><Link href="/pricing">Pricing</Link></div>
          <div><b>Help</b><Link href="/faq">FAQ</Link><Link href="/articles">Articles</Link><a href={`mailto:${supportEmail}`}>Support</a></div>
          <div><b>Legal</b><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
        </div>
      </div>
      <div className="shell footer-bottom"><span>© 2026 Webvidence</span><span>Built for independent web sellers.</span></div>
    </footer>
  );
}
