# FE-01 — Product UI foundation and adaptive interaction contract

Baseline: main `8bbb40960079740cb5720b67969737971f367d8f`, 2026-09-12.

## Scope

FE-01 adds opt-in presentation primitives and a reviewable standalone example. No application route, assessment controller, draft store, API client, scorer, media player or FINAL payload is changed. ProductPage is a content container, not AppShell or AssessmentShell. Existing pages continue to use their existing styles until their migration PR.

## Inventory and ownership

See [all registered routes](./routes.md). Run `npm run inventory:product-ui:check` when routes change; regenerate and review the proposed target/owner classifications rather than treating them as authorization.

| State / action | Sole owner | Shell responsibility |
|---|---|---|
| Account, authenticated session | Existing AuthContext / API | Show identity and expiration |
| Capability availability | Existing capability / domain API | Display allowed actions |
| Answers, revisions, durable progress | Domain controller + finalDraftStore | Display actual saving/saved/error |
| Current question / field | Scale / Form player | None |
| Trial, stimulus clock, response clock | Cognitive task / controller | Show readiness outside timed stage |
| Reachable trajectory, branch pruning | Situational traversal / draft | Display semantic progress |
| Frozen identity, unit FINAL payload | Existing domain controller / runtime contract | Submission feedback only |
| Parent slot order and completion | Existing Bundle orchestration | Display parent progress / return |
| Report metrics, references, scientific claims | Authoritative result and existing projection | Layout only |
| Dialog disclosure, responsive navigation | Local UI | Presentation state only |

No new global store, universal renderer/controller, secondary API layer or maturity-specific product path. PILOT and RESEARCH_READY have the same product capabilities; availability remains governed by publication, rights and actual applicability.

## Network write budget

- During answers, fields, trials and video viewing: zero server answer/progress writes. Local IndexedDB persistence remains necessary.
- Start/resume, authentication, immutable media/capability reads and report reads remain allowed at existing boundaries.
- Each existing unit creates one authoritative FINAL; response-loss recovery may query and replay the identical logical submission. This is not a one-HTTP-request guarantee or one-SQL-statement limit.
- FORM_SECTION and Bundle slot boundaries remain unchanged. FE-01 implements none of these operations.
- Required video behavior is deferred to FE-03B: 1×, no user seeking, full viewing before dependent actions. Incomplete refresh/close restarts from zero; completed same-unit/same-scene markers persist locally. No server playback heartbeats. Multiple option-video policy still needs the recorded product decision.

## Visual contract

The `.hui-product` scope contains semantic CSS variables and classes. It does not change `:root`, `body`, existing `.card`, `.btn-*`, AntD classes or existing Tailwind `primary`. Import primitives from `src/components/product-ui` and use ProductPage as the scope root. Do not wrap an unmigrated timed task merely to inherit new styles.

| Category | Decision |
|---|---|
| Typography | 16px body, 1.6 line height, clear h1/h2, readable muted text |
| Spacing | 4/8/12/16/24/32px scale; use fewer surfaces, not nested cards |
| Width | reading 42rem; assessment 48rem; report 64rem; management 80rem; never unbounded prose |
| Surface | neutral background, white surface, subtle border; no default decorative shadow |
| Actions | one primary action per local decision; secondary/danger explicit; min 44×44px |
| Status | visible label + distinct symbol, never color alone; inline persistence failures do not disappear |
| Focus | visible outline with offset; never remove without replacement |
| Motion | no required animation; respect reduced motion within product scope |

Tailwind mapping: existing global utilities remain unchanged. New scoped consumers can use the `--hui-*` variables through the product classes (or explicit arbitrary utilities); do not repoint existing primary tokens. AntD mapping for a later migrated subtree: primary/action, text/text-muted, surface/border, radius, font and control-height must match these semantic values in a local ConfigProvider; FE-01 does not install a global provider or claim AntD CSS-variable algorithm compatibility.

## Adaptive contract

- compact: below 40rem; one column, full-width action buttons, safe-area-aware padding.
- medium: 40rem to below 64rem; constrained reading, selectively wider layout.
- wide: 64rem and above; constrained content remains; report/admin may use additional columns.
- These are CSS viewport profiles only. No isMobile/isTablet state, UA sniffing, resize store or input inference.
- Keyboard, pointer, touch and hybrid are independent of viewport. An iPad with keyboard and a touch Chromebook retain both input paths.
- Tab/Shift+Tab and native button Enter/Space must work. Arrow semantics belong to appropriate native radio/select controls, not a global shortcut.
- Answer rows in later migrations must be full touch targets. Focus/labels/errors, soft keyboard, orientation and safe areas are required, not inferred from a device name.
- Cognitive input readiness remains domain-owned; this scope does not change input events, frame onset, timing or scientific interpretation.

## Primitive boundaries

- ProductPage: width/padding/scope; div avoids a nested main landmark under future AppShell.
- PageHeader: caller-owned title/description/actions; heading level explicitly 1 or 2, no global document-title effect.
- ActionBar: action grouping, wrapping and compact stacking; no sticky footer or navigation decisions.
- ProductButton: native button with default type=button, semantic variant and native disabled. Does not perform routing or synthesize loading state.
- ProductStatus: semantic kind plus visible title/content/action. `announce` is opt-in (`polite` status or `assertive` alert); static repeated report facts are not live regions by default. Do not use both assertive and a duplicate toast for one failure.

## Acceptance and rollback

- Route inventory matches every registered route, including public, role-guarded, optional and capability-conditional routes.
- Preview checks at 360/390/768/820/1366px; no horizontal overflow, compact actions full-width, targets >=44px.
- Native keyboard activation, disabled behavior, opt-in announcements, labels and focus verified.
- Typecheck, lint, existing regression suite and production build recorded separately from browser/layout evidence.
- Standalone example has no application API/auth/runtime imports and is not registered in App.tsx or the production build entry.
- Touch emulation does not establish real-device or Cognitive timing support. Real iPad/Android/Chromebook and assistive-technology acceptance remains FE-11 work.
- Rollback is removal of opt-in imports and new files. No data migration, no active assessment state or deployment switch changes.
