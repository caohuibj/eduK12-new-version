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

Converge hierarchy, semantic navigation, loading/error/empty states, primary/secondary actions, and narrow-screen behavior for standard list surfaces.

Implemented as pure-list/product surfaces:

- StudentManagement;
- ScaleList;
- QuestionnaireList;
- GeneralQuestionnaireList;
- CognitiveAssignmentList;
- ClassroomList (implemented in C3 but follows the same list-page rules).

During implementation, CourseList, AssignmentList and CheckinList were reclassified from “pure list” to C2 retained business controllers. Each embeds substantial create/edit/lifecycle/share/grading/media behavior; rewriting those 30–40 KB controllers only to make their outer list visually uniform would increase regression risk and violate the package boundary. Their AppShell routes remain reachable and are explicitly retained below.

Acceptance: list-row/card navigation is keyboard-operable, destructive actions remain explicit buttons, and no list presentation change changes backend filters, ownership, lifecycle, or authorization.

### C2 — Business detail/editor surfaces

Implemented product-frame/accessibility convergence:

- CourseStudents;
- StudentProfile;
- TeacherProfile;
- PublicCheckin (public business surface; listed here because its submission/document controls were corrected);
- classroom entry/join surfaces are implemented under C3.

Explicitly retained as specialized/business controllers rather than rewritten:

- CourseList (`/dashboard`, `/courses`) — course create/edit/share/cover/recruitment/end/clone protocols coexist in one controller;
- TeacherCourseDetail — course-level business aggregation;
- AssignmentList — assignment editor, attachments, grading/submission, clone/export behavior;
- CheckinList — check-in editor/media/submission business controller;
- ScaleEdit / QuestionnaireEdit — domain content/lifecycle editors; changing them would reopen content authoring semantics outside FE-10;
- GeneralQuestionnaireCreate/Edit — specialized public-token questionnaire editor lifecycle;
- student CourseDetail — retained server-authoritative Bundle CTA facts (`canContinue`, `canStartNewAttempt`, `latestCompletedAttempt`) from FE-10a;
- AssignmentSubmit / CheckinSubmit — specialized student submission/media flows.

Retention means “reviewed and intentionally not generically rewritten”, not “ignored”. AppShell/access context from FE-02 remains the product shell for these routes.

### C3 — Classroom + media families

Implemented:

- ClassroomList product-frame/list convergence;
- ClassroomEnter now supports a real numeric input + form submit for physical keyboards while retaining the touch keypad;
- ClassroomJoin exposes retry/re-entry, semantic status and the existing temporary-participant path.

Explicitly retained:

- ClassroomCreate / ClassroomEdit / ClassroomQuestionEdit — specialized classroom/question editors;
- ClassroomControl — realtime teacher controller; socket ownership and server-committed start/next behavior remain local;
- ClassroomAnswer — student/guest realtime answer controller;
- ClassroomQRCode — dedicated QR/popup presentation;
- VideoLibrary — upload queue, processing polling, SecureVideoPlayer and media lifecycle are retained;
- ImageLibrary — image upload/preview/rename/delete and existing media-protection behavior are retained;
- DocumentLibrary — document upload/reference/delete behavior is retained.

Classroom realtime ownership remains with the existing socket/controller code. FE-10b does not move realtime state into a generic shell or alter socket events.

Media libraries retain current upload/reference/delete policy and asset identity. FE-10b does not use presentation convergence as a vehicle for changing media-protection policy.

### C4 — Admin/profile/public business surfaces

Implemented:

- UserList — ProductPage/PageHeader, visible load failure + retry, labelled search, keyboard-readable role switch, responsive table/actions;
- TeacherCodeList — ProductPage/PageHeader, load/copy/create/delete feedback and in-flight states; the previously dead delete icon is connected to the already-existing admin-only `DELETE /teacher-codes/:id` endpoint;
- MaterialGrants — ProductPage/PageHeader, retryable errors, labelled filtering and responsive table;
- InstrumentAuthorization — ProductPage/PageHeader and semantic form/table layout while preserving blank legal facts, gate evaluation and self-approval declaration behavior;
- TeacherProfile / StudentProfile — retryable `/users/me` load, semantic password controls and responsive actions;
- PublicCheckin — document navigation is a real keyboard-operable control when available, submit failure has inline `role=alert`, and token/session-capability/signed-asset rules are unchanged.

Authorization failures remain server-driven. No frontend role selector or hidden UI state expands access.

### C5 — BigScreen retained mode + 86-route closeout

BigScreen remains a dedicated display mode. It is intentionally not wrapped in normal ProductPage chrome:

- `shellModeFor('/bigscreen/...')` returns `display`;
- BigScreen connects with the existing classroom socket role `bigscreen`;
- ECharts/wordcloud instances are retained across updates and disposed on unmount;
- classroom-authored chart labels continue through sanitized rendering;
- realtime broadcast ownership remains with the classroom protocol.

`npm run typecheck` runs `inventory:product-ui:check` as a pre-hook. Draft CI #956 on checkpoint `26fe30a5cbfa9c39c528800aadde06930fbfe789` passed frontend lint/typecheck and therefore proved the generated route inventory matched `App.tsx` at that checkpoint. Final exact-head validation must prove this again after the closeout documentation/tests stop moving the head.

## 86-route closeout matrix

The generated `routes.md` remains the reproducible route inventory. This matrix supplies the product-migration evidence without turning the generator into a second routing/product database.

The classifications below are disjoint and exhaustive:

`9 FE-02/auth+fallback + 16 FE-10b migrated + 4 FE-10a migrated + 21 specialized/business retained + 35 earlier-package-owned + 1 BigScreen = 86`.

### A. FE-02 shell/auth/fallback — 9 routes

Earlier-package-owned; FE-10 does not reopen authentication or fallback routing:

- `/`;
- `/admin/login`;
- `/teacher/login`;
- `/teacher/register`;
- `/teacher/account-login`;
- `/student/login`;
- `/student/course-login`;
- `/student/register`;
- `*`.

### B. FE-10b product-frame/accessibility migrated — 16 routes

- `/courses/:courseId/students` — CourseStudents;
- `/students` — StudentManagement;
- `/scales` — ScaleList;
- `/questionnaires` — QuestionnaireList;
- `/general-questionnaires` — GeneralQuestionnaireList;
- `/cognitive-assignments` — CognitiveAssignmentList presentation only; Cognitive domain contracts remain FE-07A/B;
- `/teacher/classrooms` — ClassroomList;
- `/users` — UserList;
- `/teacher-codes` — TeacherCodeList;
- `/admin/material-grants` — MaterialGrants;
- `/admin/instrument-authorizations` — InstrumentAuthorization;
- `/profile` — TeacherProfile;
- `/student/classroom/enter` — ClassroomEnter;
- `/student/profile` — StudentProfile;
- `/student/classroom/join/:code` — ClassroomJoin;
- `/public/checkin/:token` — PublicCheckin.

### C. FE-10a migrated — 4 routes

Already completed by PR #109 and not reopened by FE-10b:

- `/student` — StudentHome;
- `/student/assignments` — StudentAssignments;
- `/student/checkins` — StudentCheckins;
- `/student/questionnaires` — StudentQuestionnaires.

### D. FE-10 specialized/business retained — 21 routes

Reviewed and intentionally retained under FE-02 AppShell or a dedicated presentation because generic convergence would cross a business/realtime/editor/media boundary:

- `/dashboard` — CourseList business controller;
- `/courses` — CourseList business controller;
- `/courses/:courseId/detail` — TeacherCourseDetail aggregation controller;
- `/assignments` — AssignmentList editor/grading/media controller;
- `/checkins` — CheckinList editor/media controller;
- `/scales/:id` — ScaleEdit content/lifecycle editor;
- `/questionnaires/:id` — QuestionnaireEdit content/lifecycle editor;
- `/general-questionnaires/create` — specialized questionnaire editor;
- `/general-questionnaires/:id/edit` — specialized questionnaire editor;
- `/teacher/classrooms/create` — classroom editor;
- `/teacher/classrooms/:id/control` — realtime teacher controller;
- `/teacher/classrooms/:id/edit` — classroom editor;
- `/teacher/classrooms/:id/qrcode` — dedicated QR/popup presentation;
- `/teacher/classrooms/:id/questions` — classroom question editor;
- `/videos` — video upload/processing/media lifecycle;
- `/images` — image asset lifecycle;
- `/documents` — document asset lifecycle;
- `/student/courses/:courseId` — CourseDetail with server-authoritative Bundle CTA facts;
- `/student/assignments/:assignmentId` — specialized assignment submission;
- `/student/checkins/:checkinId` — specialized check-in submission;
- `/student/classroom/answer/:classroomId` — student/guest realtime answer controller.

### E. Earlier assessment-package-owned — 35 routes

FE-10 reviews reachability but does not reopen their runtimes/results/editors:

Composite teacher/admin (FE-09 / FE-05):

- `/composite-assessments`;
- `/composite-assessments/:id/results`;
- `/composite-assessments/:id/attempts/:attemptId/report`;
- `/composite-assessments/:id`.

Cognitive teacher editor (FE-07A/B):

- `/cognitive-assignments/:id`.

Scale library/runtime/result (FE-03C / FE-05):

- `/scale-library`;
- `/scale-library/:instrumentKey/:instrumentVersion`;
- `/student/scales`;
- `/student/scales/:scaleId`;
- `/student/scales/result/:assessmentId`.

Situational (FE-06), including Composite child runners:

- `/student/situational`;
- `/student/situational/history`;
- `/student/situational/:instrumentKey`;
- `/student/situational/attempts/:attemptId/result`;
- `/student/composite/situational/:attemptId`;
- `/public/composite/situational/:attemptId`.

Questionnaire runtime/result/public (FE-08 / FE-05):

- `/student/questionnaires/:questionnaireId`;
- `/student/questionnaires/result/:assessmentId`;
- `/public/questionnaire/:token`;
- `/public/questionnaire/:token/assessment`;
- `/public/questionnaire/:token/result`.

Composite student/public parent journeys (FE-09 / FE-05):

- `/student/composite/:assessmentId`;
- `/student/composite/attempts/:attemptId`;
- `/student/composite/attempts/:attemptId/report`;
- `/public/composite/:token`;
- `/public/composite/attempts/:attemptId`;
- `/public/composite/attempts/:attemptId/report`.

Cognitive student/public (FE-07A/B / FE-05):

- `/student/cognitive`;
- `/student/cognitive/assignments/:assignmentId`;
- `/student/cognitive/history`;
- `/student/cognitive/sessions/:sessionId`;
- `/student/cognitive/sessions/:sessionId/result`;
- `/public/cognitive/assignments/:token`;
- `/public/cognitive/sessions/:sessionId`;
- `/public/cognitive/sessions/:sessionId/result`.

### F. Dedicated retained display — 1 route

- `/bigscreen/:classroomId` — dedicated `display` shell mode + `bigscreen` classroom socket role; normal ProductPage chrome intentionally not introduced.

No route is deleted by FE-10b. No App.tsx route authority is replaced by this matrix.

## Parent / Observer dependency

Parent/Observer remains **NOT PASSED** as a separate backend identity/binding/authorization dependency from FE-10a. Current account roles are STUDENT / TEACHER / ADMIN. FE-10b does not create a fake parent role, mock student binding, or teacher/admin substitute.

## Responsive and accessibility acceptance

Representative business-page acceptance covers compact, medium and wide layouts at the component/layout contract level:

- migrated management tables use horizontal overflow instead of compressing action controls beyond usability;
- page headers/actions wrap or stack on narrow screens;
- profile/classroom-entry actions stack where needed;
- ClassroomEnter exposes both a real numeric input for physical keyboards and a retained touch keypad;
- navigation uses Link where navigation is the behavior;
- form labels are programmatically associated;
- export dialogs have a programmatic dialog name;
- error/empty/loading states are visible rather than console-only;
- input capability is never inferred from viewport class.

Final Ready browser/full-suite evidence remains required; Draft compile evidence alone does not satisfy final acceptance.

## Network / persistence budget

Allowed: each page's existing reads/writes, existing explicit CRUD/lifecycle operations, existing classroom socket events, and existing media/admin endpoints.

The TeacherCodeList dead delete affordance was connected to the already-existing authenticated admin `DELETE /teacher-codes/:id` endpoint. No endpoint or authorization capability was added.

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

Draft checkpoint at `26fe30a5cbfa9c39c528800aadde06930fbfe789`:

- frontend lint: SUCCESS;
- frontend typecheck: SUCCESS, including `inventory:product-ui:check` pre-hook;
- backend Prisma generate + tsc: SUCCESS;
- full jobs skipped by Draft policy and are not counted as final pass evidence.

Before Ready, the exact final head must pass:

- focused StudentManagement and ClassroomEnter semantics tests through the full frontend suite;
- frontend full tests/build;
- backend full regression and critical skip guard;
- seeded browser acceptance;
- Docker production builds + Trivy HIGH/CRITICAL scans;
- CodeQL;
- specialized path-triggered workflows where applicable;
- `npm run inventory:product-ui:check` again on the exact head;
- BigScreen retained-mode evidence above.

Skipped/unavailable gates are reported as skipped/unavailable, never as passed.

## Rollback

Rollback is presentation/page-level. Existing routes, API contracts, business records, classroom state, media assets, assessment attempts/results/snapshots and authorization data remain intact. No destructive cleanup is part of FE-10b.
