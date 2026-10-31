# Teacher exact distribution follow-up

Dependency `0e3d210d63ae1b6c74835265e12943cf6e84ec4e` was normally absorbed
in merge `0ad2ede5b`; the one shared typed Form conflict retained root's equivalent
fix exactly once. Product commits `c9e28f456e4e16b5ca624fe2344bafa1ab4d02db`
and `06f8400f77b7d550c72e299a307dba707f2e4067`, final product tree
`a7fdb443e7ad1c0f6248aca05de6e12936d82d5a`, branch
`feat/pr363-teacher-runtime`. Original phase-one/two evidence was not rewritten.

The source fixture now constructs synthetic source content/accounts, uses actual
`issueAdminContentRoot` with exact TEACHER organization `material.distribute`
grants for the source Composite and every selected C release, then actual
prepare/register/independent review/publish and real identity reader. It no longer
owner-inserts approved delivery rows or a placeholder source. The shared producer
owns origin/distribution/entry hashes and independent runtime cloning. All services
use the existing restricted runtime role; only synthetic account/content setup
uses the disposable database owner. No real tool/content is approved.

The actual PG16.15 database remains `pr363_runtime_test`, with the same 240
candidate migrations/Prisma5.22.0; no new migration was introduced by this source
integration. Each test verifies the actual restricted principal. There are no
module/service/query mocks in these PG journeys. New startup attempts never use
Training/School credentials to enter Teacher. System admin proof is a synthetic
strong-auth service fixture for content issuance, not participant credentials.

The page adapter now hides only explicitly typed business refusals:
`EducationAssessmentSourceError` RESOURCE_NOT_AVAILABLE/ORIGINAL_ISSUER_REVOKED
and `ContentAuthorityError` CONTENT_AUTHORITY_DENIED. Identity/hash errors,
unknown4xx and database failures propagate. The source adapter uses shared
`assertEducationAssessmentDistributionCurrent` only for START; the reader is
identityOnly and does not grant distribution. Root's transactional NEW_START
fence remains authoritative. BOUND/HISTORY never reapply new distribution grants.
The router maps the exact CONTENT_AUTHORITY_DENIED to403.

Observed targeted results (full original failures retained):

| Log | Exit | Result |
| --- | --- | --- |
| pg-distribution-r1 | 1 | fixture read wrong producer transition DTO |
| pg-distribution-r2 | 1 | fixture omitted management expectedRunId/version |
| pg-distribution-r3 | 1 | mixed CG/SJT/Form full journey passed; revoked grant returned500 |
| pg-distribution-r4 | 1 | dedicated SJT and Cognitive passed; new START403 but unstarted list still used identityOnly reader |
| pg-distribution-r5 | 0 | revoked exact original grant blocks other Teacher START403/list empty; frozen mixed parent restores and completes all3 durable units |
| page-whitelist | 0 | 2 selected assertions: known unavailable bounded page/cursor; identity corruption and unknown/DB failure propagate |
| types-distribution / types-distribution-final | 0 | intermediate diagnostics; source helper changed later |
| types-distribution-admission | 0 | exact frozen final backend production inputs |

PG command: from backend, Node24.21.0 `node_modules/vitest/vitest.mjs run
src/__tests__/huiteacher/assessment-runtime.postgres.integration.test.ts -t
FILTER --reporter=verbose`; exact filters/exits/hashes in `checks.json`.
The protected cloud wrapper supplies actual runtime and fixture owner URLs as
in phase-two portable instructions. Unit command selects only
`bounded page|propagates identity` in assessment-runtime.routes.test.ts.
Final type command: `node node_modules/typescript/bin/tsc --noEmit`.
Four distinct PG cases passed across targeted invocations; no all-suite claim.
Passing mixed/dedicated cases were not repeated after diagnosis. New evidence is
unsigned diagnostic output, not formal CI. Nonempty logs use lossless deterministic
gzip, raw copies retained outside the repository and byte-compared.

PostgreSQL was stopped after the tests (exit0); isolated fixture DB is preserved.
No old database change, CI, source18-case repetition, marker changes, PR merge,
deployment, protection or credential changes occurred. Remaining proof: real
Teacher browser, object storage/video, Redis revocation and concurrent races;
report injection belongs to the feedback worker. No current distribution blocker
remains in the tested ordinary Teacher runtime path.
