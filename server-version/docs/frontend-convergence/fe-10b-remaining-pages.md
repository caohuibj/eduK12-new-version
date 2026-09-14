# FE-10b — Remaining Business Pages + Route Closeout

Baseline: `main@f665bc2254f900fdd16f97ec23fc3295674b6add` after FE-10a / PR #109 merged.

FE-10b completes the remaining page-family work from Frontend Product Convergence v1.2. It is a product-frame and accessibility convergence package, not a rewrite of assessment runtimes, course/assignment/check-in business rules, classroom realtime protocol, media policy, or authorization semantics.

## Package role

FE-10a completed discovery, Continue/Completed semantics, history, export convergence, and the main student discovery/list surfaces. FE-10b owns the remaining reachable business/detail/editor surfaces and the final route-inventory closeout.

FE-10 is package-complete only after this PR passes its final route evidence gate.

## Hard boundaries

FE-10b must not change:

- ONE UNIT / ONE FINAL semantics;
- scorer / CanonicalUnitResult;
- frozen assessment/runtime identity;
- Cognitive timing/engine selection;
- Situational traversal/pruning;
- Bundle server-authoritative unit order;
- Form/Scale sealed FINAL identity;
- ReportShell scientific interpretation rules;
- course/assignment/check-in persistence contracts;
- classroom socket/realtime message protocol;
- media ownership/storage policy;
- backend role/authorization model;
- Prisma or IndexedDB schema/version.

Do not create a generic CRUD renderer, universal editor, shared workflow engine, global form state, or new cross-domain API merely to make the pages look alike.

## Scope families

### C1 — Teacher/admin list surfaces

Converge hierarchy, semantic navigation, loading/error/empty states, primary/secondary actions, and narrow-screen behavior for standard list surfaces including:

- CourseList;
- StudentManagement;
- AssignmentList;
- CheckinList;
- ScaleList;
- QuestionnaireList;
- GeneralQuestionnaireList;
- other standard teacher/admin list surfaces where the current business contract is unchanged.

Acceptance: list-row/card navigation is keyboard-operable, destructive actions remain explicit buttons, and no list presentation change changes backend filters, ownership, lifecycle, or authorization.

### C2 — Business detail/editor surfaces

Apply product primitives and semantic form associations to remaining detail/editor pages without rewriting their controllers:

- TeacherCourseDetail / CourseStudents;
- ScaleEdit / QuestionnaireEdit / GeneralQuestionnaireCreate/Edit;
- student CourseDetail, AssignmentSubmit, CheckinSubmit, StudentProfile;
- focused Composite/Cognitive editor presentation only where FE-10a did not already close the behavior.

Acceptance: existing save/publish/archive/submit protocols and server validation remain authoritative; no duplicate local workflow state is introduced.

### C3 — Classroom + media families

Converge surrounding product UI for:

- teacher classroom list/create/control/edit/QR/question pages;
- student/guest classroom enter/join/answer pages;
- video/image/document libraries.

Classroom realtime ownership remains with the existing socket/controller code. FE-10b may improve labels, hierarchy, status/error presentation, responsive layout and semantic controls, but does not redesign the protocol or move realtime state into a generic shell.

Media libraries retain current upload/reference/delete policy and asset identity.

### C4 — Admin/profile/public business surfaces

Converge:

- UserList;
- TeacherCodeList;
- MaterialGrants;
- InstrumentAuthorization;
- TeacherProfile / StudentProfile where still outstanding;
- PublicCheckin.

Authorization failures must remain server-driven. No frontend role selector or hidden UI state may expand access.

### C5 — BigScreen retained mode + 86-route closeout

BigScreen remains a dedicated display mode. Do not wrap it in normal AppShell/ProductPage chrome when that harms projection/display behavior.

Final package closeout must:

1. run `npm run inventory:product-ui:check` against current `App.tsx`;
2. reconcile all 86 explicit routes, including fallback;
3. mark each route as migrated, earlier-package-owned, or retained-mode with a concrete rationale;
4. prove no route was deleted merely because its UI looked legacy;
5. retain assessment runners/results under their owning FE packages rather than reopening them;
6. record Parent/Observer as a separate backend/identity dependency, not a FE-10b UI deliverable.

## Responsive and accessibility acceptance

Representative business-page acceptance must cover compact, medium and wide layouts. Layout class is independent from input capability.

Minimum page-family evidence:

- primary action remains discoverable without horizontal overflow;
- navigation cards/rows are real links when navigation is the behavior;
- form labels are programmatically associated;
- dialogs have a programmatic name and keyboard-close path where the current UX uses a dialog;
- error/empty/loading states are visible and do not rely solely on console output;
- keyboard users can reach primary/secondary actions and list destinations;
- touch layout does not infer runtime capability or device compatibility.

## Network / persistence budget

Allowed: each page's existing reads/writes, existing explicit CRUD/lifecycle operations, existing classroom socket events, and existing media/admin endpoints.

Not introduced:

- new persistence tables;
- new per-answer/trial/video writes;
- new generic workflow/state backend;
- new cross-domain authorization layer;
- new global route manifest replacing `App.tsx`.

## Validation plan

During Draft:

- keep slices small enough for PR-light lint/typecheck/backend compile;
- add focused component/page tests when semantics change;
- preserve existing business-contract tests.

Before Ready:

- exact-head full frontend tests/build;
- backend full regression and critical skip guard;
- seeded browser acceptance;
- Docker production builds + Trivy HIGH/CRITICAL scans;
- CodeQL;
- specialized path-triggered workflows where applicable;
- `npm run inventory:product-ui:check`;
- representative compact/medium/wide + keyboard evidence for each remaining page family;
- BigScreen retained-mode evidence.

Skipped/unavailable gates are reported as skipped/unavailable, never as passed.

## Rollback

Rollback is presentation/page-level. Existing routes, API contracts, business records, classroom state, media assets, assessment attempts/results/snapshots and authorization data remain intact. No destructive cleanup is part of FE-10b.
