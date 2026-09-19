# PR3 review and evidence — 2026-09-19

Review baseline: PR #121, head `d15eab8353d02d5d70f760520bbaad85ac635490`, base `38bc442f834d4cdaf0c3d80ab17edcd2281ce3ea`.
Scope: ordinary Organization GROUP reports from SELF Run Track observations; only completed COMPOSITE-bound executions currently have an authoritative result adapter. Protected feedback, longitudinal analysis and CSV remain rejected/deferred to PR4.

## Findings fixed in this follow-up

1. The previous Full Gate had 1,868 passing backend tests and one failure. Consent recovery correctly re-bound the admitted operation and FINAL rejected revoked consent, but the regression expected `RELATIONAL_CONSENT_REQUIRED` instead of the authority's existing `RELATIONAL_CONSENT_REVOKED`. Correct the assertion without weakening FINAL.
2. Floating-point accumulation depended on input order although analysis identity did not. A regression using `[1e16, -1e16, 1]` first reproduced different projections under the same identity. Sort numeric inputs before accumulating mean/variance so permutations produce identical projections and snapshot hashes.
3. Add all three PR3 PostgreSQL suites to the CI report checker that rejects missing/skipped suites. Add direct numeric-quality and resource-floor tests.

Previous failing Full Gate: https://github.com/caohuibj/eduK12-new-version/actions/runs/35418617937

## Local verification

Environment: isolated PostgreSQL 14.20 database created for this review; no application database or synced project references modified. All migrations deployed successfully on an empty database. Backend TypeScript build passed.

Run from `server-version/backend` with DATABASE_URL and RELEASE_INTEGRATION_DATABASE_URL explicitly pointing to the isolated database and a test DATA_ENCRYPTION_KEY:

```sh
npm run db:migrate:guarded
npm run build
npm test -- src/__tests__/reporting/reporting-core.test.ts src/__tests__/integration/assessmentRunConsentRecovery.postgres.integration.test.ts src/__tests__/integration/reportingCore.postgres.integration.test.ts src/__tests__/integration/reportingQueryBudget.postgres.integration.test.ts --no-file-parallelism --reporter=default --reporter=json --outputFile=/tmp/huisurvey-pr3-review-vitest.json
node scripts/assert-release-test-report.mjs /tmp/huisurvey-pr3-review-vitest.json src/__tests__/integration/assessmentRunConsentRecovery.postgres.integration.test.ts src/__tests__/integration/reportingCore.postgres.integration.test.ts src/__tests__/integration/reportingQueryBudget.postgres.integration.test.ts
```

## Plan coverage and remaining limits

| Plan area | Evidence and remaining work |
| --- | --- |
| C01 governed specs | Spec validation, platform-only governance and REVIEWED/PUBLISHED SQL immutability exist; PostgreSQL core suite covers immutability. Full HTTP governance matrix remains unproven. |
| C02/C05/C06/C07 primitives, eligibility, privacy, maturity | `reporting-core.test.ts`: A-01 through A-05, result association portion of A-07, M-02/M-03, distribution suppression, resource floors and deterministic permutation regression. |
| C03 cohort | Frozen Run Track member tuples include Membership provenance; core PostgreSQL suite distinguishes same-N cohorts. Arbitrary frozen-label subset selectors are not exposed. |
| C04 batch sources | `reportingQueryBudget.postgres.integration.test.ts` resolves 100/500 real canonical results through COMPOSITE; unsupported runtime bindings fail closed. |
| C08 persistence | Core PostgreSQL suite concurrently inserts eight candidates and checks one artifact, immutable storage, and fresh read authorization. Uses concurrent promises, not a controlled barrier. |
| C09 authorization | Current Organization access and explicit-deny recheck covered. Historical Parent exact-resource access is not implemented in this GROUP service; readers without current Membership are denied. This is not completion of the planned historical-access contract. |
| C10 API | Organization reporting handlers exist and return a projection allowlist. Full request/response authorization matrix needs separate evidence. |
| C11 performance/migrations | Fresh migration and logical Prisma-call budget verified. Actual emitted SQL counts/returned-row budgets and a populated baseline-to-head upgrade rehearsal remain outstanding. |

The PR description's “Ready” wording must not be interpreted as all V2.1 exit criteria being complete. This review fixes the reproduced defects; the remaining scope/evidence gaps above require closure before declaring full plan acceptance. Final CI status must be checked on the pushed candidate, not inferred from local results or this baseline.
