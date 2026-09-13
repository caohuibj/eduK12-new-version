# FE-08 — Form / Questionnaire Migration

Baseline: `main@2c242fb08d726378b73d75160931807c434b1429` (PR #105 / FE-07A merged, 2026-09-13).

Plan source: Frontend Product Convergence v1.2, FE-08.

## Dependency / parallel-work decision

FE-08 may start now. Its strong dependencies are FE-04, FE-03A, FE-03B and FE-05; all are merged on this baseline. FE-06 remains open in PR #104 but is Situational-local and is not a prerequisite for FE-08. FE-07A is merged; FE-07B remains an independent Cognitive timing work package and does not block Form / Questionnaire migration.

The v1.2 DAG explicitly allows FE-06, FE-07A and FE-08 to proceed in parallel. FE-08 therefore starts from current `main` rather than stacking on FE-06.

## User problem

Questionnaire currently has two materially different delivery paths in the same route components:

- LEGACY uses checkpoint batching and server answer writes during the run;
- FINAL_ONLY delegates to `FinalQuestionnaireAssessment`, which already uses FE-03A local drafts / sealed unit FINAL semantics.

Within FINAL_ONLY, one component currently owns both FORM_SECTION and embedded Scale presentation, local draft interaction, media gates and submission UI. Form choice controls are button-like rather than native radio / checkbox semantics, and FE-03B required-viewing support is available in the media gates but is not yet wired into Questionnaire FINAL_ONLY consumers.

FE-08 converges the participant experience without inventing a second state owner, second draft store, universal assessment controller, or new API.

## Current route / controller inventory

### Authenticated

- `/student/questionnaires/:questionnaireId/assessment` → `pages/student/QuestionnaireAssessment.tsx`
- FINAL_ONLY branch → `components/FinalQuestionnaireAssessment.tsx`
- LEGACY branch remains owned by `QuestionnaireAssessment.tsx` checkpoint/revision logic.

### Public

- public Questionnaire runner → `pages/public/PublicQuestionnaireAssessment.tsx`
- FINAL_ONLY branch → the same `FinalQuestionnaireAssessment.tsx` with public capability client / recovery token authority.
- LEGACY branch remains owned by the existing public checkpoint/revision logic.

### Result

- authenticated/public result routes stay on their existing result controllers in FE-08; `PublicQuestionnaireResult` error / parameter correctness is included where directly required by the migrated journey.
- ReportShell/report convergence remains FE-05-owned; FE-08 does not recalculate report metrics.

## Existing FINAL_ONLY contracts that must remain authoritative

`FinalQuestionnaireAssessment.tsx` already provides the following contracts and FE-08 must preserve them:

1. FORM_SECTION draft key is `questionnaire-form-section:<questionnaireAssessmentId>:<sectionId>`.
2. embedded Scale draft key is `questionnaire-scale:<scaleAssessmentId>`.
3. `finalDraftStore.ensure()` freezes attempt epoch, definition hash, context snapshot hash and one submission id.
4. submit uses `sealForSubmission()` so the payload is built from one atomic local snapshot.
5. retry reuses the sealed payload and submission id rather than rebuilding from React state.
6. server-completed state wins over stale local state.
7. FORM_SECTION and Scale continue to build their own domain payloads and use their existing authenticated/public endpoints.
8. Scale device/input provenance remains Scale-only and is not copied into FORM_SECTION FINAL.

No FE-08 change may re-enable LEGACY answer endpoints for a FINAL_ONLY attempt.

## Existing LEGACY contracts that remain supported

The authenticated/public route controllers still contain legacy checkpoint transports for form and Scale answers. FE-08 does not delete or reinterpret those APIs. The UI migration must branch on the existing delivery mode exactly as today:

- FINAL_ONLY → local draft + one sealed unit FINAL;
- LEGACY → existing checkpoint/revision semantics and existing restart/read behavior.

This prevents a visual migration from silently changing historical or already-started assessment semantics.

## Media / required-video finding

FE-03B already added `requiredViewing` support to `ScaleFormVideoGate` and `FormOptionVideoGroupGate`. The current FINAL_ONLY Questionnaire consumer loads frozen image/video capabilities but does not pass a required-viewing context, so video remains readiness-gated rather than full-viewing-gated in this path.

FE-08 must wire a stable local viewing identity derived from the existing FINAL_ONLY draft key plus frozen form item/option or Scale item slot. Required-video completion remains local metadata only; there are zero server video-progress writes.

For Form options, the current product decision is that all declared option videos are required before the answer controls are exposed.

## Presentation decomposition target

FE-08 may extract presentation-only players, but domain/controller ownership stays outside them.

### FormPlayer

Owns only:

- current item rendering;
- native radio / checkbox / text / month controls;
- label / error association;
- image/video presentation slots;
- previous / next / submit presentation callbacks;
- mobile-friendly field layout.

It must not own API clients, finalDraftStore identity, sealed submission payloads, Questionnaire context freezing, or server reconciliation.

### Scale player reuse

Embedded Scale should reuse the already-proven Scale interaction conventions where practical, but FE-08 must not move Questionnaire's embedded Scale controller into the standalone Scale route controller or create a second Scale state store. Domain callbacks / frozen identity stay with the Questionnaire controller.

## Planned commit slices

1. **C1 — baseline / ownership contract**
   - this document;
   - exact baseline SHA and parallel-work check;
   - route, delivery-mode, persistence, media and FINAL ownership inventory.
2. **C2 — FormPlayer + semantic controls**
   - extract FORM_SECTION presentation;
   - native radio / checkbox controls with whole-row touch targets;
   - label/error association and mobile input behavior;
   - keep controller/persistence in the current FINAL_ONLY owner.
3. **C3 — local save / flush + required-video integration**
   - preserve local-only writes during FINAL_ONLY answering;
   - explicit saving/saved/error presentation and submit-time flush boundary where text input needs coalescing;
   - enable FE-03B required-viewing identity for Form option videos and embedded Scale item videos;
   - no server answer/video-progress writes.
4. **C4 — authenticated/public AssessmentShell presentation**
   - project Questionnaire FINAL_ONLY state into the FE-04 AssessmentShell;
   - retain separate authenticated/public clients and recovery credentials;
   - preserve FINAL_ONLY vs LEGACY branching.
5. **C5 — recovery / result / interaction acceptance**
   - restore exact local draft values including empty string/number/array distinctions;
   - last edit before submit enters the sealed payload;
   - public credential/error paths and `PublicQuestionnaireResult` parameters;
   - keyboard/touch and multiple-video-option acceptance.

Commit numbering is an audit slicing target, not a requirement to combine unrelated changes.

## Domain invariants

FE-08 must not change:

- Questionnaire / Scale scorer logic;
- frozen definition identity, attempt epoch or context snapshot semantics;
- CanonicalUnitResult / Bundle finalizer semantics;
- server authorization or public recovery-token authority;
- FORM_SECTION as the unit boundary;
- one authoritative FINAL per unit;
- FE-03A sealed payload replay semantics;
- Scale device/input provenance placement;
- LEGACY checkpoint API semantics;
- ReportShell scientific projections.

No universal Form/Scale state machine or new Assessment API is introduced.

## Network / database budget

For FINAL_ONLY paths after FE-08:

- field / option answer change: local persistence only; **0 server answer writes**;
- video playback / completion: local media state/marker only; **0 server viewing writes**;
- unit completion: one logical sealed FINAL request, with identical-payload retry when reconciliation requires it;
- auth/public capability/media reads remain allowed;
- no Prisma migration and no IndexedDB object-store/version change are planned.

LEGACY paths retain their current checkpoint writes and are not reclassified as FINAL_ONLY.

## Draft / in-progress compatibility

- Existing FINAL_ONLY draft keys and metadata remain readable.
- Existing sealed submissions remain immutable and retryable with the same body.
- Existing LEGACY attempts continue their current checkpoint/revision route.
- FE-08 must not convert an in-progress LEGACY attempt to FINAL_ONLY merely because the new player renders it.
- public recovery credentials remain scoped to the same existing session/assessment.

## First acceptance gates

Before this PR can be marked Ready:

- native single-choice and multiple-choice controls work with keyboard and touch;
- text/month/form values preserve their existing payload types;
- last local edit is present in the sealed FORM_SECTION payload;
- required option videos block answer controls until every required frozen slot has a durable completion marker;
- embedded Scale required video uses the Questionnaire unit's existing frozen/draft identity without changing Scale scoring provenance;
- FINAL_ONLY answering produces no form/Scale checkpoint PATCH traffic;
- authenticated and public FINAL_ONLY submit paths both preserve exact sealed retry bodies;
- LEGACY regression remains unchanged;
- result/recovery error states do not turn a completed server result into a new attempt.

Full FE-08 evidence will include lint/typecheck, focused tests, production build and the repository's Ready/full CI/browser gates on one exact head SHA.

## Rollback

Rollback is page/presentation-level only. Restore the prior `FinalQuestionnaireAssessment` presentation while retaining the same finalDraftStore data, sealed submissions, frozen definitions, recovery credentials and existing domain/API contracts. No destructive local-database cleanup is allowed.