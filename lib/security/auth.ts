import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { env, flags } from '@/lib/env';
import type { PlanId } from '@/lib/plans';

export type Viewer = {
  id: string;
  email: string;
  plan: PlanId;
  isAdmin: boolean;
  workspaceId: string | null;
};

export async function getViewer(): Promise<Viewer | null> {
  if (flags.demo && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      id: 'demo-user',
      email: env.ADMIN_EMAIL,
      plan: 'admin',
      isAdmin: true,
      workspaceId: 'demo-workspace',
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan,is_admin,workspace_id,suspended_at')
    .eq('id', user.id)
    .single();

  if (!profile || profile.suspended_at) return null;

  const email = user.email || '';
  return {
    id: user.id,
    email,
    plan: (profile.plan || 'free') as PlanId,
    isAdmin: profile.is_admin === true || email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase(),
    workspaceId: profile.workspace_id || null,
  };
}

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) redirect('/dashboard');
  return viewer;
}
