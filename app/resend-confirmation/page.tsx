import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MarketingHeader } from '@/components/marketing-header';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security/redirects';

export default async function ResendConfirmation({ searchParams }: { searchParams: Promise<{ message?: string; error?: string; next?: string }> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next, '/dashboard');

  async function resend(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '').trim();
    const destination = safeNextPath(String(formData.get('next') || ''), '/dashboard');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(destination)}` },
    });
    const query = new URLSearchParams({ next: destination });
    if (error) query.set('error', error.message);
    else query.set('message', 'A new confirmation email has been sent. Check spam or promotions if it does not appear soon.');
    redirect(`/resend-confirmation?${query.toString()}`);
  }

  return (
    <>
      <MarketingHeader />
      <form className="auth form" action={resend}>
        <div className="eyebrow">Email confirmation</div>
        <h2>Send a new confirmation link</h2>
        {params.message ? <div className="notice">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        <input type="hidden" name="next" value={nextPath} />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <button className="btn primary">Resend confirmation</button>
        <div className="auth-switch"><Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Back to sign in</Link></div>
      </form>
    </>
  );
}
