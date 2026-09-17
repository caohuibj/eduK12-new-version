# Relational Assessment V1 — Implementation and Compatibility Plan

Baseline: `main@d8a04af3211c9fe9092bd948ad9043cd7b591b50`.

## Goal

Promote the existing subject/respondent/episode/consent observer foundation into a general relational-assessment capability that can support, without a second assessment runtime:

- parent -> student observer assessment;
- teacher -> student observer assessment;
- student -> teacher relational-experience assessment;
- future relationship directions through explicit, validated relationship adapters.

## Non-negotiable compatibility boundaries

1. Do not change ONE UNIT / ONE FINAL semantics.
2. Do not change authoritative Scale/Cognitive/Form/Situational scoring.
3. Do not add relationship lookup, cohort aggregation, or report synthesis to UNIT FINAL hot paths.
4. Preserve all existing SELF, PARENT and TEACHER attempt behavior.
5. Historical attempts remain valid; no identity backfill or inference from legacy `userId`.
6. Existing frozen Bundle snapshots must continue to validate with the same hashes.
7. Bundle extensions must be additive. Legacy definitions that omit relational applicability retain their current validation rules.
8. Cross-informant synthesis is not implicit. Parent, teacher and self reports remain separate unless a future explicit analysis protocol permits synthesis.
9. Relationship validity is checked before an assignment is issued/started and frozen for audit/provenance; runtime scoring does not re-resolve relationships.
10. Student -> teacher results default to aggregate-only subject visibility and require a policy-defined minimum respondent count.

## Existing issue to fix before production observer wiring

The domain contract permits pending consent with `acceptedAt = null`, while Prisma currently requires non-null `AssessmentAttemptConsent.acceptedAt`. The first backend PR must align persistence with the existing domain contract through an additive/relaxing migration.

## Canonical relational model

A relational assignment is the authoritative bridge between an AssessmentEpisode and an existing Assessment/Composite attempt.

It freezes:

- `episodeId`;
- `subjectUserId` and subject role snapshot;
- `respondentUserId` and respondent role snapshot;
- `relationshipKind`, relationship reference and frozen relationship snapshot/hash;
- `perspective`: `SELF_REPORT | OBSERVER_REPORT | RELATIONAL_EXPERIENCE`;
- assessment/bundle identity and version;
- consent reference;
- visibility policy;
- assignment status and provenance.

V1 relationship resolvers are deliberately narrow:

- `PARENT_CHILD` -> active `ParentStudentRelationship`;
- `COURSE_TEACHER_STUDENT` -> course creator + active/approved `CourseStudent` membership.

`CourseShare` does not grant roster/relationship authority.

## Runtime boundary

Relational Assignment -> frozen attempt identity/context -> existing runner -> existing FINAL -> existing Canonical result.

No parent runtime, teacher runtime, or student-rates-teacher runtime is introduced.

## Analysis boundary

Relational analysis is above canonical results, not inside Bundle/UNIT finalization.

Initial analysis modes:

- `INDIVIDUAL_ONLY` — parent/teacher observer result stays respondent-specific;
- `COHORT_AGGREGATE` — explicit aggregate contract, minimum N and aggregate-only disclosure;
- `MULTI_INFORMANT_SYNTHESIS` — reserved, not implemented in V1.

Cohort analysis snapshots freeze input result hashes, analysis policy/version/hash, output and provenance.

# Delivery structure

Two PRs are the minimum safe split. One PR would mix database migration, authorization, runtime bridging, frontend role expansion and browser acceptance into an unnecessarily large rollback unit.

## PR RA-01 — Relational Assessment Core

Backend/data contracts only. No new end-user route is required to merge this PR.

### Commit 1 — characterization/regression locks

`test(relational): pin legacy identity and bundle invariants`

- Lock SELF subject/respondent equality behavior.
- Lock existing Parent/Teacher observer identity and visibility behavior.
- Pin representative legacy Bundle definition/snapshot hashes.
- Lock existing audience projection rules and raw-answer redaction.
- Confirm existing SELF/PARENT/TEACHER definitions validate exactly as before.

### Commit 2 — persistence alignment and relational tables

`feat(relational): add additive assignment persistence and align pending consent`

- Make `AssessmentAttemptConsent.acceptedAt` nullable to match the existing pending-consent domain contract.
- Add persistent relational assignment storage.
- Add relationship snapshot/hash and visibility-policy storage.
- Add relational analysis snapshot storage if required by the final repository shape.
- No legacy-row backfill and no destructive migration.

### Commit 3 — relational contracts + Bundle applicability

`feat(relational): add relationship perspective and applicability contracts`

- Add subject/respondent role, relationship kind and perspective contracts.
- Add an optional relational applicability contract to Bundle definitions.
- Keep legacy definitions on the existing validation path when applicability is absent.
- Allow student-as-respondent only through the explicit relational applicability path.
- Preserve legacy frozen snapshot hashes when the new optional contract is absent.

### Commit 4 — relationship resolvers + observer compatibility adapters

`feat(relational): resolve and freeze parent-child and course relationships`

- `PARENT_CHILD` resolver uses active ParentStudentRelationship.
- `COURSE_TEACHER_STUDENT` resolver uses course creator + ACTIVE/APPROVED membership.
- Freeze relationship provenance at assignment creation.
- Adapt existing teacher->parent, parent self-serve and teacher observer domain functions to the persistent relational assignment model without changing their externally tested semantics.

### Commit 5 — assignment/API -> existing runtime bridge

`feat(relational): bind relational assignments to unified assessment attempts`

- Create/list/accept/start relational assignments.
- Bind `assignmentRef`, subject and respondent identity to the existing attempt.
- Support Parent->Student, Teacher->Student and Student->Teacher assignment directions.
- Reuse existing Scale/Form/Situational/Bundle runners.
- Do not change scorer, UNIT FINAL, parent aggregate finalizer or retry semantics.

### Commit 6 — relational analysis and access policy

`feat(relational): add individual and cohort analysis projections`

- Individual respondent-specific projection for observer assessments.
- Cohort aggregate snapshots for relational-experience assessments.
- Policy-defined minimum N; below threshold returns an insufficient-respondents state.
- Subject sees aggregate-only result for student->teacher campaigns.
- No raw-answer disclosure and no implicit cross-informant averaging.
- Analysis generation remains outside UNIT FINAL.

### Commit 7 — backend release gate

`test(relational): add authorization compatibility and release gates`

- Full domain/API tests for the three reference directions.
- Consent pending/accept/revoke tests.
- IDOR/cross-course/cross-child denial tests.
- Legacy snapshot/hash regression tests.
- Existing observer release-gate compatibility.
- Backend typecheck and relevant assessment suites.

## PR RA-02 — Relational Product Integration

Frontend/product wiring and browser acceptance on top of merged RA-01.

### Commit 1 — Parent frontend identity

`feat(fe-relational): add parent auth shell and access mapping`

- Extend frontend account role handling to PARENT.
- Add explicit parent home/login/access behavior; never fall through to teacher/admin dashboard.
- Preserve existing Student/Teacher/Admin route behavior.

### Commit 2 — Parent/Teacher observer product wiring

`feat(fe-relational): wire observer assignment and self-serve journeys`

- Register/refine existing `ObserverAssign` and `ObserverSelfServe` components.
- Wire real catalog, relationship, assignment, consent and result APIs.
- Keep current privacy language and no-cross-informant rule.

### Commit 3 — Student -> Teacher relational journey

`feat(fe-relational): add student relational-experience assignments`

- Surface assigned student->teacher tasks through existing assessment discovery/task surfaces.
- Enter the same existing AssessmentShell/runners.
- Preserve keyboard/touch/resume/local-durability behavior.

### Commit 4 — relational reports

`feat(fe-relational): add individual and cohort report views`

- Parent/teacher respondent-specific result view.
- Teacher subject aggregate-only classroom-experience view.
- Insufficient-N, unavailable and limitation states.
- No individual student ratings exposed to the teacher subject.

### Commit 5 — browser/accessibility regression gate

`test(fe-relational): cover four-role relational journeys`

- Parent -> Student.
- Teacher -> Student.
- Student -> Teacher with minimum-N cohort aggregate.
- Consent/revoke/access-denied states.
- Existing Student/Teacher/Admin FE-11 journeys remain green.
- Responsive/accessibility checks use the existing convergence gate conventions.

## Explicit non-goals for these two PRs

- no new assessment runtime;
- no changes to scoring algorithms;
- no Norm Engine;
- no device-latency correction;
- no generic social-graph `UserRelationship` model;
- no peer-assessment implementation yet;
- no automatic SELF/PARENT/TEACHER averaging;
- no production publication of SDQ/TEXI or new classroom-environment content unless its independent content/rights/scientific gates are satisfied.

## Merge rule

RA-01 merges only after legacy backend assessment suites, relational release gates, Prisma migration validation and typecheck pass on the exact head.

RA-02 merges only after RA-01 is on main and the exact RA-02 head passes the existing frontend/browser/accessibility regression gates plus the new relational E2E journeys.
