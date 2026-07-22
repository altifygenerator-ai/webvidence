import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireViewer();
  const params = await searchParams;
  const db = createAdminClient();
  const { data: profile } = await db
    .from('outreach_profiles')
    .select('id,name,service_description,typical_project_range,target_customer,outreach_style,base_location,preferred_channels')
    .eq('workspace_id', user.workspaceId)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  async function save(formData: FormData) {
    'use server';
    const viewer = await requireViewer();
    if (!viewer.workspaceId) throw new Error('Workspace missing.');
    const admin = createAdminClient();
    const payload = {
      workspace_id: viewer.workspaceId,
      user_id: viewer.id,
      name: String(formData.get('name') || 'Default offer').trim() || 'Default offer',
      service_description: String(formData.get('serviceDescription') || '').trim(),
      typical_project_range: String(formData.get('typicalProjectRange') || '').trim(),
      target_customer: String(formData.get('targetCustomer') || '').trim(),
      outreach_style: String(formData.get('outreachStyle') || '').trim(),
      base_location: String(formData.get('baseLocation') || '').trim(),
      preferred_channels: String(formData.get('preferredChannels') || '').trim(),
      is_default: true,
      updated_at: new Date().toISOString(),
    };

    const existingId = String(formData.get('profileId') || '');
    const result = existingId
      ? await admin.from('outreach_profiles').update(payload).eq('id', existingId).eq('workspace_id', viewer.workspaceId)
      : await admin.from('outreach_profiles').insert(payload);
    if (result.error) throw new Error('The outreach profile could not be saved.');
    redirect('/dashboard/settings?saved=1');
  }

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div><div className="eyebrow">Profile</div><h2>Outreach settings</h2></div>
        <span className="tag">{user.email}</span>
      </div>
      <p className="muted settings-intro">These details personalize who you help, where you work, pricing, and tone. They never decide whether a draft starts a conversation or uses a website finding.</p>
      {params.saved === '1' ? <div className="notice">Outreach profile saved. New drafts will use these settings.</div> : null}
      <form className="form settings-form" action={save}>
        <input type="hidden" name="profileId" value={profile?.id || ''} />
        <label><span>Profile name</span><input className="input" name="name" defaultValue={profile?.name || 'Default offer'} /></label>
        <label><span>What do you build or sell?</span><textarea className="input" name="serviceDescription" rows={4} defaultValue={profile?.service_description || ''} placeholder="Example: Clean, mobile-first websites for local service businesses, with basic local SEO and simple ongoing hosting." /></label>
        <label><span>Typical project range</span><input className="input" name="typicalProjectRange" defaultValue={profile?.typical_project_range || ''} placeholder="$500–$2,000, depending on scope" /></label>
        <label><span>Best-fit customer</span><input className="input" name="targetCustomer" defaultValue={profile?.target_customer || ''} placeholder="Active local service businesses with weak or missing websites" /></label>
        <label><span>Where are you based?</span><input className="input" name="baseLocation" defaultValue={profile?.base_location || ''} placeholder="Amity, Arkansas" /></label>
        <label><span>Preferred contact channels</span><input className="input" name="preferredChannels" defaultValue={profile?.preferred_channels || ''} placeholder="Facebook, email, text" /></label>
        <label><span>Your natural outreach style</span><textarea className="input" name="outreachStyle" rows={6} defaultValue={profile?.outreach_style || ''} placeholder="Plainspoken, local, short, one real observation, one question, no immediate hard pitch." /></label>
        <button className="btn primary">Save outreach profile</button>
      </form>
    </AppShell>
  );
}
