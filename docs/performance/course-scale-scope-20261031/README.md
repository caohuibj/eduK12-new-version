# Training course Scale discovery — Draft only

Base: `c63382d0eb6629c7bacbd853b8feb92e0257d46b` (main when this slice started).
Product: `b1fc5493cf8a72dbe8a02f6f939cf42529624c35`, tree `d89bd4e14c1ec32015ad40ce3080343b3268cd57`.

The Training learner course loader requested the entire `/scales/available` catalog, then discarded rows whose returned courses did not match the open course. The server also fetched and projected this student's standalone attempt history for every returned scale. Its three database-method calls were already batched; this slice reduces rows and response bodies, not the number of calls.

The existing endpoint accepts optional `courseId`, adding `courseScales.some.courseId` alongside the unchanged PUBLISHED and original visibility/membership OR. The learner course loader passes its current course ID using existing Axios params. No parameter preserves the default catalog. The full courses array (including multi-course associations), order, attempt ownership/parent exclusions, active-attempt selection, completion, retake and report references remain unchanged. The current frontend course projection is retained. This parameter narrows existing eligibility; it introduces no new authentication or permission layer and does not replace admission when a participant actually starts/resumes work.

## Same-fixture observations

Fixed UTC synthetic rows; actual controller with mocked Prisma, actual loader with mocked APIs. Same fixture hash, locked dependencies and Node v24.21.0. Cold/warm browser, network and server conditions are not measured.

| Observation | Baseline request with courseId (ignored) | Candidate request with courseId |
| --- | ---: | ---: |
| Returned Scale rows | 12 | 3 |
| Returned standalone attempt rows | 14 | 5 |
| Serialized response body bytes | 5936 | 1623 |
| gzip level-1 response body bytes | 707 | 496 |
| Prisma method calls per request | 3 | 3 |

The candidate target DTOs exactly equal the previous catalog's client-side course projection. Default response bodies before/after are byte-equivalent under JSON serialization. `measurements.json` records the fixture hash and definitions. No actual SQL, CPU/RSS, latency, p95, concurrency or production savings are claimed. HTTP headers, TLS and browser transfer bytes are excluded.

## Necessary checks and actual results

The only product edits are one backend predicate and one existing client request. Local execution is the primary location:

- Backend default catalog/attempt ownership case: baseline PASS, reused without rerunning that case. It covers accidentally changing the global catalog or including another user / parent-owned attempt.
- Backend course DTO/query scope and inaccessible/unrelated course cases: baseline 2 FAIL because the parameter was ignored; candidate 2 PASS (default case filtered). They cover ignored or over-broad course filtering and prove that course arrays/statuses are preserved while the attempt query contains only returned scale IDs.
- Existing frontend loader/projection case, extended with exact request params: baseline FAIL; candidate PASS, 13 other cases filtered. It covers forgetting to send the course ID and verifies the existing mixed-tool projection remains the same.
- Affected backend and frontend app type checks: each ran once on the exact product component trees, both exit 0 (35.9 / 44.4 seconds). Actual argv, timing, exit, before/after selected inputs and log hashes are retained. Empty logs alone are not success evidence. Backend tsconfig excludes test sources; frontend app config does not cover the separate Cognitive project.

The distinct selected union is four cases (baseline 1 + candidate backend 2 + frontend 1), not a new four-case all-pass execution. `selected-evidence.json` lists exact names, statuses, filters, compressed and decompressed hashes and source-association limits. Original red reporters/logs remain. Unsigned executions ran on uncommitted source hashes later preserved in the product commit; no contemporaneous signature is invented. Final `run-recorded-tests.py` includes the candidate-only selector added after the baseline; original argv are retained in their own process records.

No application build, full suite, database, browser, security-threshold change, production migration or deployment was run. The preserved originals are not formal CI admission or deployment qualification.

## Parallel work / merge scheduling

At inspection, open Group/Long PRs #427, #433, #429, #430, #431 had no direct overlap with these four source/test files; exact inspected heads and complete file inventories are in `concurrent-pr-inventory.json`. Shared downstream concerns remain course delivery/attempt eligibility and eventual merged component types. This slice does not touch Composite service (changed by Long), cognitive quota, reporting, schema or CI control files. Scale status/discovery is read-only and does not change Group/Long snapshots or disclosure.

Cognitive and Composite course loaders still fetch broad catalogs; those observations are not fixes in this PR. Composite additionally consults the existing course task feed for multi-course delivery. They remain separate future work.

Keep this PR Draft; no Ready, merge, auto-merge or deployment. Existing Draft compile/types would repeat the local type runs; preparation commits retain `[skip ci]` and no CI control route is added for a waiting Draft. DOT can schedule the existing bounded qualification/admission after the Group/Long batch. This is a deliberate unexecuted boundary, not CI success. Do not repeatedly sync main or rerun checks while waiting.
