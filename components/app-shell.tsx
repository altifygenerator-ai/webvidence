import Link from 'next/link';

const nav = [
  ['Overview', '/dashboard', '01'],
  ['Find prospects', '/dashboard/campaigns', '02'],
  ['Pipeline', '/dashboard/leads', '03'],
  ['Billing', '/dashboard/billing', '04'],
  ['Settings', '/dashboard/settings', '05'],
];

const quickNav = nav.slice(0, 3);

export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div>
          <Link className="wordmark app-wordmark" href="/dashboard"><span>WEB</span><i>V</i><span>IDENCE</span></Link>
          <p className="sidebar-kicker">PROSPECT DESK / 01</p>
        </div>
        <nav className="app-nav">
          {nav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small><span>{label}</span></Link>)}
          {admin && <Link href="/dashboard/admin"><small>06</small><span>Admin control</span></Link>}
        </nav>
        <div className="sidebar-foot">
          <div className="workspace-status"><span className="live-dot" /> Protected workspace</div>
          <small>Searches, audits, outreach drafts, and plan access are checked on the server.</small>
          <Link className="sidebar-home" href="/">Public homepage</Link>
          <form action="/auth/logout" method="post">
            <button className="logout-button" type="submit">Log out of Webvidence</button>
          </form>
        </div>
      </aside>

      <header className="mobile-app-header">
        <Link className="wordmark mobile-app-wordmark" href="/dashboard"><span>WEB</span><i>V</i><span>IDENCE</span></Link>
        <details className="mobile-app-menu">
          <summary aria-label="Open workspace menu"><span>Menu</span><i aria-hidden="true" /></summary>
          <div className="mobile-app-menu-panel">
            <nav>
              {nav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small><span>{label}</span></Link>)}
              {admin && <Link href="/dashboard/admin"><small>06</small><span>Admin control</span></Link>}
            </nav>
            <div className="mobile-menu-foot">
              <Link href="/">Public homepage</Link>
              <form action="/auth/logout" method="post">
                <button type="submit">Log out</button>
              </form>
            </div>
          </div>
        </details>
      </header>

      <main className="app-main">
        <div className="app-topbar"><span>WEBVIDENCE OPERATIONS</span><span>Workspace / Primary</span></div>
        {children}
      </main>

      <nav className="mobile-quick-nav" aria-label="Workspace shortcuts">
        {quickNav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small><span>{label === 'Find prospects' ? 'Search' : label}</span></Link>)}
        <Link href="/dashboard/settings"><small>05</small><span>Settings</span></Link>
      </nav>
    </div>
  );
}
