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

- 200 concurrent completion attempts over a 10-second window;
- duplicate completion/retry and answer-versus-completion races;
- no lost scale results, form answers, frozen context, or collection report;
- exactly one terminal state transition and one persisted encrypted report.

The PR35 attribution runner is available separately under
`server-version/scripts/load/`. It records p50/p95/p99, throughput, errors,
container samples, and the request-correlated `ptool_slow_requests_total`
deltas; baseline and candidate reports must use the same isolated fixture.
