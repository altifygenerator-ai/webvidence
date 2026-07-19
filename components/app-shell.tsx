'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIMEZONE_OFFSET_COOKIE } from '@/lib/leads/timezone';

const nav = [
  ['Overview', '/dashboard', '01'],
  ['Find prospects', '/dashboard/campaigns', '02'],
  ['Pipeline', '/dashboard/leads', '03'],
  ['Billing', '/dashboard/billing', '04'],
  ['Settings', '/dashboard/settings', '05'],
] as const;

const quickNav = nav.slice(0, 3);

export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const router = useRouter();
  const [pipelineActionCount, setPipelineActionCount] = useState(0);

  useEffect(() => {
    let active = true;
    const offset = new Date().getTimezoneOffset();
    const cookieValue = document.cookie.split('; ').find((value) => value.startsWith(`${TIMEZONE_OFFSET_COOKIE}=`))?.split('=')[1];
    if (cookieValue !== String(offset)) {
      document.cookie = `${TIMEZONE_OFFSET_COOKIE}=${offset}; Path=/; Max-Age=31536000; SameSite=Lax`;
      router.refresh();
    }
    void fetch(`/api/leads/attention-count?tzOffset=${offset}`, { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : { count: 0 })
      .then((data) => { if (active) setPipelineActionCount(Number(data.count || 0)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const navLabel = (label: string) => (
    <span>{label}{label === 'Pipeline' && pipelineActionCount > 0 ? <b className="nav-attention-badge" aria-label={`${pipelineActionCount} pipeline actions due`}>{pipelineActionCount}</b> : null}</span>
  );

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div>
          <Link className="wordmark app-wordmark" href="/dashboard"><span>WEB</span><i>V</i><span>IDENCE</span></Link>
          <p className="sidebar-kicker">PROSPECT DESK / 01</p>
        </div>
        <nav className="app-nav">
          {nav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small>{navLabel(label)}</Link>)}
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
              {nav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small>{navLabel(label)}</Link>)}
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
        {quickNav.map(([label, href, num]) => <Link key={href} href={href}><small>{num}</small>{navLabel(label === 'Find prospects' ? 'Search' : label)}</Link>)}
        <Link href="/dashboard/settings"><small>05</small><span>Settings</span></Link>
      </nav>
    </div>
  );
}
