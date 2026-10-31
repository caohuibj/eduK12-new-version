# Training course Cognitive discovery — Draft only

Base: `15e58e0e2d186d041293b3f2e139bc243946d3f3`.
Product: `bdc558512e01a7c061e253069463a51f8ba204b4`, tree `6bdd86122f934f91397a79efb5754e9dbce506fc`.

The Training course loader fetched every eligible Cognitive assignment and latest standalone session across all the student's courses, then discarded other course IDs in the frontend. The metadata list does not call quota computation. Its two existing Prisma method calls are already batched; the redundant work is returned rows, relation projection and serialization.

The existing `/cognitive/assignments/my` endpoint now accepts optional `courseId`. It is passed to the existing membership lookup, ANDed with the same student identity and ACTIVE/APPROVED statuses. Only those membership course IDs reach the unchanged PUBLISHED, standalone and non-library assignment predicate. The existing no-membership early return skips the assignment lookup for an unrelated course. The shared frontend API accepts an optional ID (URL-encoded); the Training loader supplies the open course. CognitiveHome calls without an ID retain the same URI and full list. There is no new API, authentication, cache, quota, runner, version, submission or disclosure mechanism.

## Same-fixture observations

Actual controller and assignment service with Prisma mocks; frontend shared API and actual course loader with mocked API responses. Data and UTC dates fixed, unchanged locked dependencies, Node v24.21.0. Metrics are serialized controller response bodies, gzip level 1; not HTTP transfer bytes or browser latency.

| Observation | Baseline course parameter ignored | Candidate |
| --- | ---: | ---: |
| Eligible membership rows | 4 | 1 |
| Selected assignment rows | 16 | 4 |
| Selected latest session rows | 12 | 3 |
| New admission ON: JSON body bytes | 8775 | 2221 |
| New admission ON: gzip body bytes | 870 | 498 |
| New admission OFF: JSON body bytes | 6526 | 1660 |
| New admission OFF: gzip body bytes | 778 | 469 |
| Prisma method calls with eligible course | 2 | 2 |

Default responses are identical before/after, for ON and OFF. Scoped DTOs exactly match the old client course projection. OFF still hides unstarted tasks, resumes frozen active sessions, retains completed feedback, and marks unfrozen active sessions paused without a resume link. Foreign-user and Composite-child sessions remain excluded by the existing selection. A course with no current eligible membership now returns after the original membership query rather than loading unrelated tasks.

`measurements.json` fixes the fixture hash and observed row/body definitions. No real SQL/count/duration, CPU, RSS, network latency, p95, capacity or production savings were measured. No participant sessions, submissions or reports were created.

## Necessary verification, once per affected check

- Baseline backend: default metadata/ownership/order case PASS; new course scope, closed-admission state and no-membership cases 3 FAIL because the parameter was ignored. Candidate ran only those three failed cases: 3 PASS, default case filtered and reused from baseline. This catches a lost scope predicate or changed eligibility/session state while preserving the old full-list contract.
- Frontend: the existing shared API case additionally checks default URI and encoded scoped ID; the existing mixed-tool loader case additionally requires its course ID to reach Cognitive. Baseline 2 FAIL; candidate 2 PASS, 23 other cases filtered. These check the complete request wiring, not another runner.
- Affected backend and frontend app type checks each executed once on the exact product component trees: exit 0 (36.3 / 44.3 seconds). Actual argv, real exits, selected before/after compiler inputs, log hashes and source identity are preserved. Empty logs alone do not establish success. App tsconfig includes the changed cognitive API source and tests; the narrower separate Cognitive project was not redundantly run. Backend tsconfig excludes tests.

Six distinct selected cases are a disjoint original union: baseline backend 1 + candidate backend 3 + candidate frontend 2. This is not a new six-case all-pass invocation. `selected-evidence.json` contains complete original case statuses, selections, failure continuations, filtering and compressed/decompressed hashes. All baseline failures/reporters/logs remain unchanged. Original executions were unsigned and on uncommitted bytes later saved as the product commit; their actual input hashes are retained, without invented contemporaneous Git authentication. Final helper includes the candidate-only selector added after baseline; original argv remain in their individual records.

No full suite, production build, browser, database, CI scan or deployment was run. This evidence is local and not formal CI admission or merge qualification. Preparation commits retain `[skip ci]` so generic Draft compile/types do not duplicate completed checks; no waiting-Draft CI route is introduced. DOT schedules later bounded qualification after the current Group/Long batch.

## Parallel work and remaining boundaries

Exact inspected heads/file inventories for #421, #427, #433 and #435 are in `concurrent-pr-inventory.json`. This slice has no direct file overlap with those inspected Group/Long PRs, including #421's quota change: the metadata list does not use its quota reader. No Composite, reporting, schema or CI control files change.

There is an intentional two-file overlap with our waiting Scale PR435: `training/courseAssessments.ts` and its test. These are independent adjacent source calls/expectations; eventual integration must retain both Scale course params and this Cognitive course argument. This branch is independently based on main and does not republish PR435 or supersede its evidence. Combined-tree qualification belongs to the later merge window; do not repeatedly sync main while waiting.

Composite full-catalog discovery remains observed, not fixed. Keep this PR Draft. No Ready, auto-merge, merge, production migration or deployment is authorized in this delivery.
