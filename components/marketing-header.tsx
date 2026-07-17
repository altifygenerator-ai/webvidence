import Link from 'next/link';
import { getViewer } from '@/lib/security/auth';
import { PLANS } from '@/lib/plans';

export async function MarketingHeader() {
  const viewer = await getViewer();

  return (
    <header className="site-header public-header">
      <div className="header-rail shell">
        <Link className="wordmark" href="/" aria-label="Webvidence home">
          <span>WEB</span><i>V</i><span>IDENCE</span>
        </Link>
        <div className="header-stamp">Business search + website audits<br /><b>for freelance web developers</b></div>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/#product-tour">Product</Link>
          <Link href="/scores">Scores</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          {viewer ? <Link href="/dashboard">Dashboard</Link> : <Link href="/login">Sign in</Link>}
        </nav>
        {viewer ? (
          <div className="header-account">
            <Link href="/dashboard">
              <small>Signed in</small>
              <b>{viewer.email}</b>
              <span>{PLANS[viewer.plan].name} access</span>
            </Link>
            <form action="/auth/logout" method="post">
              <button type="submit">Log out</button>
            </form>
          </div>
        ) : (
          <Link className="header-cta" href="/signup"><span>Try it free</span><b>↗</b></Link>
        )}
      </div>
    </header>
  );
}
