# Form section management: one canonical field source

## Baseline and scope

Remote `main` checked on 2026-10-28: `c5c28f85085e53de1b7be4ed821489accaae7228`, tree `e85f04bc9c6e7411dcd0d0a189feafc4c1eeacbb`. The restored cloud checkout was clean at PR378 (`ec19f532`); it was moved to a new branch from the fetched main. The separate cognitive worktree and open content/cognitive PRs are outside this change. There are no repository `.agents/skills` files; `/workspace/.agents` is empty. The connected Notion V2 roadmap, its appended cloud handoff and CI checklist were readable.

PR378/380 are delivered foundations, not new performance results. Remaining work includes safe School/Teacher session projections, Training course-scoped summaries/open semantics, request-local answer/feedback work, education parent feedback, comparable four-entry cold/warm resources, storage/backup amortization and sustained mixed concurrency.

First slice: the shared `FormSectionManager` reads `/form-sections`, `/form-items` and `/content`. Training's ordinary questionnaire parent has already read `/form-items`; the same manager is also consumed by the legacy course questionnaire and composite editors. Only the movable-field dropdown uses the separate flat field list. The section response already contains these fields and their authoritative membership.

Both `ensureQuestionnaireFormSections` and `ensureCompositeFormSections` materialize missing membership before their management list returns. Their section mapping carries every field needed by this dropdown; it does not carry the parent section ID on each child, which must be derived from the enclosing section. Context fields must remain excluded, and a field must not be offered for its current section.

## Execution plan

Measure frozen main before editing, then make the smallest shared-component change and repeat the same scenario/data. Primary local checks are the real manager's field-assignment/reload/error/readonly contracts and the actual compiled Training editor. Synthetic API replies are explicit and do not establish backend authorization, SQL cost or production latency. A loopback HTTP harness, if supported by the browser sandbox, records actual gzip response-body bytes separately from static resource estimates. Cold and cached revisits use fixed inputs; no tail percentiles or concurrency claims.

Component → possible fault → check: canonical section-derived dropdown → wrong/missing/current/context field choices → both questionnaire and composite field shapes, canonical reload after assignment; shared manager → accidental request retained → exact API path counts; parent consumer → content/draft/revisit regression → compiled ordinary questionnaire journey. Unchanged dependencies/schema/auth/scoring/participant paths are not revalidated wholesale. One baseline build and one changed artifact build, each once; no CI activation until DOT independently reviews the exact candidate. Initial budget: 5 minutes for component checks, 10 minutes for bounded browser preparation/measurement. Environment failures are retained and reported.

## Applicability

| Entry / identity / access | This slice |
| --- | --- |
| Training trainer or permitted administrator, authenticated legacy ordinary/course/composite editor | Direct consumers; apply the same shared implementation |
| Training learner or anonymous participation | No manager consumer; participant chain unchanged |
| Survey researcher/administrator/subject identity modes | No manager consumer; separate existing editor/runtime contracts |
| School student/parent/teacher/psychological professional/administrator | No manager consumer; no participation or management inference |
| Teacher self/student evaluation/invited expert/administrator | No manager consumer; invited FORM support is not public Scale support |

Other roadmap capabilities remain open. No production flags, production database writes, deployment, merge or protection changes are part of this slice.

## Results

Product/test commit: `ebf90d6dd7d22cc0a907d8a258f28e95d70f5e64`, tree `5ab5f09ad590733d9733a33d6afb5ea2ab3c5773`. Runtime change is confined to `FormSectionManager.tsx`; no parent wiring, backend, schema, lockfile or configuration change.

The real API client's fetch transport called a loopback HTTP server that sent explicit synthetic JSON, gzip level 1 and `Cache-Control: no-store`. The same 41-field fixture, API envelopes, React/jsdom setup and installed dependencies were used before/after. Body byte counts are the compressed bytes actually sent by that fixture, excluding HTTP headers. They are not production response sizes or browser network measurements. The fixture is a DTO superset with membership properties; the separately executed omitted-membership case also verifies the real nested DTO's lack of those IDs.

| Journey | GET before → after | gzip response body bytes before → after |
| --- | --- | --- |
| Ordinary questionnaire section manager | 3 → 2 | 2107 → 1197 |
| Course questionnaire section manager | 3 → 2 | 2107 → 1197 |
| Composite section manager | 3 → 2 | 2124 → 1206 |
| Actual ordinary editor: metadata + first content visit | 7 → 6 | 3312 → 2402 |

The ordinary editor still makes its necessary parent `/form-items` call; the manager's second call is removed. Basic loads only metadata. Switching basic/content again sends zero additional requests and preserves the unsaved name. Section mutations still POST and refresh the server's canonical sections/content. Context fields remain excluded; fields are not offered for their current section. Ordinary/course/composite paths share this code. Single timing, Node CPU and heap observations are retained without inferring browser speed, SQL savings, p95, memory reduction or production capacity. The cached tab revisit is component-state reuse, not M1's complete cold/hot browser/API/database experiment.

Visible ordering change: movable-field options previously followed the flat field list's global `position`; they now follow section order, then each section's item order. Field IDs and assignment semantics remain the same, but this is a visible ordering difference and is not described as a completely unchanged UI.

Baseline measurement: 4 PASS, 7 filtered. First candidate invocation: 20 PASS / 2 FAIL, not a successful invocation. Both failures expected raw synthetic 503 wording, while the real API error utility deliberately displays `服务暂时不可用，请稍后重试。`. Only those two assertions were corrected; their targeted retry passed (2 PASS / 9 filtered). A supplemental real nested-DTO membership case passed separately (1 PASS / 11 filtered). The union is **23 unique passed cases**, not 23 executed in a single successful command. Existing passing cases were not repeated. Reporter IDs, command history, raw failure messages, fixture hashes and source inputs remain in [evidence](evidence/).

The final app TypeScript check and changed-file lint exited 0. The earlier app type result is retained too; adding the supplementary test changed its input, so the final app type check was necessary. Cognitive types, full frontend/backend suites, database tests and production builds were not run for this frontend-only slice. Local evidence is unsigned; no claim of official CI admission.

The eight deferred-parent cases replace the manager with a test double. They do not prove the real manager's own late-response behavior. The separate HTTP suite renders the actual manager and, for its editor observation, the real ordinary editor, but does not test a late manager response after scope changes. The manager's lack of request cancellation and the older parent refresh-key wiring are existing follow-up risks; this PR does not expand into fixing them. Empty type/lint logs alone do not prove successful execution. Admission must combine the original executed command/exit records with source association; `commands.json` is a retrospective, unsigned index of those observations, not a fabricated signed execution receipt.

Browser launch is **BLOCKED** in this cloud image: `/usr/bin/chromium` with `chromiumSandbox: true` rejected its incorrectly configured setuid helper (`/usr/lib/chromium/chrome-sandbox`). No permission changes, sandbox-disabling fallback, installation or repeated launch was attempted. Its original stderr is retained. The shell wrapper's exit 0 came from printing the failure log and is not browser success; the launch subprocess exit was not separately recorded. No compiled browser journey or screenshot exists for this slice. No production build was spent on a browser that could not start.

The state reduction follows [React's official guidance on avoiding redundant state](https://react.dev/learn/choosing-the-state-structure#avoid-redundant-state). Correctness comes from this repository's complete management section responses, not the generic guidance alone. Backend authority proof locations: `controllers/generalQuestionnaireController.ts:listFormSections`, `controllers/questionnaireController.ts:listFormSections`, `services/questionnaire-form-section.service.ts:ensureQuestionnaireFormSections/listQuestionnaireFormSections`, and `modules/composite/final-submit.service.ts:ensureCompositeFormSections/listCompositeFormSections`; no backend execution is claimed.

## DOT review and CI boundary

Keep Draft and `[skip ci]`. DOT must review the complete final base/head/tree/raw diff and these original reports before any CI activation. Relevant checklist IDs: CI-003 (cross-package app type closure), CI-006 (synthetic fixture versus real authority), CI-008 (dropdown/mutation/revisit consumer), CI-014 (SAST completion), CI-015 (browser sandbox availability), CI-020 (exact candidate and evidence status). The local 503 assertion error is not a GitHub CI failure; an append-ready description is retained for DOT rather than editing the CI page's ownership/history.

Proposed missing checks after review: one frontend production build, reuse that exact artifact for the affected compiled manager/editor consumer with a working sandbox, current-source SAST, exact source/evidence admission and the stable required gate. Preserve all selected gate requirements. No backend/DB/media/capacity jobs are justified by this diff. The existing precise PR380 route does not automatically authorize this new source; the current classifier must be checked and a properly reviewed supported lane resolved before activation. A conservative legacy/full route must not be launched merely to fill that integration gap. Local 23-case evidence is available for review and must not be blindly rerun in CI.

Budget proposal: source/evidence verification 5 minutes; one frontend build plus bounded compiled browser consumer 10 minutes; existing CodeQL budget unchanged, with a progress report at 5 minutes. Production deployment and merging are not delegated to this implementation task. Rollback is the single runtime-file change; there are no persistent data writes to reverse. Next implementation slice remains safe School/Teacher session projection parity before eliminating a login round trip.
