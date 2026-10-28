# Actual Scale lifecycle storage comparison

Runtime source: main93235b6c6a61cefb30fd525eea13ee9c6d4cc0fe; measurement commit base ef04691f35a1420854f2b2c00b6f06da81eba351 adds documentation only. No application, schema, production flag or COS changes.

## Method

Two separate fresh isolated PostgreSQL17.11 databases, restricted runtime role, full migrations, Node24.22.1, Redis8.0.2. Each mode creates the same one-item synthetic approved descriptive Scale, with 30 distinct Teacher SELF identities, one published track and actual executions. Setup uses established services and explicitly synthetic manager/member/content fixture data, not browser administration. An unused seed draft Run remains equally in both setup baselines; it is not an execution or completed answer.

For every participant, call actual Run START, load its persisted frozen child, submit actual Scale FINAL, confirm parent completion, read current-authorized individual report, and verify one immutable completed unit. No manually inserted parent/child attempt, result, FINAL, report or completed status. All 30 records per mode completed; no user journey repeated merely as CI.

Legacy mode explicitly sets compact facts, shared runtime storage and shared control flags false. Shared-compact mode sets those same existing process-local opt-ins true. Each runs once, legacy first. This measures the combined existing mode, not an attribution to one flag. Production feature states are unknown and untouched.

Measure SQL event counts/durations, process CPU and wall time around service phases. Read actual table/index/TOAST allocation and selected payload text sizes at published baseline, first START, first FINAL and 1/10/30 readable reports. Existing schema tables include fixed governance/run/source setup and shared artifacts. Selected payload text is not the full logical database size. WAL is isolated global insert-LSN delta across the interval, including unavoidable background effects; not exact per-row attribution. No backup restore, archived durability or COS bill claim.

## Results at 30 completed answers

| Measure | Legacy | Shared/compact |
|---|---:|---:|
| Selected relations before START | 1,581,056 | 1,581,056 |
| Selected relations after readable reports | 2,965,504 | 2,473,984 |
| Physical growth above baseline | 1,384,448 | 892,928 |
| Selected payload text bytes | 682,500 | 100,302 |
| WAL insert-LSN delta | 1,435,544 | 863,976 |
| Public individual report bytes | 1,559 | 1,559 |
| Completed distinct respondents | 30 | 30 |

Physical growth is 35.50% smaller; total selected allocated relations are 16.57% smaller, not 85.30% smaller. The 85.30% figure refers only to selected payload strings/references. WAL delta is39.82% smaller in this single sequence. At one completed record compact mode allocates MORE physical space (1,990,656 versus1,941,504) because shared/fact tables have minimum page/index overhead. It amortizes with more records; this sample does not establish a universal threshold.

The shared mode stores30 fact records,1 shared runtime artifact,6 public templates and30 private frozen bindings. Legacy mode has zero rows in those tables. Private participant bindings remain per person, not a shared permission cache.

All selected public score/raw-feedback/interpretation structures have identical normalized SHA256413de7a0fa2cabc7ca5ab549a544e78b82066e36a669cfbfc023af9a7f71a5e8 across both modes, and score3. Full report identity/time metadata is not asserted byte-identical across different participant IDs.

## Performance tradeoff not hidden

| Phase | Legacy subsequent median ms | Shared/compact subsequent median ms | Legacy / shared SQL count |
|---|---:|---:|---:|
| START | 99.30 | 149.87 | 115 / 117 |
| FINAL | 44.71 | 43.15 | 51 / 56 |
| Parent completion check | 25.18 | 22.52 | 29 / 30 |
| Authorized report read | 41.23 | 39.69 | 21 / 26 |

These are observed service-call medians for records2–30, NOT browser cold/hot, p95, production SLA or throughput. Additional explicit parent-completion checking mirrors the fixture lifecycle; do not add its time to a real HTTP response SLA without tracing the actual endpoint. Process CPU totals and first-call values remain in raw evidence.

Shared START is slower in this sequence despite slightly lower total Node CPU. SQL event duration typically changes from single-digit milliseconds in the later legacy calls to approximately56–75ms in shared mode. This needs targeted query/planner attribution before enabling or proposing a default. Do not dismiss it as noise, claim overall latency improvement, add an authorization cache, or simply switch every production flag.

## Failed preparation retained

legacy-r1 failed before START because the new probe tried to create a second ORGANIZATION evaluation target in the same school; the existing uniqueness constraint correctly rejected it. Reuse the seed event's existing target, preserving constraints and original failure. legacy-r2 and shared-compact-r2 both exit0. This is preparation correction, not a production bug fix or a failed CI round.

## Next

Investigate the added START database cost with targeted read-only query plans/current authority paths using owned synthetic data. Keep the successful lifecycle observations; do not rerun all60 answers to get a nicer timing number. Only after explaining the tradeoff consider a shared minimal optimization and appropriate directly affected checks. Extend coverage to actual Training/School and Survey persistence differences as needed; do not copy one product's storage model into Survey, whose frozen publication already has distinct shared ownership.
