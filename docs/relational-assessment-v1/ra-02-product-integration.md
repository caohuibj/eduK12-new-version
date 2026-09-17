# RA-02 Relational Product Integration

Baseline: `main@df857ff6d8f804f3c2292056b618e499cbb6a166` after RA-01 and the consent-authority follow-up.

## Verified integration facts

- Prisma `UserRole` already contains `PARENT`; backend login/JWT accepts that role. The frontend role/access shell still assumes only Student/Teacher/Admin and must be extended explicitly.
- `ObserverAssign` and `ObserverSelfServe` already exist as UI/domain shells, but they are not registered as product routes and are not backed by relational HTTP APIs.
- RA-01 persists authoritative relational assignments and consent lineage, but exposes no HTTP product adapter.
- `CompositeAssessmentAttempt` already has additive `subjectUserId`, `respondentUserId`, `respondentType`, `episodeId`, `assignmentRef`, and `consentId` fields. RA-02 must reuse this attempt model rather than introduce a second runtime.
- Existing `startUserAttempt` is student-course-specific and does not freeze RA-01 identity. Relational launch therefore needs a narrow internal Composite start adapter.
- `RelationalApplicabilityV1` is a separate contract and must not mutate frozen Bundle definitions.
- Current SDQ/TEXI observer Bundles are `DRAFT`; the classroom-environment Student→Teacher resource only exists in tests. RA-02 must not publish, synthesize, or hard-code fake production content.

## Atomic runtime bridge

Relational launch must execute in one Prisma transaction:

1. load the persisted relational assignment;
2. resolve authoritative accepted consent through the RA-01 repository;
3. transition `OPEN → STARTED` through `createRelationalAssessmentService.start()`;
4. resolve an exact, server-controlled launch target for the frozen resource identity;
5. create the existing Composite attempt and freeze the returned relational identity on it;
6. create the existing child runtime records unchanged.

Any failure rolls the assignment transition and runtime creation back together. A caller cannot supply subject/respondent/consent identity or a launch target.

## Product registry boundary

RA-02 adds a small relational product registry keyed by exact `{resourceKind, resourceKey, resourceVersion}`. A registry entry contains display metadata, `RelationalApplicabilityV1`, release state, and an explicit existing-runtime launch target. Catalog APIs expose only entries that are both released and launchable.

The initial production registry is intentionally empty while current observer/classroom content remains unreleased. Tests may inject fixtures. A later content PR can register a resource only after its own content/rights/scientific release gate passes.

## Product surfaces

- Parent: explicit login/home/navigation; assigned observer tasks; self-serve catalog; respondent-specific reports.
- Teacher: observer assignment surface and individual observer reports subject to frozen visibility policy.
- Student: relational-experience assignments in the same task surface; launch through the same Composite runtime.
- Teacher-as-subject: cohort report only, with server-frozen minimum-N and explicit insufficient/unavailable states.

## Privacy and compatibility

- No raw answers in relational product/report APIs.
- No cross-informant averaging.
- No individual Student→Teacher rating exposed to the teacher subject.
- No relationship/cohort query in UNIT FINAL hot paths.
- Existing Student/Teacher/Admin routes and existing Composite runtime behavior remain unchanged.
- No new scorer, Norm Engine, device correction, or social-graph abstraction.

## Delivery commits

1. `feat(fe-relational): add parent auth shell and access mapping`
2. `feat(relational): add product API and atomic existing-runtime launch adapter`
3. `feat(fe-relational): wire observer and relational task journeys`
4. `feat(fe-relational): add relational report states`
5. `test(fe-relational): cover four-role relational journeys`

RA-02 remains Draft until the exact head passes backend/full frontend regression, relational product regressions, browser acceptance, CodeQL, and Docker/Trivy gates.
