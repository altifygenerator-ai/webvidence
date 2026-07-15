import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing-header';
import { isPaidPlan, PLANS } from '@/lib/plans';
import { planCheckoutPath, safeNextPath } from '@/lib/security/redirects';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/security/auth';

export default async function Signup({
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

  async function signup(formData: FormData) {
    'use server';
    const supabase = await createClient();
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const fullName = String(formData.get('name') || '').trim();
    const rawNext = String(formData.get('next') || '');
    const rawPlan = String(formData.get('plan') || '');
    const targetPlan = isPaidPlan(rawPlan) ? rawPlan : null;
    const destination = safeNextPath(rawNext, targetPlan ? planCheckoutPath(targetPlan) : '/dashboard');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });

    const query = new URLSearchParams({ next: destination });
    if (targetPlan) query.set('plan', targetPlan);

    if (error) {
      query.set('error', error.message);
      redirect(`/signup?${query.toString()}`);
    }
    if (data.session) redirect(destination);

    query.set('message', 'Account created. Check your email and confirm your address. After confirmation, we will return you to the plan you selected.');
    redirect(`/login?${query.toString()}`);
  }

  const loginQuery = new URLSearchParams({ next: nextPath });
  if (intendedPlan) loginQuery.set('plan', intendedPlan);

  return (
    <>
      <MarketingHeader />
      <form className="auth form" action={signup}>
        <div className="eyebrow">Free evidence account</div>
        <h2>{intendedPlan ? `Create an account for ${PLANS[intendedPlan].name}` : 'Find your first opportunity'}</h2>
        {params.message ? <div className="notice">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="plan" value={intendedPlan || ''} />
        <input className="input" name="name" placeholder="Your name" required />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <input className="input" name="password" type="password" minLength={10} placeholder="Password (10+ characters)" required />
        <button className="btn primary">Create account</button>
        <small className="muted">No card required. The free plan includes 5 local searches and 10 complete opportunity analyses each month.</small>
        <div className="auth-switch">Already have an account? <Link href={`/login?${loginQuery.toString()}`}>Sign in</Link></div>
      </form>
    </>
  );
}
