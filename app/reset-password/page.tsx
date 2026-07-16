import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MarketingHeader } from '@/components/marketing-header';
import { createClient } from '@/lib/supabase/server';

import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata('Choose a new password', 'Choose a new Webvidence account password.', '/reset-password');

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/forgot-password?error=Open+the+reset+link+from+your+email+before+choosing+a+new+password.');

  async function updatePassword(formData: FormData) {
    'use server';
    const password = String(formData.get('password') || '');
    const confirm = String(formData.get('confirm') || '');
    if (password.length < 10) redirect('/reset-password?error=Use+at+least+10+characters.');
    if (password !== confirm) redirect('/reset-password?error=The+passwords+do+not+match.');
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    await client.auth.signOut();
    redirect('/login?message=Password+updated.+Sign+in+with+your+new+password.');
  }

  return (
    <>
      <MarketingHeader />
      <form className="auth form" action={updatePassword}>
        <div className="eyebrow">Account recovery</div>
        <h2>Choose a new password</h2>
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        <input className="input" name="password" type="password" minLength={10} placeholder="New password (10+ characters)" required />
        <input className="input" name="confirm" type="password" minLength={10} placeholder="Confirm new password" required />
        <button className="btn primary">Update password</button>
      </form>
    </>
  );
}
