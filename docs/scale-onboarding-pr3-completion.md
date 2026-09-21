# Scale onboarding PR-3 completion and verification

Target: `feat/scale-onboarding-pr3` → `content/scale-expansion`. Validation-only PR #139 targets `main` to run the existing Full Gate; it must not be merged.

## Problem and resulting behavior

PR-3 had three failing backend regression cases and incomplete connections between the source registry, installer, participant context and frozen admission. This change continues the existing branch. It fixes the V1 parser module load, gives the query-budget fixture a real frozen runtime, and explicitly publishes the isolated V32-2 fixture. It also closes the functional gaps below.

- A new `src/modules/scale/instruments/<key>/<version>/instrument.ts` exporting `SCALE_INSTRUMENT_SOURCE` is discovered at build time. Its declared release status is preserved. It participates in the executable/source registries and Library without a platform code edit. The six compatibility descriptors keep their historical ordering and behavior.
- The installer defaults new Scale rows to DRAFT/HIDDEN, preserves existing lifecycle/owner fields, refuses version/content/reference conflicts, and evaluates activation in a serializable transaction. The existing additive deployment SQL table is now represented in Prisma as well.
- Managed starts require exact locale/localization revision, localization review, bound durable authorization and actual deployment mode/commercial intent. Unknown rights actions and unspecified grant commercial intent fail closed. Revoked newer grants cannot resurrect older grants. The old WHO5/SDQ/TEXI gates remain explicit compatibility adapters until PR-4; their restrictions are not weakened by installation.
- Standalone POST start returns a context preflight with only required field names, with no questions or attempt written. The React runner collects those facts and retries. Age is computed from birth year/month and the frozen UTC context clock. Extra optional demographics are not collected into the snapshot.
- Questionnaire/public/composite starts verify that mandatory facts can be collected before measurement. Concrete deployment modes are checked at runtime freezing and admission. Composite children carry their parent subject/respondent binding; new relational contexts identify the subject, and observer eligibility refuses an unbound subject context.
- Missing/ineligible facts never persist a mutable denied admission. Embedded admissions reload and lock the child inside a serializable transaction, read parent context within that transaction, and retry serialization conflicts. Conflicting CAS bindings fail closed.
- Resume validates frozen identity and uses frozen questions. Restart may accept corrected required context and creates a new epoch only after current policy/access checks succeed. A managed admission freezes a completion deadline (configured window, seven-day compatibility default). In-flight completion uses that deadline; completed replay is independent of today's date and current grants.
- Library start denials expose the same deployment reason codes. Managed availability explicitly says participant eligibility has not been evaluated. Result storage and PR-2 audience projection remain separate.

## Scope mapping

| PR-3 tasks | Implementation |
| --- | --- |
| 3.01–3.06 | Deployment schema/repository/evaluator, localization and legacy adapters, transactional dry-run/apply installer and version conflict |
| 3.07–3.11 | Trusted identity/context binding, required-fact collection, configuration checks, eligible-only admission persistence |
| 3.12–3.14 | Four-surface admission, submit/replay/restart, CAS and serializable retries, frozen completion deadline |
| 3.15–3.16 | Explicit six-identity/custom V1 compatibility, V1/V2 readers, managed-only V2 writes, safe reason-code responses |

PR-4 still owns migration of all legacy content into per-instrument sources, deletion of the compatibility gates/old catalog overlays, production audit/backfill tooling, and the full two-instrument platform acceptance campaign. No real DASS content or production deployment is activated here.

## Verification evidence

`server-version/backend/src/__tests__/scale/pr3-managed.postgres.integration.test.ts` uses a test-only source/registry adapter and real PostgreSQL, real transactions, the real installer, the real start controller over HTTP, and the real unified final-submit service. Its authenticated actor is supplied by test middleware; it does not replace the DB with mocks. It covers DRAFT/HIDDEN install, idempotency, no-question preflight, underage/direct-submit rejection, concurrent starts/resumes, grant revocation, full encrypted result storage with educational-only responses, replay after clock advance, the four-mode age matrix, three embedded parent variants with concurrent freeze, identity mutation rejection and version conflict.

`instrument-generator.integration.test.ts` copies the backend into a temporary workspace, adds only one synthetic instrument directory, runs the real generator/check command, and verifies source/runtime/package/Library discovery with DRAFT status preserved. Synthetic content never enters the production index.

Additional evidence: `pr3-context-preflight.test.ts`, `scale-deployment-policy.test.ts`, `frozen-policy-snapshot.test.ts`, `pr1-baseline-compatibility.test.ts`, existing Scale projection/export/report tests, PostgreSQL query-budget and V32-2 integration tests, and the React ScaleAssessment preflight test.

Local environment: isolated PostgreSQL 14 container on loopback port 55439; all 77 migrations applied, then repository seed. No production database was accessed. The first broad run exposed missing cognitive seed and changed Library ordering; both were corrected before the final run.

Final local results (2026-09-21):

- Backend `npm test -- --maxWorkers=2` with all integration DB variables pointed at the seeded isolated database: **322 files / 2014 tests passed, zero skipped**, 71.59 seconds.
- After adding restart/deadline/rollback cases, the final `pr3-managed.postgres.integration.test.ts` run: **10 tests passed**, including real concurrent unique-index/serialization conflict recovery.
- Backend `npm run build`, generated-index check and `prisma validate`: passed. All 77 migrations applied successfully.
- Frontend ScaleAssessment and reporting regression: **9 files / 24 tests passed**. `npm run lint`: zero errors (100 existing warnings); `npm run typecheck` and `npm run build`: passed.
- `git diff --check`: passed.

The full run preceded the final additive Library participant-eligibility hint and two additional DB test cases; those final changes were followed by backend compilation and the targeted DB run. No CI result is claimed here. Browser/production-container CI is triggered on push; per the request its completion is not awaited.

## Deployment and rollback

Apply the additive migration before running this build. Installation and deployment activation do not publish a new Scale: publication remains a separate existing administrative action. No bulk backfill is included. Do not delete deployment revisions, frozen V2 snapshots or encrypted full results when rolling back.

To halt new managed starts, retire the relevant active binding or pause/depublish the affected resource. Keep this version's V1/V2 readers and frozen-deadline completion handling available for in-flight attempts. Do not revert to an older unrestricted reader. Historical V1 snapshots keep their original hashes and do not receive synthetic birth dates or retroactive eligibility.
