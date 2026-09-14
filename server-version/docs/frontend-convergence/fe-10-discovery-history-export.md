# FE-10 — Discovery + History + Export + Remaining Pages

Baseline: `main@41bcade06245c005a07d54016402e6f894317fb4` after FE-09 / PR #108 merged.

This document defines the FE-10 package from Frontend Product Convergence v1.2. It is a product-integration package, not a new assessment runtime, export backend, authorization model, or universal content schema.

## Package split

During implementation C5 proved too broad for one reviewable pull request: the remaining surfaces include student discovery/list pages plus large teacher/admin editors, classroom real-time control, media libraries and authorization pages with unrelated business protocols.

FE-10 is therefore split by page family as explicitly allowed by the original plan:

- **FE-10a / PR #109** — Discovery + Continue/Completed + History + Export + student-facing discovery/list surfaces + Parent/Observer fact audit.
- **FE-10b** — teacher/admin remaining pages, public check-in, classroom/media/admin families, BigScreen retained-mode evidence and final 86-route inventory closeout.

The **FE-10 package gate is not complete until FE-10b is merged**. FE-10a must not claim full route convergence.

## Goal

Complete the user journeys around migrated assessments so a user can find an available assessment, continue an active attempt, reopen a completed result, export through existing authorized formats, and navigate the remaining reachable product pages with a coherent product frame.

FE-10 also closes the FE-01 route-inventory coverage gaps. Every reachable route must end the package with either migration evidence or an explicit reason that its specialized presentation is retained.

## Dependency state

Strong dependencies are satisfied on the baseline:

- FE-02 AppShell / access context is merged.
- FE-05 ReportShell / frozen result projection is merged.
- FE-09 Bundle Product Integration is merged at the baseline above.

FE-10 consumes those contracts. It does not redefine AppShell, ReportShell, assessment persistence, media, FINAL, scoring, Bundle orchestration, or Cognitive timing.

## Current route baseline

The FE-01 inventory records 86 explicit frontend routes, including fallback. The inventory is descriptive rather than an authorization source. No FE-10a change adds, removes or retargets an `App.tsx` route; FE-10b owns the final generated-inventory drift check and evidence/status closeout after all remaining page families are addressed.

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

Discovery exposes real server/domain capability rather than inventing one cross-domain content schema.

- Reuse existing Scale, Cognitive, Situational and Bundle lists / APIs.
- A presentation-only `DiscoveryCard` may normalize hierarchy and semantics; it does not know assessment type or choose destinations.
- An active attempt has a clear **Continue** action and must not be presented as a fresh **Start** when the existing domain says it is resumable.
- A completed result remains separately reachable; do not replace a historical result CTA with a new-attempt CTA.
- Absence of local recovery metadata is not proof that a server attempt does not exist.

### History

History is a projection over existing domain history APIs and authoritative attempts/results.

- Preserve exact attempt / result identity.
- Pending or ambiguous completion must lead to reconciliation / continue-checking behavior, not a new attempt.
- Do not fetch only the first page from several domain endpoints and concatenate it as a fake globally sorted history.
- Cognitive keeps its real server pagination.
- Situational currently exposes `{list,total}` without paging parameters; FE-10a displays that server-provided range and does not client-slice it into fake pages.
- Old attempts reopen their stored/frozen result; never substitute latest content.

### Export

FE-10 does not create a generic export engine.

- Expose only already-authorized export actions and existing formats.
- Composite analysis export remains tied to `selectedSnapshotId || report.packageReport.snapshotId`.
- Situational local JSON/CSV export is built directly from the loaded frozen attempt/result and therefore has no asynchronous server generation state to invent.
- Cognitive teacher export serializes generation/download actions so repeated clicks cannot create concurrent exports; failure releases the lock and preserves context for retry.
- Research exports are not presented as participant feedback.

### Remaining product pages

Remaining pages receive product-frame convergence only to the depth justified by their current business logic:

- ProductPage / page title / primary-secondary actions / status / empty / error states;
- semantic links instead of clickable non-interactive cards;
- semantic labels and form associations where missing;
- keyboard operation and basic narrow-screen usability;
- no rewrite of course, assignment, check-in, classroom real-time protocol, editor business rules, media-library behavior, or course-video policy.

BigScreen remains a dedicated presentation and is a FE-10b retained-mode validation item.

## Parent / Observer gate — audited

**FE-10a result: Parent complete journey NOT PASSED.**

Current repository facts:

- backend `UserRole` contains only `STUDENT`, `TEACHER`, `ADMIN`;
- user-creation validation accepts only those three roles;
- repository search finds no Parent/Observer/Guardian account role, student-binding model or top-level route/authorization chain;
- report/audience projection capability is not equivalent to an authenticated Parent product.

Smallest separate dependency before a Parent UI can be claimed:

1. define Parent/Observer identity semantics;
2. define durable authorized binding to one or more students;
3. define report audience/redaction authorization using that binding;
4. add authenticated entry/list/report routes;
5. only then add Parent navigation and report presentation.

FE-10 must not substitute teacher/admin access, mock data, CSS-hidden researcher fields or a frontend role selector for that dependency.

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
- Prisma migration or IndexedDB schema/version changes.

## Scientific / runtime invariants

FE-10 does not change:

- ONE UNIT / ONE FINAL semantics;
- scorer or CanonicalUnitResult;
- frozen assessment/runtime identity;
- Cognitive engine/timing selection;
- Situational traversal/pruning;
- Form / Scale sealed submission identity;
- ReportShell scientific interpretation rules;
- Bundle server-authoritative unit order;
- maturity classification as an interaction or authorization switch.

Historical presentation remains version faithful. Missing historical interpretation is shown as unavailable/limited rather than reconstructed from current content.

## FE-10a implementation status

### C1 — Discovery shell

Implemented:

- added presentation-only `components/product-ui/DiscoveryCard.tsx`;
- Scale, Cognitive and Situational discovery surfaces use the shared semantic card while retaining their domain APIs and target rules;
- Bundle discovery in `CourseDetail` already consumes authoritative `canContinue`, `canStartNewAttempt` and `latestCompletedAttempt`; FE-10a intentionally does not rewrite that large controller merely to manufacture visual uniformity.

### C2 — Continue / Completed actions

Implemented:

- Scale and Questionnaire retain exact active/completed target selection from their existing availability projections;
- Cognitive entry resolves known local `COMPLETED` to exact result, known `IN_PROGRESS` to exact session, and ambiguous/missing local state to **开始/继续测评** through the existing idempotent server `createSession` boundary;
- Situational discovery explicitly states the existing backend rule: entering a given instrument/version returns its active IN_PROGRESS attempt when present and only creates a new attempt otherwise;
- no render/effect creates an extra assessment attempt.

### C3 — History convergence

Implemented:

- Cognitive history uses ProductPage/DiscoveryCard and preserves real page/pageSize/totalPages/hasMore semantics;
- each Cognitive row links directly to its exact `sessionId` result;
- Situational history uses exact `attemptId` result links for completed rows and server reconciliation for active rows;
- Situational does not pretend its unpaged API is paginated.

### C4 — Export actions

Implemented / retained:

- Composite report already had correct snapshot-bound source selection, busy lock and inline error state; retained unchanged;
- Situational export already serializes the loaded frozen attempt/result into JSON/CSV client-side; retained unchanged;
- Cognitive teacher export now has one in-flight export lock across summary/full/research formats, format-specific busy labels and retry-safe error release;
- no export endpoint, artifact identity or authorization contract changed.

### C5a — student-facing remaining surfaces

Implemented:

- `StudentHome`: ProductPage/PageHeader, semantic course links, loading/error/empty states, accessible join-course dialog and inline join error instead of `alert()`;
- `StudentAssignments`: semantic links, status metadata, loading/error/empty states;
- `StudentCheckins`: semantic links, status metadata, loading/error/empty states;
- `StudentQuestionnaires`: semantic discovery cards while preserving in-progress and exact completed result targets;
- Scale/Cognitive/Situational discovery/history surfaces above also satisfy this student-facing page-family pass.

Explicitly retained in FE-10a:

- `CourseDetail` business controller, because it already owns multiple assignment/check-in/questionnaire/Bundle protocols and authoritative Bundle CTA facts; broad presentation rewrite is deferred to FE-10b with its page-family review.
- assessment runners/results migrated by earlier FE packages are not reopened by C5.

### C5b / FE-10b — remaining teacher/admin/public families

Deferred to the next FE-10 PR:

- teacher/admin course/student/assignment/check-in/Scale/Questionnaire pages;
- Composite/Cognitive editors beyond the focused export behavior above;
- classroom list/create/control/edit/QR/question pages;
- video/image/document libraries;
- admin user/teacher-code/material-grant/instrument-authorization pages;
- profiles and public check-in;
- BigScreen retained-mode acceptance;
- final generated 86-route inventory evidence/status reconciliation.

This deferral is a reviewability split, not a claim that those pages have passed FE-10.

## FE-10a validation requirements

Before PR #109 becomes Ready, its exact final candidate must include:

- focused product primitive and Cognitive entry-action tests;
- frontend lint/typecheck and full frontend tests;
- backend compile/full regression even though FE-10a adds no backend behavior;
- seeded browser/Docker/CodeQL gates required by repository CI;
- exact discovery/history/result/export target regression through existing tests;
- explicit report that specialized workflows skipped while Draft are not counted as passed.

FE-10b owns the package-level compact/medium/wide representative business-page acceptance, BigScreen retained-mode evidence and final `npm run inventory:product-ui:check` closeout.

## Rollback

Rollback is presentation / entry-point level:

- retain existing domain list/history/result/export routes and APIs;
- retain existing stored attempts, results, snapshots and export artifacts;
- do not rewrite attempt identities or snapshots;
- do not perform destructive database or browser-storage cleanup;
- if a discovery/history presentation proves unsafe, fall back to the existing type-specific entry point rather than changing backend scientific/runtime contracts.
