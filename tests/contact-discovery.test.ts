import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverPublicContactPaths } from '@/lib/providers/audit';

describe('public contact-path discovery', () => {
  it('uses only public website evidence and recognizes supported contact paths', () => {
    const paths = discoverPublicContactPaths([{
      finalUrl: 'https://shop.example.net/contact',
      accessBlocked: false,
      html: `<html><body>
        <a href="mailto:hello@shop.example.net?subject=Hi">Email</a>
        <a href="tel:+1 (501) 555-0100">Call</a>
        <a href="https://facebook.com/shop.example">Facebook</a>
        <a href="https://instagram.com/shop.example">Instagram</a>
        <a href="https://linkedin.com/company/shop-example">LinkedIn</a>
        <a href="https://tiktok.com/@shop.example">TikTok</a>
        <a href="https://youtube.com/@shopexample">YouTube</a>
        <form action="/quote"><input name="name" /></form>
      </body></html>`,
    }]);
    expect(paths.map((path) => path.kind)).toEqual(expect.arrayContaining(['email','phone','facebook','instagram','linkedin','tiktok','youtube','form']));
    expect(paths.find((path) => path.kind === 'email')?.value).toBe('hello@shop.example.net');
  });

  it('does not guess placeholder or no-reply email addresses', () => {
    const paths = discoverPublicContactPaths([{
      finalUrl: 'https://business.test/contact', accessBlocked: false,
      html: 'hello@example.com noreply@business.test',
    }]);
    expect(paths.filter((path) => path.kind === 'email')).toHaveLength(0);
  });

  it('ignores email-looking values that only appear inside script or style payloads', () => {
    const paths = discoverPublicContactPaths([{
      finalUrl: 'https://business.test/', accessBlocked: false,
      html: '<script>window.monitoring = "developer@vendor.test"</script><style>.x{content:"css@vendor.test"}</style><p>Call us today.</p>',
    }]);
    expect(paths.filter((path) => path.kind === 'email')).toHaveLength(0);
  });

  it('does not expose contactPaths in saved public audit responses', () => {
    const saveSource = readFileSync(new URL('../lib/data/audits.ts', import.meta.url), 'utf8');
    expect(saveSource).toContain('const { contactPaths: _privateContactPaths, ...publicAudit } = audit');
    expect(saveSource).toContain("db.from('lead_contact_paths')");
  });
});
