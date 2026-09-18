# RA-02 Relational Product Integration

Baseline: `main@df857ff6d8f804f3c2292056b618e499cbb6a166` after RA-01 and the consent-authority follow-up.

## Implemented integration facts

- Prisma `UserRole` already contained `PARENT`; RA-02 adds the explicit Parent login/home/AppShell/access mapping rather than treating Parent as staff or Student.
- `ObserverAssign` and `ObserverSelfServe` remain domain UI components; role-aware product containers now back them with authenticated relational HTTP APIs.
- RA-01 persisted authoritative relational assignments and consent lineage. RA-02 adds only a thin product adapter; it does not introduce another assessment runtime.
- `CompositeAssessmentAttempt` already had additive relational identity fields. Relational launch freezes subject/respondent/episode/assignment/accepted-consent identity onto that existing attempt model.
- Parent and Teacher respondents reuse the existing Composite/Cognitive/Situational FINAL-only runtime. Ordinary Student start routes remain unchanged.
- `RelationalApplicabilityV1` stays separate from frozen Bundle definitions.
- Current SDQ/TEXI observer Bundles remain `DRAFT`, and the classroom-environment Student→Teacher content remains test-only. RA-02 does not publish or synthesize content.

## Product authority surface

The authenticated `/api/relational` adapter exposes narrow, server-controlled operations:

- released relational catalog projection for the signed-in actor;
- respondent task list;
- Parent child, Teacher roster and Student course read-models;
- Teacher→Parent, Teacher→Student, Parent self-serve and Student→Teacher issuance actions;
- Parent append-only pending-consent acceptance;
- authoritative assignment start into the existing Composite runtime;
- respondent individual report target for eligible observer assignments;
- Teacher-as-subject minimum-N cohort report states.

Clients never select authoritative subject identity, teacher identity, consent state, relationship snapshot, applicability hash or runtime identity.

## Atomic runtime bridge

Relational launch executes in one Prisma transaction:

1. load the persisted relational assignment;
2. verify the signed-in user is the frozen respondent;
3. resolve authoritative accepted consent through the RA-01 repository;
4. transition `OPEN → STARTED` through `createRelationalAssessmentService.start()`;
5. resolve the exact server-controlled product launch target;
6. create the existing Composite attempt and freeze the returned relational identity;
7. create the existing child runtime records unchanged.

Any failure rolls the assignment transition and runtime creation back together. Replaying the same assignment returns the already-bound attempt rather than creating a second runtime attempt.

Composite aggregate FINAL advances the bound relational assignment `STARTED → COMPLETED` in the same completion transaction. Relationship lookup and cohort aggregation do not enter the UNIT FINAL hot path.

## Consent authority at START and FINAL

A consent-bearing relational assignment freezes the issuance/root consent on the assignment while the runtime attempt freezes the actual accepted descendant consent returned by RA-01 authority.

RA-02 revalidates this authority at FINAL for Composite units and embedded Cognitive FINAL submissions. A pending, revoked or differently resolved consent cannot authorize a new FINAL submission. Completed historical attempts keep normal runtime replay/conflict semantics; later revocation does not rewrite an already-authoritative historical FINAL.

Student→Teacher relational-experience assignments are explicitly consent-free at the per-attempt observer-consent layer and must keep `consentId = null` in the runtime binding.

## Product registry boundary

RA-02 adds a small relational product registry keyed by exact `{resourceKind, resourceKey, resourceVersion}`. A registry entry contains display metadata, `RelationalApplicabilityV1`, release state and an explicit existing-runtime launch target. Catalog APIs expose only entries that are both released and launchable.

The production registry is intentionally empty while current observer/classroom content remains unreleased. Tests inject explicit `PUBLISHED + PILOT` fixtures. Published `COHORT_AGGREGATE` entries must also freeze an authoritative cohort analysis policy whose minimum-N exactly matches applicability and whose metric keys are resolved only from persisted canonical UNIT results. A later content PR may register a resource only after its own content, rights and scientific release gates pass.

## Student→Teacher cohort scope

Student→Teacher issuance derives the Teacher subject from `Course.creatorId`; the client never supplies teacher identity. ACTIVE/APPROVED course membership remains the relationship authority.

All students in the same exact `{teacher subject, course, resource kind/key/version, applicabilityHash}` scope share one deterministic cohort `AssessmentEpisode`. The existing assignment uniqueness contract therefore prevents one student from contributing multiple assignments to the same cohort. Repeated issuance by the same student is idempotent.

Teacher subject reports use the exact RA-01 cohort scope:

`subject + course + episode + resource kind/key/version + applicabilityHash`

Report states are:

- `EMPTY` — no eligible completed cohort yet;
- `INSUFFICIENT` — below the frozen minimum-N; exact sub-threshold respondent count is not disclosed;
- `AWAITING_ANALYSIS` — reserved fallback when an authoritative cohort snapshot is not yet available;
- `READY` — returns only the RA-01 subject-safe cohort projection.

Once minimum-N is reached, the Teacher cohort read path materializes the authoritative snapshot outside the UNIT/FINAL hot path. It serializes by the frozen cohort `AssessmentEpisode`, resolves each completed assignment to its bound completed Composite attempt, consumes only encrypted `AssessmentUnitSnapshot` canonical UNIT results, applies the registry-frozen metric policy, and persists through the RA-01 analysis repository. Repeated reads reuse the latest matching snapshot; later completed respondents produce a new append-only snapshot.

`READY` projections contain aggregate metrics and policy/provenance fields but not respondent identities or `inputResultHashes`.

## Product surfaces

- Parent: explicit login/home/navigation; assigned observer tasks; self-serve catalog; pending-consent acceptance; respondent-owned observer reports.
- Teacher: Parent observer assignment, Teacher-as-respondent observer tasks, and Teacher-as-subject cohort report states.
- Student: Student→Teacher relational-experience tasks in the shared relational task surface.
- Runtime: `/relational/*` is only a focused route namespace. Composite, Cognitive and Situational pages reuse the existing components, APIs, FINAL semantics and frozen child identities.

The shared `/relational/tasks` entry is guarded for `STUDENT | PARENT | TEACHER`; Admin does not enter the respondent product path.

## Privacy and compatibility

- No raw answers in relational product/report APIs.
- No cross-informant averaging.
- No individual Student→Teacher rating or personal report is exposed. The product report-target rejects it, and the generic participant Composite report route has an additional relational authority guard so URL guessing cannot bypass the rule.
- Below-threshold cohort reports do not reveal exact participation counts.
- Existing Student/Teacher/Admin non-relational routes and existing Composite runtime behavior remain unchanged.
- No new scorer, Norm Engine, device correction or social-graph abstraction.
- No content is auto-promoted from DRAFT to Pilot/Research Ready by this platform PR.

## Verification scope

RA-02 regressions cover:

- real-Postgres Parent pending consent → accepted descendant → launchable task;
- relationship/roster-authoritative Teacher and Parent issuance;
- Student→Teacher teacher derivation from the course creator;
- shared cohort episode and idempotent Student issuance;
- minimum-N suppression, canonical UNIT-backed cohort materialization and subject-safe cohort projection;
- generic Composite participant/teacher report, analysis-export, snapshot, attempt-count and wide-export bypass prevention for relational privacy;
- START and FINAL consent authority;
- relational Composite/Cognitive/Situational route return context;
- Parent/Student/Teacher route guards and AppShell navigation.

The PR remains Draft until the exact final head passes backend migration/build/full regression, frontend lint/typecheck/full tests/build, browser acceptance, CodeQL and Docker/Trivy gates.
