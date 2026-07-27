-- WEBVIDENCE 008: WEBSITE SOURCE AND USER CORRECTION
-- Safe and additive. Run after 007_conversation_workflow.sql.
-- Adds explicit website provenance so a missing Google link is not presented as proof that no site exists.

begin;

alter table public.leads
  add column if not exists website_source text,
  add column if not exists website_verification_status text,
  add column if not exists website_updated_by_user_at timestamptz;

alter table public.leads
  drop constraint if exists leads_website_source_check;

alter table public.leads
  add constraint leads_website_source_check
  check (website_source is null or website_source in ('google_places', 'user'));

alter table public.leads
  drop constraint if exists leads_website_verification_status_check;

alter table public.leads
  add constraint leads_website_verification_status_check
  check (
    website_verification_status is null or website_verification_status in (
      'google_linked',
      'user_confirmed',
      'not_linked'
    )
  );

update public.leads
set
  website_source = coalesce(website_source, 'google_places'),
  website_verification_status = coalesce(
    website_verification_status,
    case when website is null then 'not_linked' else 'google_linked' end
  )
where website_source is null
   or website_verification_status is null;

-- Correct previously stored no-site audits. Older builds treated a missing
-- Google website field as strong proof that the business had no website.
update public.audit_findings
set
  label = 'No website linked on the Google listing',
  severity = 'medium',
  evidence = 'Google did not return a website for this business listing. The business may still have a website elsewhere.'
where code = 'no_site';

update public.audits as audit
set score = least(
  100,
  58 + case
    when coalesce(lead.reviews, 0) >= 100 then 5
    when coalesce(lead.reviews, 0) >= 40 then 3
    when coalesce(lead.reviews, 0) >= 10 then 1
    else 0
  end
)
from public.leads as lead
where audit.lead_id = lead.id
  and lead.website is null
  and exists (
    select 1
    from public.audit_findings as finding
    where finding.audit_id = audit.id
      and finding.code = 'no_site'
  );

update public.leads as lead
set
  opportunity_score = least(
    100,
    58 + case
      when coalesce(lead.reviews, 0) >= 100 then 5
      when coalesce(lead.reviews, 0) >= 40 then 3
      when coalesce(lead.reviews, 0) >= 10 then 1
      else 0
    end
  ),
  status = case
    when lead.status in ('new', 'reviewing', 'ready_to_contact') then 'reviewing'
    else lead.status
  end,
  updated_at = now()
where lead.website is null
  and exists (
    select 1
    from public.audits as audit
    join public.audit_findings as finding on finding.audit_id = audit.id
    where audit.lead_id = lead.id
      and finding.code = 'no_site'
  );

alter table public.leads
  alter column website_source set default 'google_places',
  alter column website_verification_status set default 'not_linked';

create index if not exists leads_website_verification_idx
  on public.leads(workspace_id, website_verification_status);

commit;

-- Rollback notes:
-- Drop leads_website_verification_idx, then drop website_updated_by_user_at,
-- website_verification_status, and website_source. Export user-corrected website
-- provenance first if the feature has already been used.
