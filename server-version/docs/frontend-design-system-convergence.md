# Huisurvey Modern Education — Design System Convergence

This document defines the implementation boundary for the second visual-optimization phase.

## Goal

The first Modern Education rollout established role- and surface-specific presentation across Student, Parent, Staff, Public, Assessment, Classroom and shared account/library flows. The next phase reduces implementation drift without redesigning those experiences again.

This PR therefore changes **CSS/token ownership**, not product behavior or page structure.

## Foundation token layers

### 1. Foundation primitives

`frontend/src/components/product-ui/design-tokens.css` owns inert global primitives with the `--hui-ds-*` prefix:

- semantic color foundations;
- role accent aliases;
- status colors;
- spacing;
- radii;
- target/control sizes;
- elevation;
- canonical reading/assessment/report/management widths.

These variables do not style a page by themselves.

### 2. Product UI semantic scope

Inside `.hui-product`, existing component semantics continue to use:

- `--hui-color-*`
- `--hui-space-*`
- `--hui-radius`
- `--hui-target`
- `--hui-width-*`

Those values now alias the shared foundation instead of duplicating literals.

The existing opt-in boundary is preserved: importing Product UI must not apply component styles outside `.hui-product`.

### 3. Role semantics

Student, Parent, Staff, Public and Assessment surfaces may define role/surface semantic aliases, but common geometry and brand colors should resolve through `--hui-ds-*`.

Role identity is allowed to differ through semantic accents; component geometry should not fork merely because the user role changes.

## Legacy compatibility

The global legacy classes remain supported during migration:

- `.btn-primary`
- `.btn-secondary`
- `.btn-danger`
- `.card`
- `.input`

They now consume the same foundation target size, radii, borders, action colors and card elevation. This prevents legacy pages from visually drifting further while PR3 migrates them to semantic Product UI primitives.

No page markup is changed in this convergence PR.

## Migration rule for future frontend work

Prefer this order:

1. existing semantic Product UI / Staff UI component or class;
2. shared `--hui-ds-*` token;
3. role semantic alias when a genuine role distinction exists;
4. new page-specific literal only when the value represents domain-specific visualization rather than generic product chrome.

Do not create a new role-specific copy of Card/Button/Input/PageHeader geometry.

## Responsive contract

The existing breakpoint contract remains unchanged:

- mobile: below 40rem / 640px;
- tablet: 40rem–63.999rem;
- desktop: 64rem / 1024px and above.

The token file exposes breakpoint values for design/reference parity, but CSS media queries continue to use literal media-query values because custom properties are not valid media-query operands.

## Acceptance

This PR is presentation-only and should remain eligible for Visual Gate after the stacked QA baseline lands.

Acceptance criteria:

- no TS/TSX/runtime/API/route changes;
- canonical visual QA passes at 390 / 768 / 1440;
- Product UI scope isolation remains intact;
- legacy controls retain accessible 44px minimum targets;
- role-specific visual identity remains recognizable;
- no new page-level horizontal overflow.
