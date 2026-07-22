# Webvidence Styling and Mobile Review

## Result

The application styling was rebuilt as a scoped final UI layer instead of adding another loose block of overrides. The screens shown with overlapping text and unfinished controls were traced to conflicting legacy display/grid rules and incomplete component styles.

The final styling is in `app/application.css`, loaded after `app/globals.css` from `app/layout.tsx`. Authenticated styles are scoped to `.app-frame`, and the conversation-first public page is scoped to `.conversation-page`.

## Corrected interface areas

- Dashboard signed-in panel, attention summary, expanded actions, counts, and disclosures
- Search heading, active campaigns, usage limits, search form, guidance, and advanced options
- Recommendation heading, progress, result rows, signals, contacted states, and empty states
- Prospect cards, audit/evidence states, contact controls, and result numbering
- Pipeline filters, sort controls, count, compact table, responsive cards, and bulk actions
- Lead header, next step, composer, drafts, sent state, tracking, history, and outcomes
- Reply assistant and profile dialogs
- Settings, billing, admin, evidence detail, mobile menu, and conversation-first page

## Mobile and tablet behavior

- Compact app shell begins before the desktop sidebar can squeeze content.
- Tablet uses the compact header/menu but does not add unnecessary bottom navigation.
- Phone bottom navigation and fixed lead action dock share one safe-area-aware height.
- The dock touches the navigation without overlap or a dead gap.
- Lead content stacks at 1180px and below.
- Draft and next-step buttons remain one column on narrow screens, including 391–430px.
- Pipeline filters become a readable two-column phone grid.
- Search and campaign controls stack without clipped text or overlapping counts.
- Reply sheets use dynamic viewport height and contained scrolling.
- Inputs use a minimum 16px phone font size to prevent iPhone zoom.
- Long business names, replies, labels, locations, and URLs wrap safely.

## Browser review

The actual final CSS was rendered in Chromium with representative production class structures.

Widths reviewed:

- 320px
- 375px
- 390px
- 430px
- 760px
- 832px
- 1024px
- 1180px
- 1440px

Results:

- 117 page/state/width renders
- Zero document horizontal-overflow findings
- Zero off-screen-content findings
- Zero nondecorative-clipping findings
- 65 sibling-overlap checks with zero findings
- 12 short-viewport dialog/lead checks
- Scrollable mobile sheets at short viewport heights
- Zero-pixel dock/navigation gap and zero overlap

## Source checks

- `app/globals.css`: zero CSS parser errors
- `app/application.css`: zero CSS parser errors
- 444 static component classes checked; all covered except intentional runtime prefixes/base-state markers
- 118 TypeScript/TSX files parsed; zero syntax errors

## Remaining live checks

The package registry returned HTTP 503 during dependency installation, so the authenticated Next.js app could not be booted here. The official typecheck, lint, Vitest, and production build commands were therefore not reported as passing.

After dependencies are available, the remaining review is live route navigation, real Supabase data extremes, physical iPhone keyboard/safe-area behavior, and external contact-app handoff.
