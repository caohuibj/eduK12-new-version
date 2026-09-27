# Prelaunch runtime closure: PR 1

Base: `main@7a2daddf4b33b4c9a3dd548e318cc7049fcff33a`. Implementation and required evidence, not a capacity certification. Exact-head CI results belong to the PR checks and final acceptance comment. PR 2 must start from main after PR 1 passes its gates and is merged.

## Implemented boundaries

| Finding | Implementation | Evidence required before merge |
| --- | --- | --- |
| Organization-wide START serialization | Organization/Run/account/relationship read fences use SHARE; execution and claim stay exclusive. Account/intake expiry is evaluated in a separate statement after lock waits. | assessmentRunStartClaim, assessmentRunAllocationMatrix, assessmentRunStartFences, lifecycle/recovery PostgreSQL suites. Two START transactions must overlap at a barrier inside admission. |
| Reporting payload amplification | Full-Track lightweight structural/header validation remains; only selected canonical payloads are loaded, decrypted, parsed and hashed. Immutable CPU processing occurs after the repeatable-read transaction. | reportingQueryBudget: query count, encrypted rows, decrypt and parse calls for selected cohorts; unselected structural corruption remains rejected. |
| Aggregate composition disclosure | Ordinary numerical aggregates require the actual complete frozen population and all valid metric contributors. Arbitrary subsets, missing contributors and attrition-based matching require current ORG_ADMIN or PSYCHOLOGY_STAFF authority. | Fixed-population tests and PostgreSQL subgroup tests cover A/B/C, different specs, concurrent publication, manual Waves, late contributors, history and export after capability revocation. |
| Reporting execution bound | One process-local gate covers analysis, manual Wave binding, artifact reads and Reporting export creation/download including response serialization. Redis user budgets remain. | reporting-runtime-execution and reporting-heavy-entrypoints: disconnect, exceptions, cross-endpoint contention and leak prevention. |
| Parent progress | Guarded GREATEST advances counts/progress only within the same epoch/frozen slots/context/runtime. Terminal CAS and canonical snapshots are unchanged; enum parameters have explicit SQL casts. | assessment-runtime/v32-2.postgres.integration.test.ts and full questionnaire/composite/Bundle regression. |
| Login burst versus abuse | Separate configurable NAT ingress, account+IP and account-global failure budgets; one live login operation per account; after the shared failure threshold, a failed operation retains only a lightweight account permit for a minimum one-second interval outside the password gate. | Login limiter/controller tests cover shared NAT, distributed same-account attempts, actual throttling, bounded inputs and infrastructure errors. |
| Anonymous Cognitive START | A 256-bit intent commits in a cross-tab IndexedDB readwrite transaction before HTTP. Server-scoped derived identity, uniqueness and transactional quota converge on one admission. | PostgreSQL idempotency/quota and prelaunch-start-intent-browser-e2e.cjs: first tabs, lost committed response, exhausted link, local abort and blocked storage. |

## Deliberate privacy constraint

This is a conservative product boundary, not Differential Privacy or protection against every inference using auxiliary knowledge. Ordinary readers cannot obtain exact numerical aggregates for different contributor sets of the same frozen source. Pairwise differencing checks and the old exposure-history/Track publication lock are removed instead of claiming compositional protection they do not provide.

The decision uses actual execution membership rather than specId, selector spelling or creator identity. Each repeated-cohort Wave must use its complete source. Matched numerical results additionally require identical stable subject populations and complete valid cases. Every history read and export uses current authority; a trusted creator does not confer trusted disclosure rights on an ordinary Run owner.

Protected feedback follows the same complete-contributor rule. Since its public projection omits respondent counts, new protected artifacts contain a private hashed publication proof, not public counts/identities. Its analysis identity carries a disclosure-policy revision to avoid reusing an old unproved artifact.

Historical artifact bytes, hashes and canonical snapshots are not rewritten. Historical unsafe subgroup/partial-contributor reads are intentionally restricted to trusted aggregate roles, including old export tickets. Legacy protected artifacts without proof require trusted authority; a safe new report may be generated separately. This is a documented read-policy tightening, not an unchanged historical access claim. Existing protected subject-denial rules remain.

## Anonymous recovery and shared devices

START intent is a bearer secret, not an account identifier. It must never appear in URLs, logs, management lists, or be derived from the public link alone. Structured/text redaction covers startIntent/start_intent/start-intent. START responses are no-store. New HTTP admissions require intent; existing recovery credentials keep their contract. Legacy internal fixture service calls remain compatible.

The shared browser intent stays after acknowledgement: deleting it could orphan a concurrent response-lost tab. Explicit new-participant action rotates it with compare-and-set semantics without consuming quota. The shared-device notice asks users to save the old recovery credential before another person's response. Corrupt or blocked durable storage fails before new HTTP admission, never falling back to a fresh unpersisted secret.

## Resource and compatibility notes

No distributed lock, authority cache, worker thread, FINAL queue or 202 contract. The bounded account map holds only live operations/brief failure intervals, never cached authority. Account data is read when password work is admitted rather than before a potentially long queue wait. Password hash strength stays unchanged.

The account-global threshold is a soft verification throttle, not a hard 15-minute lock or a claim of a fixed total attempt ceiling. Correct credentials are not held for that failure window. Redis/database/infrastructure failures return 503 and are not counted as bad passwords. Input bounds prevent large credentials or extra fields from filling the queue. NAT, password concurrency/queue and Reporting permits remain configurable conservative values pending actual 4C4G measurement.

PR 1 introduces no schema migration. Supported runtime upgrade, worker-only generic file exports, bounded generic preview, durable batch retry, file lifecycle, subprocess cancellation and production resources remain PR 2, not completed here.

## Acceptance

Use only isolated CI PostgreSQL/Redis URLs and synthetic fixtures. Backend build/full regression; frontend lint/typecheck/full tests/build; native browser; CodeQL; Docker; populated baseline/reapply; no-skip PostgreSQL gates; final diff review are required at the same head. Draft checks and skipped dependencies are not acceptance.

```sh
cd server-version/backend
npm run build
npm test -- --no-file-parallelism
npm test -- src/__tests__/integration/assessmentRunStartFences.postgres.integration.test.ts src/__tests__/integration/reportingSubgroupPrivacy.postgres.integration.test.ts src/__tests__/reporting/fixed-population-privacy.test.ts src/__tests__/reporting/reporting-heavy-entrypoints.test.ts src/__tests__/middleware/loginRateLimit.test.ts src/__tests__/controllers/login-admission.test.ts --no-file-parallelism
```

The browser gate executes the native IndexedDB/response-loss test after FE-11 storage faults. START/privacy PostgreSQL suites are critical no-skip. Phase 0 closure and exploratory suites are manual evidence workflows and do not occupy the Mac runner ahead of required backend/browser CI. The short Phase 0 smoke remains automatic for runtime hot paths. Same-host A/B mixed ordering is derived only from stable fixture identity (never the reseeded run ID), and manual closure accepts a targeted workload list so a suspicious workload such as N-back can be rerun without the full closure matrix. Temporary review/staging workflows and their manifest are removed from the candidate tree before full acceptance.
