# Frontend Product Convergence Style Contract

Status: implementation contract for the Frontend Product Convergence work.

This contract complements the product-journey architecture. It is intentionally small: it standardizes the user-visible product language without creating a second runtime, a universal renderer, or a full design-system migration.

## 1. Core principle

Every product page should feel like the same Huisurvey product even when the underlying assessment domain is different.

Consistency applies to:

- page width and information hierarchy;
- typography and spacing;
- surface/card treatment;
- primary, secondary and destructive action hierarchy;
- loading, empty, error, recovery, submission and completed states;
- keyboard focus and touch targets;
- responsive behavior;
- language used to describe save, resume, recovery and FINAL status.

Consistency does **not** require Scale, Cognitive, Situational, Form or Bundle to share domain state or rendering logic.

## 2. Visual direction

The default product style is simple, restrained and clear.

- Prefer one clear page title and one short description.
- Use whitespace and hierarchy before decorative elements.
- Avoid dense control clusters unless the role genuinely needs them.
- Prefer subtle borders and `shadow-sm` surfaces over heavy card chrome.
- Keep one dominant primary action per decision point when possible.
- Use color to reinforce meaning, never as the only carrier of meaning.
- Do not expose implementation or governance terminology to ordinary participants unless it is needed for their next action.

## 3. Page widths

Use a small number of semantic widths rather than per-page arbitrary values:

- `assessment`: focused answering surfaces;
- `reading`: instructions and explanatory content;
- `report`: result/report content;
- `wide`: libraries and management surfaces.

The current implementation entry point is `components/product/ProductPage.tsx`.

## 4. Interaction baseline

For the converged product surfaces:

- primary interactive targets should be at least 44 CSS px in the main interaction dimension;
- all interactive elements must have visible keyboard focus;
- links remain links and buttons remain buttons;
- cards that navigate should be keyboard-accessible links, not clickable `div`s;
- loading, failure and genuine empty states must be distinct;
- request failure must not be rendered as “content does not exist”;
- report-read failure must not imply FINAL failed;
- terminal server state takes precedence over local draft presentation.

## 5. Assessment boundary

Shared shells consume domain state; they do not own it.

The shared UI may display:

- title and instructions;
- semantic progress;
- save/recovery status;
- submission presentation status;
- exit/return actions;
- domain-provided recovery actions.

It must not own:

- Scale/Form answers or current field;
- Cognitive trial/timing state;
- Situational trajectory, pruning or routing evidence;
- FINAL payload construction;
- scorer/report calculations.

## 6. Progress language

Do not normalize every assessment to a percentage.

Use semantic progress forms:

- count: completed items out of a fixed total;
- position: current fixed section/step;
- phase: practice/formal/completing;
- open path: current scene/round without a fake fixed denominator.

Only show a numeric progress bar when the denominator is genuinely fixed.

## 7. Submission language

The converged UX may distinguish:

- ready;
- submitting;
- reconciling;
- committed;
- pending;
- failed.

This is a presentation contract, not a universal FINAL execution engine. Each domain controller remains responsible for its real submit/reconcile/terminal-read operations.

A timeout or lost response does not automatically mean submission failed.

## 8. Responsive and accessibility baseline

Every migrated participant journey should be checked at minimum at:

- mobile: 360/390 CSS px;
- tablet: 768/820 CSS px;
- desktop/Chromebook-supported layouts.

The migrated path should support keyboard navigation, predictable focus, readable error/status feedback and no avoidable page-level horizontal scrolling. Domain-specific timing or stimulus constraints remain governed by the domain protocol.

## 9. Migration rule

Use vertical slices to validate shared primitives.

1. migrate one real journey;
2. observe what is genuinely shared;
3. extract the smallest reusable primitive;
4. freeze the primitive only after a second domain proves the boundary.

Do not create a universal renderer, new global store, duplicate persistence layer or generic workflow engine for visual consistency.
