import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing-header';
import { isPaidPlan, PLANS } from '@/lib/plans';
import { planCheckoutPath, safeNextPath } from '@/lib/security/redirects';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/security/auth';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; plan?: string; next?: string }>;
}) {
  const params = await searchParams;
  const intendedPlan = isPaidPlan(params.plan) ? params.plan : null;
  const fallback = intendedPlan ? planCheckoutPath(intendedPlan) : '/dashboard';
  const nextPath = safeNextPath(params.next, fallback);
  const viewer = await getViewer();
  if (viewer) redirect(nextPath);

  async function login(formData: FormData) {
    'use server';
    const supabase = await createClient();
    const rawNext = String(formData.get('next') || '');
    const rawPlan = String(formData.get('plan') || '');
    const targetPlan = isPaidPlan(rawPlan) ? rawPlan : null;
    const destination = safeNextPath(rawNext, targetPlan ? planCheckoutPath(targetPlan) : '/dashboard');

    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get('email') || '').trim(),
      password: String(formData.get('password') || ''),
    });

    if (!error) redirect(destination);

    const message = error.message.toLowerCase().includes('email not confirmed')
      ? 'Your email is not confirmed yet. Open the confirmation email from Webvidence, then sign in again.'
      : error.message;
    const query = new URLSearchParams({ error: message, next: destination });
    if (targetPlan) query.set('plan', targetPlan);
    redirect(`/login?${query.toString()}`);
  }

  const signupQuery = new URLSearchParams({ next: nextPath });
  if (intendedPlan) signupQuery.set('plan', intendedPlan);

  return (
    <>
      <MarketingHeader />
      <form className="auth form" action={login}>
        <div className="eyebrow">Welcome back</div>
        <h2>{intendedPlan ? `Sign in to choose ${PLANS[intendedPlan].name}` : 'Open your desk'}</h2>
        {params.message ? <div className="notice">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="plan" value={intendedPlan || ''} />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <input className="input" name="password" type="password" placeholder="Password" required />
        <button className="btn primary">Sign in</button>
        <div className="auth-switch">Need an account? <Link href={`/signup?${signupQuery.toString()}`}>Create one</Link></div>
      </form>
    </>
  );
}
