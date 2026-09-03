import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('retention security and delivery boundaries', () => {
  it('requires the configured Bearer cron secret on both cron routes', () => {
    const retention = source('app/api/cron/retention/route.ts');
    const audits = source('app/api/cron/audits/route.ts');
    expect(retention).toContain("req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`");
    expect(audits).toContain("authorization !== `Bearer ${secret}`");
  });

  it('rechecks reminder preferences and claims a unique delivery before Resend', () => {
    const reminders = source('lib/jobs/retention.ts');
    const prefCheck = reminders.indexOf("if (!current?.reminder_emails_enabled || current.unsubscribed_at) return 0");
    const claim = reminders.indexOf("db.from('reminder_deliveries').insert");
    const send = reminders.indexOf("fetch('https://api.resend.com/emails'");
    expect(prefCheck).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(prefCheck);
    expect(send).toBeGreaterThan(claim);
    expect(reminders).toContain("List-Unsubscribe");
  });


  it('uses the real signed unsubscribe route and disables both reminder preference columns', () => {
    const reminders = source('lib/jobs/retention.ts');
    const unsubscribe = source('app/api/reminders/unsubscribe/route.ts');
    const routine = source('app/api/routine/route.ts');
    expect(reminders).toContain("makeReminderUnsubscribeToken");
    expect(reminders).not.toContain("@/lib/retention/unsubscribe");
    expect(reminders).toContain("/api/reminders/unsubscribe?u=${encodeURIComponent(routine.user_id)}&sig=${encodeURIComponent(unsubscribeSignature)}");
    expect(reminders).toContain('/dashboard/settings#routine');
    expect(unsubscribe).toContain('reminder_email_enabled: false');
    expect(unsubscribe).toContain('reminder_emails_enabled: false');
    expect(unsubscribe).toContain('unsubscribed_at: now');
    expect(routine).toContain('unsubscribed_at: input.reminderEmailEnabled ? null');
  });

  it('clears stale contact paths immediately when the website is corrected', () => {
    const websiteRoute = source('app/api/leads/website/route.ts');
    expect(websiteRoute).toContain("db.from('lead_contact_paths')");
    expect(websiteRoute).toContain(".eq('workspace_id', user.workspaceId)");
  });

  it('keeps reminder and session analytics free of message/reply body content', () => {
    const reminders = source('lib/jobs/retention.ts');
    const sessions = source('lib/retention/session.ts');
    expect(reminders).not.toContain('body: input.');
    expect(sessions).not.toContain('messageBody');
    expect(sessions).not.toContain('replyBody');
  });
});
