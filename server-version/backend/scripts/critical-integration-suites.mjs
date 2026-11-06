/**
 * Single source of truth for the critical integration suites that must run
 * and pass on every full backend regression and every local release
 * verification with code gates enabled.
 *
 * Why a manifest instead of two inline lists: the CI aggregation step
 * (`.github/workflows/ci-backend-regression.yml`, "hosted critical
 * integration suites must not skip") and the local release verification
 * (`server-version/scripts/release-verify-local.sh`, `RELEASE_VERIFY_RUN_CODE_GATES=true`)
 * previously maintained separate file lists. A suite added to one list but
 * not the other silently lost its no-skip protection in one of the two
 * paths — exactly how the five suites below (PR #644/#645/#646) ended up
 * with no no-skip assertion anywhere.
 *
 * Consumers:
 * - `scripts/assert-release-test-report.mjs --manifest <this file>`
 *   (validates the merged/local vitest JSON report against this contract).
 * - CI and release-verify pass `--manifest` alongside their existing
 *   explicit file lists; the manifest adds case-level checks on top.
 *
 * Each entry records the exact `it` titles at the review baseline
 * (commit 3939c84836) — except the teacher slot-competition suite, whose
 * titles are as of PR #648, and the BOUND real-binding and frozen-consent
 * suites, whose titles are as of PR #649. `minPassedAssertions` is the floor of passed
 * assertion results for the suite (one per `it` in vitest JSON output).
 * If a case is renamed, deleted, or skipped, the report check fails:
 * renaming breaks the title match, deleting breaks both the title match
 * and the floor, skipping breaks the pending check.
 *
 * To add a suite: append an entry here and update the test that pins this
 * manifest (`assert-release-test-report.test.mjs`). Do not add the same
 * suite to the inline workflow/script lists — the manifest is the only
 * list for these eight.
 *
 * Paths are relative to `server-version/backend/` (the working directory of
 * both consumers).
 */
export const criticalIntegrationSuites = [
  {
    file: 'src/__tests__/integration/trainingStartResumeBypass.postgres.integration.test.ts',
    minPassedAssertions: 3,
    cases: [
      'returns the same attempt while the gate is occupied, without a second attempt or quota use',
      'does not recover an attempt whose retirement transaction is in flight',
      'still applies the live eligibility checks to a resume',
    ],
  },
  {
    file: 'src/__tests__/integration/trainingStartConcurrentFirstStart.postgres.integration.test.ts',
    minPassedAssertions: 1,
    cases: [
      'concurrent first STARTs yield exactly one attempt with the same attemptId (quota once)',
    ],
  },
  {
    file: 'src/__tests__/integration/surveyGovernanceInterleave.postgres.integration.test.ts',
    minPassedAssertions: 4,
    cases: [
      'replay is rejected when a PAUSE commits while the replay waits on the wave lock',
      'replay after a committed PAUSE is blocked by the governance gate (re-under-lock)',
      'fresh START is rejected when a CLOSE commits while it waits on the wave lock',
      'token revocation committed while the replay waits on the wave lock is re-checked under the lock',
    ],
  },
  {
    file: 'src/__tests__/integration/boundRunReplayInterleave.postgres.integration.test.ts',
    minPassedAssertions: 5,
    cases: [
      'concurrent first admission on one execution fences to exactly one ACQUIRED',
      'unauthorized actor is rejected on the BOUND path',
      'Run CLOSE committed inside the envelope-lock window does not change the BOUND replay outcome (decision D-1, 2026-11-06)',
      'execution REVOKED inside the envelope-lock window does not change the BOUND replay outcome (decision D-2, 2026-11-06; defensive pin, no production writer)',
      'tx2 existing-branch end-to-end: frozen identity match attaches binding and dispatches the claim',
    ],
  },
  {
    file: 'src/__tests__/integration/assessmentRunRespondentIndex.postgres.integration.test.ts',
    minPassedAssertions: 1,
    cases: [
      'has a valid, ready respondent+created_at DESC index with the migration-intended definition',
    ],
  },
  {
    file: 'src/__tests__/integration/teacherTaskSlotCompetition.postgres.integration.test.ts',
    minPassedAssertions: 7,
    cases: [
      'does not drop an eligible task when a newer denied-student execution shares the run',
      'pages run tasks by (created_at, id) keyset without loss or duplication',
      'pages all 101 tasks when every execution shares one microsecond timestamp',
      'inbox HTTP round-trip: the returned nextRunCursor string fetches the next page',
      'assigned-tasks HTTP round-trip: the returned nextCursor string fetches the next page',
      'invalid-date cursor is rejected with 400 on the inbox endpoint',
      'invalid-date cursor is rejected with 400 on the assigned-tasks endpoint',
    ],
  },
  {
    file: 'src/__tests__/integration/boundRunReplayRealBinding.postgres.integration.test.ts',
    minPassedAssertions: 3,
    cases: [
      'three layers after CLOSE: START replay + runtime read/fill + submit + report read on the real binding (D-1)',
      'CLOSE terminates a CLAIMED-but-undispatched execution: EXPIRED + claim ABORTED (D-9)',
      'restart counts toward maxAttempts on a plain questionnaire: maxAttempts=1 cannot restart, maxAttempts=2 allows exactly one restart (D-7)',
    ],
  },
  {
    file: 'src/__tests__/integration/boundRunReplayConsentFrozen.postgres.integration.test.ts',
    minPassedAssertions: 2,
    cases: [
      'other frozen identity fields still reject after a change (D-5 negative)',
      'frozen consent survives re-consent: dispatch and replay keep A while the current consent is B (D-5)',
    ],
  },
  {
    file: 'src/__tests__/integration/boundRunReplayRealBinding.postgres.integration.test.ts',
    minPassedAssertions: 3,
    cases: [
      'three layers after CLOSE: START replay + runtime read/fill + submit + report read on the real binding (D-1)',
      'CLOSE terminates a CLAIMED-but-undispatched execution: EXPIRED + claim ABORTED (D-9)',
      'restart counts toward maxAttempts on a plain questionnaire: maxAttempts=1 cannot restart, maxAttempts=2 allows exactly one restart (D-7)',
    ],
  },
  {
    file: 'src/__tests__/integration/boundRunReplayConsentFrozen.postgres.integration.test.ts',
    minPassedAssertions: 2,
    cases: [
      'other frozen identity fields still reject after a change (D-5 negative)',
      'frozen consent survives re-consent: dispatch and replay keep A while the current consent is B (D-5)',
    ],
  },
]
