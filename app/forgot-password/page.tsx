import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MarketingHeader } from '@/components/marketing-header';
import { createClient } from '@/lib/supabase/server';

import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata('Reset password', 'Request a Webvidence password reset link.', '/forgot-password');

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;

  async function sendReset(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '').trim();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });
    const query = new URLSearchParams();
    if (error) query.set('error', error.message);
    else query.set('message', 'If an account exists for that email, a password reset link has been sent.');
    redirect(`/forgot-password?${query.toString()}`);
  }

  return (
    <>
      <MarketingHeader />
      <form className="auth form" action={sendReset}>
        <div className="eyebrow">Account recovery</div>
        <h2>Reset your password</h2>
        <p className="muted">Enter the email used for your Webvidence account.</p>
        {params.message ? <div className="notice">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        <input className="input" name="email" type="email" placeholder="Email" required />
        <button className="btn primary">Send reset link</button>
        <div className="auth-switch"><Link href="/login">Back to sign in</Link></div>
      </form>
    </>
  );
}
