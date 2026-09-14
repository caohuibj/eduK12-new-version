# FE-10 — Discovery + History + Export + Remaining Pages

Baseline: `main@41bcade06245c005a07d54016402e6f894317fb4` after FE-09 / PR #108 merged.

This document freezes the implementation scope for FE-10 from Frontend Product Convergence v1.2. It is a product-integration package, not a new assessment runtime, export backend, authorization model, or universal content schema.

## Goal

Complete the user journeys around migrated assessments so a user can find an available assessment, continue an active attempt, reopen a completed result, export through existing authorized formats, and navigate the remaining reachable product pages with a coherent product frame.

FE-10 also closes the FE-01 route-inventory coverage gaps. Every reachable route must end this package with either migration evidence or an explicit reason that its specialized presentation is retained.

## Dependency state

Strong dependencies are satisfied on the baseline:

- FE-02 AppShell / access context is merged.
- FE-05 ReportShell / frozen result projection is merged.
- FE-09 Bundle Product Integration is merged at the baseline above.

FE-10 consumes those contracts. It does not redefine AppShell, ReportShell, assessment persistence, media, FINAL, scoring, Bundle orchestration, or Cognitive timing.

## Current route baseline

The FE-01 inventory still records 86 explicit frontend routes, including fallback. The inventory is descriptive rather than an authorization source. FE-10 must reconcile it against the current `App.tsx` before Ready and update evidence/status where this package changes or explicitly retains a surface.

Initial FE-10-owned or FE-10-shared families include:

- teacher/admin course, student, assignment, check-in, Scale/Questionnaire content lists and editors;
- classroom list/create/control/edit/QR/question surfaces;
- video/image/document libraries;
- admin user, teacher-code, material-grant and instrument-authorization surfaces;
- teacher/admin profile surfaces;
- student home, course detail, assignments, check-ins, profile and Questionnaire discovery;
- public check-in;
- BigScreen, which remains a dedicated display mode;
- History / completed-result entry points across assessment types;
- export actions that already exist on authorized result/report surfaces.

Assessment runners and scientific report bodies remain owned by their migrated domain packages.

## Product rules

### Discovery / Continue / Completed

Discovery should expose real server capability rather than inventing one cross-domain content schema.

- Reuse existing Scale, Cognitive, Situational and Bundle lists / APIs.
- If one unified backend discovery API does not exist, use a product-level type switch / grouped surfaces over the existing lists.
- An active attempt has a clear **Continue** action and must not be presented as a fresh **Start** when the existing domain says it is resumable.
- A completed result remains separately reachable; do not replace a historical result CTA with a new-attempt CTA.
- URL filter state may coordinate product discovery presentation, but it must not become authorization or runtime state.

### History

History is a projection over existing domain history APIs and authoritative attempts/results.

- Preserve exact attempt / result identity.
- Pending or ambiguous completion must lead to reconciliation / continue-checking behavior, not a new attempt.
- Do not fetch only the first page from several domain endpoints and concatenate it as a fake globally sorted history.
- A cross-domain view is allowed only when pagination / ordering semantics are truthful. Otherwise use per-type history sections/tabs.
- Old attempts must reopen the stored/frozen result or snapshot they actually belong to; never substitute latest content or latest snapshot.

### Export

FE-10 does not create a generic export engine.

- Expose only already-authorized export actions and existing formats.
- Keep export identity tied to the result/snapshot currently shown when the domain contract supports snapshot selection.
- Busy, retry and read/download errors must keep the user on the current page with context intact.
- File naming may be normalized at the presentation layer when it does not change server artifact identity.
- Research CSV / analysis export must not be relabeled as child-facing feedback.
- Do not bypass audience authorization by changing a frontend audience selector.

### Remaining product pages

Remaining pages receive product-frame convergence only to the depth justified by the current business logic:

- ProductPage / page title / primary-secondary actions / status / empty / error states;
- semantic labels and form associations where missing;
- keyboard operation and basic narrow-screen usability;
- no rewrite of course, assignment, check-in, classroom real-time protocol, editor business rules, media-library behavior, or course-video policy.

BigScreen remains a dedicated presentation. FE-10 may align appropriate tokens and status vocabulary but must not wrap it in a normal application page if that damages display-mode behavior.

## Parent / Observer gate

The v1.2 plan explicitly forbids claiming a completed Parent product when there is no real account / binding / authorization path.

Current planning fact to verify in source during C6:

- the primary `User.role` model has historically exposed STUDENT / TEACHER / ADMIN;
- FE-01 inventory contains no self-service Parent/Observer top-level journey;
- report projection may understand additional audiences internally, but projection support is not equivalent to a login, binding and route authorization chain.

FE-10 C6 must inspect the current backend/frontend facts. If the required identity/binding/API chain exists, wire the real route. If it does not, document the smallest separate backend/identity dependency and mark **Parent complete journey not passed**. Mock data or a frontend-only role toggle cannot satisfy this gate.

## Network / persistence budget

FE-10 is primarily read/navigation/export presentation work.

Allowed:

- existing list/detail/history/report reads;
- existing explicit Start / Resume actions;
- existing authorized export preview/generate/download requests;
- existing course/assignment/check-in/classroom/editor requests owned by those pages.

Not introduced by FE-10:

- per-answer, per-trial or per-video progress writes;
- a new universal assessment API;
- a new history aggregation database table;
- a new export artifact model;
- a new frontend workflow engine;
- Prisma migration or IndexedDB schema/version changes unless a separately reviewed dependency proves unavoidable.

## Scientific / runtime invariants

FE-10 must not change:

- ONE UNIT / ONE FINAL semantics;
- scorer or CanonicalUnitResult;
- frozen assessment/runtime identity;
- Cognitive engine/timing selection;
- Situational traversal/pruning;
- Form / Scale sealed submission identity;
- ReportShell scientific interpretation rules;
- Bundle server-authoritative unit order;
- maturity classification as an interaction or authorization switch.

Historical presentation must remain version faithful. Missing historical interpretation is shown as unavailable/limited rather than reconstructed from current content.

## Planned slices

### C1 — Discovery shell

Evolve the proven Scale library/product patterns into a limited `LibraryShell` / discovery presentation contract and connect existing Cognitive, Situational and Bundle discovery surfaces without creating a shared backend content schema.

Acceptance focus:

- type-specific capability remains visible;
- current availability / permission rules remain server/domain driven;
- filters are URL/presentation state only;
- empty/error/loading states are coherent on compact/medium/wide layouts.

### C2 — Continue / Completed actions

Normalize Discover / Continue / Completed CTA semantics across supported assessment families.

Acceptance focus:

- active attempt resumes exact attempt identity;
- completed attempt links to exact result/report;
- no render/effect creates duplicate attempts;
- restart remains an explicit domain-supported action, not an implicit fallback from a failed result read.

### C3 — History convergence

Converge history presentation and exact-result navigation while preserving each domain's pagination and authority.

Acceptance focus:

- pending is not displayed as completed or restarted;
- exact attempt/result IDs are preserved through refresh/deep link;
- type filters do not hide authorization failures;
- no fake global ordering from partial per-domain pages.

### C4 — Export actions

Converge export action placement/status/error behavior over the existing authorized export contracts.

Acceptance focus:

- selected/frozen snapshot remains the export source where applicable;
- retry does not silently switch export version;
- download/generation failure preserves page context;
- unauthorized formats/actions stay unavailable;
- research exports are not presented as participant feedback.

### C5 — Remaining reachable pages

Apply existing product primitives to FE-10-owned teacher/admin/student/course/assignment/check-in/classroom/media/admin pages where this improves hierarchy, controls, empty/error states and responsive use without changing page business logic.

Acceptance focus:

- primary action remains clear;
- labels/errors are programmatically associated where applicable;
- keyboard path and narrow-screen path remain usable;
- BigScreen remains dedicated;
- no global CSS sweep is treated as proof that all routes passed.

If the diff becomes too broad for safe review, split implementation by page family (FE-10a / FE-10b) while preserving this package-level gate.

### C6 — Parent/Observer truth + route inventory closeout

Audit the real Parent/Observer identity/binding/authorization chain and reconcile the full route inventory.

Acceptance focus:

- every reachable route has migration evidence or an explicit retained-mode reason;
- Parent/Observer is either genuinely wired end-to-end or explicitly marked as a separate dependency / not passed;
- only demonstrably unreferenced old chrome is removed;
- no route is deleted merely because its UI appears legacy.

## Validation plan

Each implementation slice adds focused tests with behavior changes. Before Ready, the exact final candidate must include:

- route inventory drift check against current `App.tsx`;
- focused discovery/CTA/history/export tests;
- deep-link / refresh tests for exact attempt/result identity;
- authorization regression for export and audience paths;
- compact/medium/wide and keyboard basic acceptance for representative remaining-page families;
- BigScreen retained-mode evidence;
- full frontend/backend CI;
- seeded browser acceptance and Docker/CodeQL gates required by repository CI.

Skipped or unavailable gates must be reported as skipped/unavailable, never as passed.

## Rollback

Rollback is presentation / entry-point level:

- retain existing domain list/history/result/export routes and APIs;
- retain existing stored attempts, results, snapshots and export artifacts;
- do not rewrite attempt identities or snapshots;
- do not perform destructive database or browser-storage cleanup;
- if a discovery/history aggregation presentation proves unsafe, fall back to the existing type-specific entry points rather than changing backend scientific/runtime contracts.
