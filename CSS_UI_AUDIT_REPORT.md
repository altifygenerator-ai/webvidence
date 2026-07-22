# Webvidence CSS and Interface Audit

## Scope

This was a full application-interface CSS audit, not another isolated override. The review covered the authenticated shell, dashboard, search and campaign workflow, recommendation results, pipeline, prospect cards, lead file, outreach composer, reply planning, account settings, billing, evidence detail, admin states, mobile menu, and the conversation-first public page.

The existing product logic, API behavior, database migration, billing, authentication, audits, and outreach workflow were not redesigned in this pass.

## Root causes found

The broken screens were caused by several layers of CSS solving different versions of the interface at the same time:

- New component class names existed without a complete visual definition.
- Older global selectors still controlled `display`, grid placement, child spans, and button flow.
- Late responsive rules overrode only part of a component, leaving incompatible desktop and mobile properties mixed together.
- The authenticated app did not have a sufficiently scoped final application layer, so public-page and legacy rules could affect workspace components.
- Several components had no finished intermediate-tablet layout. They jumped from wide desktop assumptions directly to phone rules.
- Fixed mobile actions and the existing bottom navigation used separate height assumptions.
- Long names, labels, counts, and status text were not consistently allowed to shrink or wrap.

## Structural correction

The interface now has one final stylesheet loaded after the legacy base:

- `app/globals.css` remains the shared base and public-site stylesheet.
- `app/application.css` is the final, scoped application UI layer.
- `app/layout.tsx` loads `application.css` after `globals.css`.

Authenticated selectors are scoped under `.app-frame`. The standalone conversation page uses `.conversation-page`. This makes the cascade predictable and prevents application fixes from unintentionally restyling every public page.

The previous appended workflow override block was removed from `globals.css` instead of leaving another patch underneath the new layer.

## Screens corrected

### Dashboard

- Rebuilt the signed-in header and action alignment.
- Rebuilt the “What needs attention next” summary so the label, heading, description, count, and disclosure control cannot run into each other.
- Styled expanded attention rows, action buttons, progress, empty states, and footer navigation.
- Standardized summary-count sizing and long-content wrapping.

### Search and campaigns

- Rebuilt the page heading containment so large display type scales safely.
- Styled collapsed and expanded active-campaign summaries as complete components.
- Corrected campaign title, metadata, status, count, disclosure, and action placement.
- Rebuilt search-usage information so words and numbers are not treated as separate grid items.
- Standardized the search form, validation guidance, advanced-search disclosure, and plan usage state.
- Completed styling for the recommendation section, recommendation rows, progress, signals, contacted state, and empty states.

### Pipeline

- Rebuilt filters and sort controls as a coherent toolbar.
- Corrected label/select/button/count alignment.
- Preserved a compact desktop table and supplied a purpose-built card layout for smaller screens.
- Prevented long business names, statuses, next actions, and due dates from forcing overflow.
- Kept bulk actions visually secondary.

### Prospect results and evidence

- Completed result-card, contact-state, recommendation-state, score, evidence, audit-state, and action styling.
- Corrected mobile result numbering so the index does not collide with category or status content.
- Prevented evidence statuses such as “Complete” from wrapping one letter per line.
- Added safe wrapping and shrinking to evidence rows, URLs, findings, and metadata.

### Lead and outreach workflow

- Rebuilt the lead header, status summary, next-step panel, composer, draft desk, tracking disclosure, message history, follow-up state, and outcome controls.
- Preserved the useful two-column layout only where it has enough room.
- Reset legacy grid-column and grid-row declarations before stacking at narrower widths.
- Removed duplicate mobile primary actions when the fixed action dock owns the same action.
- Corrected the outreach-intent segmented control, observation disclosure, draft actions, copy states, and error/success messages.

### Dialogs and account screens

- Rebuilt reply, response, and profile dialogs for desktop and mobile.
- Added dynamic viewport sizing, contained scrolling, sticky actions where needed, and safe-area padding.
- Completed settings, billing, admin, evidence, and mobile-menu component styling.

## Responsive system

The final layout was reviewed at:

- 320px
- 375px
- 390px
- 430px
- 760px
- 832px
- 1024px
- 1180px
- 1440px

Key behavior:

- Wide application shell and sidebar remain on large screens.
- The compact application shell activates before the sidebar can crush page content.
- The lead workflow becomes one column at 1180px and below.
- Tablet uses the compact header and menu without adding the phone bottom navigation.
- Phone layouts use the bottom quick navigation and reserve the correct content space.
- The lead action dock uses the same measured navigation height and safe-area inset as the bottom navigation.
- Pipeline controls become a readable two-column grid on narrow phones rather than a clipped horizontal strip.
- Buttons become full-width only where that improves usability; desktop controls remain compact.
- Inputs remain at least 16px on phones to avoid iPhone auto-zoom.
- Long names, replies, locations, labels, and URLs wrap without widening the document.

## Validation performed

### CSS parsing

- `app/globals.css`: 1,679 lines, zero parser errors.
- `app/application.css`: 4,107 lines, zero parser errors.

### Source coverage

- 42 TSX component/page files were inspected for `className` usage.
- 444 static class names were found.
- Every static class is covered by the stylesheet except four intentional dynamic markers/prefixes:
  - `attention-active` uses the base attention-panel styling.
  - `next-step-` is a runtime status prefix.
  - `priority-` is a runtime priority prefix with concrete variants styled.
  - `severity-` is a runtime severity prefix with concrete variants styled.

### TypeScript syntax

- 118 TypeScript/TSX files parsed with the TypeScript compiler parser.
- Zero syntax diagnostics.

### Browser layout review

Representative production class structures were rendered with the actual final CSS in Chromium.

- 13 pages/states × 9 widths = 117 layout renders.
- Zero document-level horizontal-overflow findings.
- Zero off-screen-content findings.
- Zero nondecorative clipping findings.
- 13 pages/states × 5 audit widths = 65 sibling-overlap checks.
- Zero sibling-overlap findings.
- 12 short-viewport dialog/lead checks at 320×568, 375×667, 390×844, and 430×740.
- Dialog content remained scrollable.
- The fixed lead dock and mobile navigation had a zero-pixel gap and zero overlap.

Reviewed states included dashboard, campaign/search, pipeline, lead, prospect result, reply input, reply response, settings, billing, admin, evidence, conversation page, and open mobile menu.

## Build limitation

A clean dependency installation was attempted again. The configured package registry returned HTTP 503, including for the Next.js package. Because dependencies could not be installed, the following were not claimed as passed:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Live authenticated Next.js route review

The CSS audit used the actual production styles and component class structures, but live Supabase data, route transitions, and physical-device keyboard behavior should still be checked after dependencies and credentials are available.
