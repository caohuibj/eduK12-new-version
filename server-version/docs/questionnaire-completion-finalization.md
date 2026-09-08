# Questionnaire completion finalization

PR36 keeps questionnaire completion authoritative while reducing the work in
the Serializable transaction:

- completion reads one minimal graph projection containing the questionnaire
  form items, scale slots, completed scale results, form answers, frozen
  context fields, and the persisted collection report fallback;
- context freezing and progress refresh reuse that transaction-local snapshot
  instead of loading the same questionnaire graph again;
- callers whose initial GET/start lookup occurs outside the mutation
  transaction always reload the projection inside Serializable. An outer
  cache, HTTP response object, or stale resume lookup is never used as the
  completion authority;
- the existing assessment row lock, conditional state transition, encrypted
  collection report, and bounded PostgreSQL serialization retries remain in
  place.

Ordinary form and Scale answers do not use the completion policy. They run at
`READ COMMITTED` while locking only their own QuestionnaireAssessment or
Assessment row. Questionnaire completion and Scale completion retain separate
`SERIALIZABLE` policies. Questionnaire completion additionally passes through
a bounded process-local admission queue; a full or expired queue returns the
retryable `503 COMPLETION_BUSY` response without changing assessment state.

Completion queue wait, Serializable retry backoff, attempt number, conflict
code, admission rejection reason, and active/queued admission gauges are
exported through `/metrics` for capacity comparisons.

The projection intentionally excludes scale definitions and unrelated
relations from the completion-only path. Public GET/start paths may still load
the separate response projection needed to render the current scale; that
response lookup is not reused as completion authority.

## Verification gate

Run the full local release gate against an isolated PostgreSQL/Redis pair. It
must cover the complete backend/frontend suites, migrations, build, audit,
container configuration, and non-root image smoke test. The completion gate
also requires real PostgreSQL coverage for:

- 200 completion calls within 10 seconds, with at most 20 calls in flight;
- duplicate completion/retry and answer-versus-completion races;
- no lost scale results, form answers, frozen context, or collection report;
- exactly one terminal state transition and one persisted encrypted report.

The PR35 attribution runner is available separately under
`server-version/scripts/load/`. It records p50/p95/p99, throughput, errors,
container samples, and the request-correlated `ptool_slow_requests_total`
deltas; baseline and candidate reports must use the same isolated fixture.

### Completion burst scheduling and diagnostics

The real-PostgreSQL aggregate-report test uses 20 continuously replenished
callers. A caller starts its next independent assessment after its previous
call finishes. Waiting for all 20 calls at a batch boundary accumulated the
slowest Serializable retry/backoff in each of ten batches, leaving capacity
idle even though independent work remained. The burst still includes admission
wait, transaction acquisition, durable commits and bounded production retries.
The 200-call default and strict `<10_000 ms` assertion are unchanged.

Elapsed time uses a monotonic clock and is captured before storage verification.
The test checks all completion and encrypted-storage invariants before asserting
the captured duration. Every run logs elapsed time, burst size, concurrency,
Serializable attempts/conflicts and admission rejections. Workers settle before
fixture cleanup, including on error. A separate real-PostgreSQL test races 20
completions on one assessment and replays them, checking that the winning report
ciphertext and completion timestamp remain unchanged.

On 2026-09-08, five alternating baseline/candidate pairs using fresh databases
cloned from the same migrated template on the WSL2 runner host measured:

| Run | Batch barriers (ms) | Continuous callers (ms) |
| --- | ---: | ---: |
| 1 | 3347 | 2438 |
| 2 | 3468 | 2652 |
| 3 | 3417 | 2407 |
| 4 | 3369 | 1958 |
| 5 | 3104 | 2746 |

All ten runs passed. PostgreSQL 14 retained `fsync=on`,
`synchronous_commit=on` and `full_page_writes=on`; pool/admission defaults and
production code were unchanged. These local measurements demonstrate removal
of test-scheduler overhead, not a production throughput improvement or a
guarantee under arbitrary host contention. The reported 10031 ms failure was
not reproduced in this comparison.

The CI `needs: backend` dependencies serialize phases within one workflow run.
The workflow concurrency group includes the PR/ref, so different runs can still
overlap on the shared WSL host, alongside local application containers. It is
not a host-wide reservation ([GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)).
If the preserved timing gate fails again, use the burst diagnostics and the
overlapping host/job load to distinguish retry tails from host contention.
