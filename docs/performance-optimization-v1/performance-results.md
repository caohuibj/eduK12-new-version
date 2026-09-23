# Current-main performance results

Status: **PHASE0_MEASURED; CODE_READY=true; CAPACITY_VERIFIED=false**. PERF-01 measured one first-attempt fresh HTTP FINAL per 14 registered templates and two additional policy-domain branches. All 16 completed durably in the one-second steady window and after drain, without replay, dropped iteration, HTTP failure or retry. This is a low-speed cost and accounting baseline, not a rated throughput or percentile latency result.

The runtime candidate was `c91456d7f3c9c1b7e0a27b8351731acf2bdd7774`, based on `main@68afbe63672b42c9a2086f834d5ae46794c3c013`. P1-C05 changes only tooling, fixtures and evidence; it does not alter the measured service path. One Node API process used task-owned PostgreSQL 14.24 and Redis 7, with `NODE_ENV=test`, opt-in SQL event counting, default admission/pool parameters, one offered request/s for one second per group, and one no-work `/metrics` control scrape subtracted from SQL and Prisma totals. API and k6 shared a Mac with unrelated workloads. The fixture checksum, 13-table PostgreSQL cardinality/index/ANALYZE snapshots, per-route model/action distribution, phase means, raw/corrected SQL and network bytes are in [route-baseline.json](../../server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.json). The concise route table is in [route-baseline.md](../../server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.md); the comparison template is [query-budgets.csv](query-budgets.csv). K6 `data_received` includes protocol overhead and is labelled network bytes.

| Representative baseline | Generic SQL events | Relational / organization SQL events | Interpretation |
| --- | ---: | ---: | --- |
| Standalone Scale | 9 | N/A | One fresh generic request |
| Standalone Cognitive authenticated / public | 11 / 8 | N/A | Separate auth and public paths |
| Standalone SJT | 10 | N/A | Linear 10-scene fixture |
| Embedded Composite Scale authenticated / public | 12 / 9 | 13 / 13 | Legacy course and organization assignment policy branches measured separately |
| Embedded Composite SJT authenticated / public | 24 / 21 | N/A | Includes parent access and child completion |
| Questionnaire Form authenticated / public | 20 / 21 | N/A | Same-parent and public recovery paths |

The remaining route cases and their exact counts appear in the linked table. A single request duration per case cannot support p95/p99 or an A/B improvement claim. The organization sample exercises a real `ORGANIZATION_RUN` assignment policy branch with a `STUDENT`/`SELF` respondent; it does not cover a full organization campaign, observer path, or consent-required run. Unknown policy status is not assumed generic: the fixture seeder sets explicit domain and the baseline rollup rejects missing/failed domain samples. The production-scale table-cardinality gate, 4C4G target, independent load generator, 15-minute repetitions, mixed soak and burst remain unverified.

## Candidate decisions from the before baseline

| Planned item | Baseline signal | Decision |
| --- | --- | --- |
| P2-C02 SJT validation index | SJT validation phase is observed in the phase evidence; correctness corpus includes 10/30/60 scenes and branching. | Required by plan; measure deterministic CPU reduction on the same corpus. |
| P2-C03 SJT UNIT/aggregate recovery | Embedded SJT uses 21–24 SQL events; committed-child response-loss recovery was tested separately. | Required correctness and admission change; preserve durable identity. |
| P2-C04 child binding | Auth and public embedded paths have different full HTTP costs, including guards. | Required; attribute duplicate binding reads within the service before claiming savings. |
| P2-C05 narrow SJT reads | Standalone and embedded SJT costs are 10 and 21–24 SQL events. | Required; narrow read is in scope, lock-read shortcut remains conditional on evidence. |
| P2-C06 Cognitive prepared scoring | Auth/public full HTTP costs are 11/8 SQL events; profile corpus covers all 29 current identities and 87 cases. | Required; verify decoded output equality and end-to-end effect. |
| P2-C07 reference freeze/load | Current executable Scale registry declares no HTTP reference policy; isolated PostgreSQL multi-selection test passes. | Required compatibility work; HTTP reference benchmark remains unsupported until a real policy exists. |
| P2-C08 aggregate indexing | Non-last embedded samples expose child/parent costs but do not measure last-unit aggregate. | Required; add last-unit baseline before asserting aggregate savings. |
| PERF-04 worker/cache/CDN/multi-API | No qualified post-PERF-03 bottleneck evidence exists. | Deferred; conditional PR not triggered. |

The full-request reporter's failure fixtures include all replay, only 503, scheduler drops, response lost after commit, retry recovery and missing metrics. A one-second lost-response run failed closed because the scheduler ended before its retry; a separate four-second run reconciled four durable writes, including one retry-recovered replay. These are retained in [full-request evidence](../../server-version/perf/current-main-v1/evidence/full-request-20260923/README.md), rather than discarded as inconvenient runs. Historical Gate-E rates are background only and are not reproduced as current results.

## Phase 0 / P2-C01 exploratory baseline

Environment: GitHub-hosted Ubuntu, 2 logical CPUs / ~8 GiB, disposable PostgreSQL 14 + Redis 7, API and k6 on the same runner. **PRE-CAPACITY only; not CAP-2C4G/CAP-4C4G.**

### 10 fresh FINAL/s × 5 s

| Workload | Durable | p50 | p95 |
| --- | ---: | ---: | ---: |
| Scale typical | 50/50 | 17.23 ms | 30.67 ms |
| Cognitive N-back standard | 50/50 | 20.95 ms | 33.62 ms |
| Cognitive CPT standard | 50/50 | 27.67 ms | 42.80 ms |
| SJT linear 30 | 50/50 | 34.22 ms | 55.09 ms |
| SJT linear 60 | 50/50 | 51.50 ms | 77.78 ms |

At this point the SJT `sjt.validation_index` phase mean was ~2.06 ms for 30 scenes and ~6.52 ms for 60 scenes, which is consistent with the existing per-response full-index rebuild.

### 25 fresh FINAL/s × 5 s

After fixing k6 duration-boundary accounting (allow an already-started +1 scheduler-boundary iteration to finish), the representative result was:

| Workload | Result | p50 | p95 |
| --- | --- | ---: | ---: |
| Scale typical | 126 fresh/durable (125 configured + 1 recorded boundary arrival) | 18.93 ms | 32.20 ms |
| Cognitive N-back standard | 126 fresh/durable | 18.95 ms | 28.52 ms |
| Cognitive CPT standard | 125/125 fresh/durable | 23.28 ms | 64.05 ms |
| SJT linear 30 | 126 fresh/durable | 30.66 ms | 129.88 ms |
| SJT linear 60 | **overload: 121 fresh/durable, 5 dropped** | 876.50 ms | 1086.83 ms |

The SJT-60 overload is retained as a failure point, not converted into a green capacity result. Artifact evidence: workflow run `35824011273`, 10-rate artifact `10734172166`, 25-rate artifact `10735135174`.


## Phase 0 / P2-C02 SJT validation-index A/B

Decision: **KEEP**. The comparison is GitHub-hosted PRE-CAPACITY evidence, not CAP-2C4G/CAP-4C4G.

P2-C02 replaces per-response reconstruction of the full scene/channel/options validation lookup with one request-local immutable index. Public validation codes, duplicate-answer rejection, authoritative branching trajectory, scorer output and persistence semantics remain unchanged; ordinary CI and the P2-C01 PostgreSQL/privacy invariant gate are green.

### 25 fresh FINAL/s × 5 s

| Workload / metric | Before P2-C02 | After P2-C02 |
| --- | ---: | ---: |
| SJT-30 `sjt.validation_index` mean | 1.709 ms | 0.128 ms |
| SJT-30 fresh durable | 126/126 | 125/125 |
| SJT-30 retries / drops | 0 / 0 | 0 / 0 |
| SJT-30 p50 / p95 | 30.66 / 129.88 ms | 29.14 / 113.39 ms |
| SJT-60 `sjt.validation_index` mean | 6.052 ms | 0.137 ms |
| SJT-60 fresh durable | 121 | 125/125 |
| SJT-60 retries | 24 | 7 |
| SJT-60 dropped iterations | 5 | 0 |
| SJT-60 p50 / p95 | 876.50 / 1086.83 ms | 714.12 / 1041.48 ms |

The deterministic validation-phase reduction is about 92.5% for the 30-scene sample and 97.7% for the 60-scene sample. End-to-end latency is noisier across separate hosted runners and is not used as the sole KEEP criterion.

The after-run SJT-60 job was marked failed by the exploratory workflow because `PERF_REQUIRE_ALL_FRESH=1` also forbids legal capacity retries. Artifact inspection shows the accounting itself is valid: 125 configured/started, 125 fresh, 125 durable, 0 replay, 0 drop, 0 eventual failure, with 7 UNIT-busy 503 attempts followed by successful retry. The strict all-fresh rule remains intact for baseline gates; the exploratory workflow now runs with that strict option disabled so retry/drop can be retained as overload evidence instead of being mislabeled as invalid accounting.

Before evidence: artifact `10735135174` (P2-C01 / `8e1885e2`). After evidence: artifact `10734177804` (P2-C02 / `f72c142`), plus 10-rate artifact `10735135753`.


## Phase 0 extended hosted curve before P2-C03

Environment remains GitHub-hosted Ubuntu with 2 logical CPUs / ~8 GiB, API + PostgreSQL + Redis + k6 on the same runner. These are **PRE-CAPACITY** characterization points only.

| Workload | Offered | Fresh durable | Retries | Drops | p50 | p95 | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mixedSteady @25/s | 126 | 126 | 0 | 0 | 22.92 ms | 105.25 ms | clean hosted mixed point |
| Scale typical @50/s | 251 | 251 | 0 | 0 | 276.68 ms | 392.18 ms | no retry/drop on hosted runner |
| N-back standard @50/s | 251 | 251 | 46 | 0 | 543.76 ms | 683.46 ms | retry amplification begins |
| CPT standard @50/s | 251 | 223 | 103 | 28 | 460.32 ms | hosted overload |
| SJT-30 @50/s | 251 | 220 | 130 | 31 | 611.24 ms | hosted overload |
| SJT-60 @35/s | 175 | 158 | 101 | 17 | 792.08 ms | 1587.92 ms | hosted overload; knee lies below 35/s |

The repeated 10/s and 25/s profiles remained accounting-valid after exploratory runs stopped requiring zero capacity retries. The strict all-fresh reporter option itself was not weakened. Artifacts: run `35828241966`; mixed `10736111899`, SJT-60@35 `10736141711`, 50-rate `10736790313`, repeat-10 `10736626522`, repeat-25 `10736556638`.

These results establish enough hosted-environment knee points for Phase 0; increasing offered load further on the same shared 2C/8G runner would add little engineering information. The next optimization target is P2-C03: release UNIT admission before embedded parent aggregate/recovery.


## Phase 0 / P2-C03 UNIT release and aggregate recovery

Decision: **KEEP**.

The production SJT service is now the single UNIT admission owner. Child FINAL/replay work completes under UNIT admission; embedded parent aggregate/recovery executes only after the UNIT permit is released. A legal replay re-runs parent finalization, covering the crash/response-loss window after child commit without inserting a second raw submission or UnitSnapshot.

Evidence on head `5828859d`:

- PR-light backend compile and frontend typecheck: success.
- Phase 0 PostgreSQL/privacy invariant job `107077196085` in workflow run `35829055624`: **10 test files / 66 tests passed**.
- Situational Bundle PostgreSQL suite: **10/10**. New tests explicitly hold Aggregate admission at capacity and assert UNIT admission is already `active=0, queued=0` while parent aggregation waits.
- A second test fills the Aggregate queue, verifies the child is already COMPLETED with exactly one raw submission and one UnitSnapshot while the parent remains IN_PROGRESS, then replays the same submission after the gate drains and verifies the parent becomes COMPLETED with evidence counts still exactly one.
- Standalone high-fanout transaction characterization uses a named test-only persistence entry so production service callers cannot bypass UNIT admission.

### k6 schedule-drift harness correction

A post-P2-C03 hosted CPT@50 run produced 249 started + 5 dropped = 254 observed offered attempts against a configured schedule of 250. All 249 started iterations were fresh/durable. The previous reporter incorrectly treated `abs(configured-offered)>1` as invalid durable accounting. The reporter now keeps actual `started + interrupted + dropped` reconciliation authoritative, records `scheduleDelta`, and emits `SCHEDULER_ARRIVAL_DRIFT` as a capacity disqualifier rather than an accounting error. Fixture exhaustion, wrong identity, replay, durable mismatch and eventual failure remain strict validation failures.


## Phase 0 / P2-C04 authoritative child binding reuse

Decision: **KEEP**.

Generic authenticated Scale, Cognitive and Situational FINAL controllers now consume an internal request-local `compositeAttemptId/attemptEpoch` returned by the authoritative submit service instead of issuing a second child binding lookup after FINAL. The public `data` object remains unchanged; tests explicitly reject leakage of `internalContext`. Relational/cohort/organization result-authority policy checks remain live and are not cached.

Evidence: commit `08905687b0b1b1097f355bc4c2e276a456e485b0`; ordinary CI run `35830664723` and Phase 0 exploratory run `35830664418` succeeded. This is deterministic query elimination on applicable generic authenticated controller paths; public and other paths are reported as N/A rather than forcing a synthetic reduction.


## Phase 0 / P2-C05 SJT narrow reads and fresh response reuse

Decision: **KEEP** for the deterministic request-local changes; the conditional lock+reread SQL merge remains **NOT_TRIGGERED**.

The transaction reread retains authoritative owner/binding/status/epoch/runtime-identity/replay fields and the embedded parent relation required for authorization, but no longer retransmits the already-verified encrypted frozen runtime blob or unused composite item relation. Lock order and CAS are unchanged.

For a fresh winner, the response builder now receives the exact in-memory result and canonical envelope that were successfully persisted, so it does not immediately decrypt the ciphertext it just generated. Replay and history continue to read and validate the persisted encrypted winner. Focused tests deliberately replace stored result ciphertext with invalid strings: the fresh committed-result path still returns the committed values, while the replay path fails closed.

Evidence: commit `9112045518e1a16706a8976fefedb4877ab42d00`; Phase 0 PostgreSQL/privacy invariant run `35831651833` succeeded; Draft backend compile/frontend typecheck in CI run `35831652053` succeeded.


## Phase 0 / P2-C06 Cognitive prepared request context

Decision: **KEEP**.

Unified Cognitive FINAL now reuses the frozen session snapshot's already-validated compiled runtime instead of parsing it again, carries the once-validated config forward, and enters scoring through a request-local prepared context after trial envelopes/payloads have already been normalized. The prepared scorer context is branded in a private WeakSet, so arbitrary JSON or a client-supplied boolean cannot enter that path.

The generic `runAuthoritativeScorer` remains the defensive boundary: it still validates the complete snapshot, config schema and untrusted trials before creating the same prepared context. No global snapshot/runtime cache was introduced.

Evidence: commit `9699f2436b66017a957d032ca7e77e3667e0e61f`; Phase 0 PostgreSQL/privacy invariant workflow and Draft backend/frontend compile/typecheck succeeded. Cognitive contract coverage keeps the untrusted generic rejection path and verifies prepared/generic result equivalence plus forged-context rejection.


## Phase 0 / P2-C07 reference freeze batching

Decision: **KEEP**.

Reference freezing now validates selection keys first, deduplicates reference versions, performs one `findMany` for the request, and parses/hashes each unique version once before projecting bindings back in the original selection order. The empty-selection path performs no database call. ACTIVE status remains a START requirement; frozen FINAL loading still performs its own batch read and validates every persisted expected hash.

The Phase 0 invariant gate was expanded so this work does not wait for Full Gate: Cognitive v2 contracts/goldens, V32-3 Reference contracts, the real-PostgreSQL Scale multi-reference suite, and Aggregate contracts now run on Draft performance commits.

Evidence: commit `3a30c7782eed1734cce9f94072dbc6fe73faeabc`; invariant-gate extension `434aca1005e85d83e7e220483b08d1a26d20a1e5`; workflow run `35832765188` succeeded, including the 0/1/10/50 batch-call assertions and real PostgreSQL multi-reference behavior.


## Phase 0 / P2-C08 Aggregate header indexing

Decision: **KEEP**.

The closed Aggregate finalizer now constructs one `headersBySlot` index inside the existing decrypt/parse phase and uses O(1) slot lookups for each required unit instead of repeating `headers.find`. Duplicate header slot keys still fail closed before any payload is accepted, and the existing completeness/identity/hash/report ordering contracts are unchanged.

Evidence: commit `a95154cd9c79f2995e94a5c2008ede35d4361808`; extended Phase 0 invariant run `35833019854` and Draft backend compile in CI run `35833020182` succeeded. P2-C09 adds explicit 5/20/50/100 ready-parent finalization measurements on the frozen candidate.


### P2-C09 A/B accounting correction

The first complete A/B execution reached all six workloads in all three interleaved rounds. All six p95 medians were non-degraded; SJT-60 was incorrectly labelled regression only because the constant-arrival scheduler produced a median of 51 durable completions on BASE and 50 on HEAD for a configured 50-arrival window. Inspection of the per-run manifests shows both variants durably completed 100% of their observed offered work with zero drop and zero eventual failure.

The A/B gate therefore compares durable completion **rate** (`drainCompleted / observed offered`) plus drop/failure rates, not absolute row count. This preserves fail-closed behavior for real lost work while allowing the already-documented +1 scheduler-boundary arrival. The p95 rule remains unchanged: median HEAD p95 may not degrade by more than `max(10%, 10ms)`.


## Phase 0 final closure — P2-C09

Phase 0 is **CODE_READY + MEASURED** on measured head `76934c7bc6e48d9b3d12dc0dbf620ea206264667`. Formal `CAP-2C4G` and `CAP-4C4G` remain **NOT_STARTED**. The environment below is GitHub-hosted/shared and all results remain **PRE-CAPACITY**.

### Same-host BASE vs HEAD A/B

BASE is merged PERF-01 main `a945ea0d3e6750d2a395ae1869647c547febe482`. HEAD is the final measured Phase 0 candidate. Three interleaved rounds were executed A→B / B→A / A→B on the same runner. Both variants completed 100% of observed offered work with zero drop and zero eventual failure in all six representative workloads.

| Workload | BASE p95 | HEAD p95 | Delta | Completion BASE/HEAD | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Scale typical | 25.67 ms | 23.59 ms | -2.07 ms | 100% / 100% | NON-DEGRADED |
| Cognitive N-back standard | 27.15 ms | 24.68 ms | -2.48 ms | 100% / 100% | NON-DEGRADED |
| Cognitive CPT standard | 34.63 ms | 24.01 ms | -10.63 ms | 100% / 100% | NON-DEGRADED |
| SJT linear 30 | 46.08 ms | 43.81 ms | -2.27 ms | 100% / 100% | NON-DEGRADED |
| SJT linear 60 | 54.13 ms | 40.84 ms | -13.30 ms | 100% / 100% | NON-DEGRADED |
| mixedSteady | 41.31 ms | 37.53 ms | -3.78 ms | 100% / 100% | NON-DEGRADED |

A/B artifact: `10744780859`, digest `sha256:629e253f89b8647c41d7d35d7e159ecec24e9f662f55562b1a4f7ccaa070fb3b`.

### Mixed one-shot burst

These are shared-runner burst characterization points, not rated capacity.

| Burst | Fresh durable | Retry attempts | Eventual failure | Interpretation |
| --- | ---: | ---: | ---: | --- |
| 100 simultaneous | 100 / 100 | 72 | 0 | fully recovered |
| 300 simultaneous | 300 / 300 | 518 | 0 | fully recovered with substantial admission retry |
| 500 simultaneous | 490 / 500 | 1099 | 10 | overload point on this shared runner |

The 500 result is intentionally retained as an overload signal and carries `HTTP_OR_LOGICAL_FAILURES`; it is not converted into a green capacity claim.

### Fault / recovery

The committed-response-loss scenario produced 5 observed logical completions: 4 fresh winners plus 1 replay/retry recovery, with **5/5 durable**, zero drop and zero eventual failure. This confirms retry/replay recovery without duplicate terminal persistence in the exercised path.

### Aggregate ready-parent size curve

All four parents ended `COMPLETED`, progress 100, with an `aggregateInputHash` persisted.

| Required units | Finalize p95 |
| ---: | ---: |
| 5 | 22 ms |
| 20 | 25 ms |
| 50 | 55 ms |
| 100 | 51 ms |

This is a single shared-host characterization, not a production percentile claim. It verifies that P2-C08's header indexing does not introduce correctness loss and that the 5/20/50/100 paths complete on the final candidate.

### Final gates

Final measured head checks:

- `PERF Phase 0 closure` run `35847450233`: success;
- CI run `35847450756`: backend full regression, frontend, CodeQL, browser, Docker and merge gate all success;
- Phase 0 smoke run `35847450408`: success;
- Phase 0 exploratory run `35847450244`: success;
- Situational branching/video/publication integrity: success;
- Cross-runtime media and Scale form-image acceptance: success.

The only late CI repair was a source-layout architecture assertion that expected `finalizeParentAfterUnitSubmit(await withUnitSubmitAdmission(...))` without whitespace. Production Scale already preserved the required UNIT-release-before-parent-finalize call structure; the test was changed to tolerate the actual multiline layout. No production runtime behavior changed in that repair.

### Phase 0 decision

P2-C02 through P2-C08 are **KEEP**. P2-C09 evidence closure is **KEEP**. The optional SJT lock+reread SQL merge remains **NOT_TRIGGERED**; no evidence justified changing lock order. No worker farm, multi-process production topology, PgBouncer, Redis distributed lock, global runtime cache, asynchronous FINAL, or CDN redesign was introduced.

Phase 0 therefore exits at:

```text
CODE_READY = YES
MEASURED = YES
CAP-2C4G = NOT_STARTED
CAP-4C4G = NOT_STARTED
CAPACITY_VERIFIED = NO
```

The next capacity step is Phase 1 on an isolated whole-host 2C4G target with an external load generator.
