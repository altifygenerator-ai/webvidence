import Link from 'next/link';

export function MarketingFooter() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  return (
    <footer className="marketing-footer">
      <div className="shell marketing-footer-inner">
        <div><b>Webvidence</b><span>Evidence-backed prospecting for independent web sellers.</span></div>
        <nav aria-label="Legal and support">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={`mailto:${supportEmail}`}>Support</a>
        </nav>
      </div>
    </footer>
  );
}
