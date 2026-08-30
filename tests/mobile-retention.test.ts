import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app/application.css', import.meta.url), 'utf8');

describe('mobile retention layout guards', () => {
  it.each([760, 430, 390, 375, 320])('defines a narrow-screen breakpoint at %spx', (width) => {
    expect(css).toContain(`@media(max-width:${width}px)`);
  });

  it('keeps retention surfaces shrinkable and stacks risky controls on phones', () => {
    expect(css).toContain('.app-frame .today-session-card,');
    expect(css).toContain('min-width:0;');
    expect(css).toContain('.app-frame .pass-control{grid-template-columns:1fr}');
    expect(css).toContain('.app-frame .contact-path-list{display:grid;grid-template-columns:1fr}');
    expect(css).toContain('.app-frame .routine-field-grid{grid-template-columns:1fr}');
    expect(css).toContain('.app-frame .today-stat-grid{grid-template-columns:1fr}');
    expect(css).toContain('@media(max-width:430px){.app-frame .session-prospect-brief{grid-template-columns:1fr}');
  });
});
