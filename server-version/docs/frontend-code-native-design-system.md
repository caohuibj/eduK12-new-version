# Huisurvey Code-native Design System Workspace

## Purpose

Huisurvey uses an executable design workflow when Figma or Pixso is unavailable:

```
production tokens and shared React primitives
→ deterministic UI Lab specimens
→ canonical responsive screenshots
→ GPT / human visual review
→ implementation refinement
→ CI and browser acceptance
```

The UI Lab is a design and review surface. It is not a product feature and does
not own business behavior.

## Source-of-truth hierarchy

Different concerns have different authoritative sources.

### Visual foundations

`frontend/src/components/product-ui/design-tokens.css` owns shared Modern
Education design tokens.

The UI Lab reads those variables directly. It must not maintain a copied token
file or silently introduce a parallel palette.

### Component implementation

Production shared components own their rendered geometry and behavior.

Examples include:

- Product UI;
- Report primitives;
- Report Trend Chart;
- role- and surface-specific shared UI packages.

The UI Lab imports those production components. Lab-only CSS may compose
specimens and galleries, but it must not become the hidden implementation of
production components.

### Scientific and privacy semantics

Domain/reporting contracts, server projections and tests remain authoritative.

The UI Lab may demonstrate a state such as comparable, not comparable or
suppressed, but it does not decide comparability, calculate statistics, lower
privacy thresholds or create scientific interpretations.

### Visual evidence

Canonical screenshots are the durable visual review evidence.

They are not pixel-diff golden masters. Structural gates remain:

- expected page readiness;
- no uncaught browser errors;
- no page-level horizontal overflow;
- no write API calls from read-only canonical captures.

### Behavioral correctness

Unit, integration, browser and release-gate tests remain authoritative for
behavior. A visually correct specimen cannot override a failing product test.

## UI Lab route boundary

The UI Lab route is:

`/__ui-lab`

It is registered only when:

`VITE_UI_LAB_ENABLED=true`

Normal production builds leave this flag off. The route is absent from normal
product navigation and ordinary production routing.

The canonical Visual QA workflow explicitly enables the flag for its isolated
frontend build.

The UI Lab:

- must not require or write business data;
- must use deterministic illustrative values;
- must not call mutation APIs;
- must not become an authorization surface;
- must remain safe to capture as a guest in the isolated QA fixture.

## Required specimen families

The workspace should provide a compact review surface for the design system
rather than reproduce every application page.

Current families:

1. Foundations
   - semantic colors;
   - spacing;
   - radius;
   - typography hierarchy.
2. Product UI
   - button variants;
   - information / success / warning / error / pending states.
3. Report Reading System
   - core summary;
   - metric grid;
   - range track;
   - evidence/details;
   - disclaimer.
4. Canonical report scenarios
   - Scale total + dimensions;
   - Cognitive small multiples;
   - SJT Construct × Channel matrix.
5. Cognitive task presentation
   - response controls;
   - resolved progress;
   - hint / key cue;
   - instruction, practice, transition and completion states.
6. Visualization states
   - comparable longitudinal trend;
   - partially/not comparable trend;
   - privacy-suppressed state.

Add a new specimen only when it represents a reusable visual or semantic
contract. Do not turn the UI Lab into a catalog of every route.

## Design review workflow

For meaningful frontend changes:

1. Read the current production implementation and relevant design/scientific
   contracts.
2. Update or add the smallest useful deterministic specimen when the change
   affects a reusable pattern.
3. Generate canonical captures at:
   - 390 × 844;
   - 768 × 1024;
   - 1440 × 1000.
4. Review screenshots for:
   - visual hierarchy;
   - density and whitespace;
   - typography;
   - token consistency;
   - mobile reflow and clipping;
   - touch targets;
   - focus and non-hover access;
   - scientific semantics;
   - privacy/suppression;
   - print behavior when the pattern is report-specific.
5. Fix the production component or shared token, not only the screenshot
   specimen.
6. Re-capture and inspect.
7. Run the appropriate CI route and exact-head release gate before merge.

## GPT visual-review rubric

GPT review should use repeatable criteria rather than free-form “make it
prettier” instructions.

### Hierarchy

- Does the first reading layer answer what the user needs to understand?
- Do numbers or chart chrome overpower interpretation?
- Are evidence and limitations preserved but visually later?

### Density

- Is desktop efficient without dashboard overload?
- Does mobile remain calm and readable?
- Is nested-card depth justified?

### Typography and tokens

- Is the heading hierarchy stable?
- Are muted/caption sizes still readable?
- Does the implementation reuse the existing token vocabulary?

### Responsive behavior

- No page-level horizontal overflow.
- No clipped chart labels or essential information.
- Dense tables may use local horizontal scrolling.
- Student/Parent remains mobile-first; Staff remains desktop-efficient with
  usable mobile fallback.

### Accessibility

- Visible focus remains available.
- Essential interactions are not hover-only.
- Reduced motion is respected.
- Important chart information has a text representation.
- Touch targets are approximately 44 px or larger where interactive.

### Scientific and privacy boundaries

- The frontend does not invent totals, norms, percentiles or cutoffs.
- Heterogeneous Cognitive metrics retain original units.
- Longitudinal connections and deltas follow backend comparability.
- Suppressed values cannot leak through charts, labels, hidden DOM or tooltips.

## Relationship to Figma / Pixso

If Figma or Pixso becomes available later, it may serve as an optional visual
authoring and exploration layer.

It should mirror and consume the established design system rather than become a
second independent source of truth.

The preferred long-term loop is:

```
React / tokens
↔ optional design authoring tool
→ canonical screenshots
→ implementation + CI
```

A design-tool outage must not block frontend development or release acceptance.

## Non-goals

The UI Lab does not:

- replace product/browser acceptance;
- replace accessibility testing;
- replace real-device testing;
- redefine reporting or assessment semantics;
- expose an administrator design console in production;
- justify product changes that are unsupported by the domain model.
