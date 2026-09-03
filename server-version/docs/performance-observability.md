# Performance observability

PR35 adds process-local, Prometheus-compatible measurements for attributing
assessment tail latency. The `/metrics` endpoint exposes only timing,
resource, status, and bounded error metadata; it does not expose answers,
tokens, questionnaire content, identifiers, SQL text, or request bodies.

## Metrics

- `ptool_http_request_duration_seconds`: completed HTTP latency, labelled by
  method, normalized route template, and status.
- `ptool_api_requests_total`: compatibility counter retained for existing
  availability alerts and dashboards.
- `ptool_assessment_phase_duration_seconds`: `resume_auth`,
  `auth_account_lookup`, `request_body_receive_parse`,
  `transaction_acquisition`, `transaction`, `row_lock_roundtrip`,
  `completion_queue_wait`, `serialization_backoff`,
  `assessment_lookup`, `definition_lookup`, `existing_answer_lookup`,
  `answer_mutation`, `progress_mutation`, and residual `response` time.
- `ptool_slow_requests_total`: requests above `500ms`, `1s`, and `2s`,
  classified at request finalization by the largest exclusive phase. The
  `dominant_phase` label uses `transaction_other` for uncovered time inside
  the transaction envelope and `response_other` for uninstrumented request
  time. An aborted client connection is recorded with HTTP status `499`.
- `ptool_prisma_call_duration_seconds`: Prisma middleware wall time labelled
  only by model and action. Raw SQL is represented as `model="raw"`; query
  text is never recorded.
- `ptool_prisma_errors_total`: bounded Prisma/SQL error codes, including
  `P2028`, `P2034`, and PostgreSQL `40001` when surfaced by Prisma.
- `ptool_serializable_attempts_total`: bounded retry-attempt counts labelled
  by `operation` (`questionnaire_completion`, `questionnaire_mutation`, or
  `scale_completion`) and attempt number.
- `ptool_serialization_conflicts_total`: bounded `P2034`/`40001` conflict
  counts labelled by operation and database error code.
- `ptool_completion_admission_rejections_total`: bounded completion admission
  rejections labelled by `queue_full` or `timeout`.
- `ptool_questionnaire_completion_admission_active` and
  `ptool_questionnaire_completion_admission_queue`: process-local active and
  queued questionnaire completion operations.
- `ptool_bounded_admission_active`, `ptool_bounded_admission_queue`, and
  `ptool_bounded_admission_rejections_total`: labelled gauges/counters for the
  generic `BoundedAdmissionGate` primitive (`gate` is a low-cardinality name
  such as `questionnaire_completion`). Questionnaire completion remains a thin
  wrapper over this primitive and keeps the legacy gauges above.
- Aggregate finalization phases (low cardinality): `aggregate.parent_probe_db`,
  `aggregate.header_db`, `aggregate.definition_db`, `aggregate.payload_db`,
  `aggregate.decrypt_parse`, `aggregate.validate`, `aggregate.analysis`,
  `aggregate.report`, `aggregate.encrypt`, `aggregate.persist`, and
  `aggregate.cas_loser`. `aggregate.payload_db` is the snapshot payload
  `findMany`; decrypt/parse is measured separately so the old mislabeled
  `aggregate.decrypt_ms` wrapping DB I/O is gone.
- `ptool_nodejs_event_loop_utilization`,
  `ptool_nodejs_event_loop_delay_seconds`,
  `ptool_nodejs_active_requests`, `process_resident_memory_bytes`,
  `process_heap_used_bytes`, `process_heap_total_bytes`, and GC counters.

The transaction phase is an envelope around its nested acquisition, lock, and
mutation phases. The residual `response` phase is calculated from the union of
all measured monotonic intervals, so nested spans are not subtracted twice.
It represents uninstrumented application/response overhead and should not be
treated as an exact socket-write duration.

Questionnaire completion is admitted through a process-local bounded queue
before opening a Serializable Prisma transaction. The defaults are eight
active completions, a queue of 64, and a 1.5-second queue budget. They can be
tuned for an A/B run with `QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT` (for
example 5, 8, 10, 12, or 16),
`QUESTIONNAIRE_COMPLETION_ADMISSION_QUEUE`, and
`QUESTIONNAIRE_COMPLETION_ADMISSION_TIMEOUT_MS`. A full or expired queue
returns HTTP `503` with `code=COMPLETION_BUSY` and `Retry-After: 1`; it does
not change assessment state. The limit is per backend process, so multi-process
deployments must compare the aggregate active gauge across processes.

Labels are bounded in memory. Unmatched routes and excess model/action
cardinality are aggregated into `__other__` buckets; route templates from
Express are preferred so session IDs and other path values are not labels.

## Attribution protocol

Use the same versioned fixture and workload for each comparison. For each of
1, 5, 10, 25, 50, and 100 virtual users:

1. warm up for 30–60 seconds;
2. collect a 60–180 second steady-state window;
3. repeat the run three times;
4. record p50, p95, p99, maximum latency, throughput, error rate, and the
   process metrics above;
5. classify requests above 500 ms, 1 s, and 2 s using the delta of
   `ptool_slow_requests_total`, while checking the event-loop, Prisma, and
   container CPU metrics. This counter is request-correlated at finalization;
   independent phase histograms alone must not be used to infer per-request
   causality.

The report must end with an explicit attribution conclusion. Examples include
event-loop delay, transaction acquisition/pool contention, database query
time, GC, CPU throttling, or a measured combination. Metrics without this
comparison and conclusion are not a completed PR35 performance gate.
