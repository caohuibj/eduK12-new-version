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
  `transaction_acquisition`, `transaction`, `row_lock_wait`,
  `assessment_lookup`, `definition_lookup`, `existing_answer_lookup`,
  `answer_mutation`, `progress_mutation`, and residual `response` time.
- `ptool_prisma_call_duration_seconds`: Prisma middleware wall time labelled
  only by model and action. Raw SQL is represented as `model="raw"`; query
  text is never recorded.
- `ptool_prisma_errors_total`: bounded Prisma/SQL error codes, including
  `P2028`, `P2034`, and PostgreSQL `40001` when surfaced by Prisma.
- `ptool_nodejs_event_loop_utilization`,
  `ptool_nodejs_event_loop_delay_seconds`,
  `ptool_nodejs_active_requests`, `process_resident_memory_bytes`,
  `process_heap_used_bytes`, `process_heap_total_bytes`, and GC counters.

The transaction phase is an envelope around its nested acquisition, lock, and
mutation phases. The residual `response` phase is calculated from the union of
all measured monotonic intervals, so nested spans are not subtracted twice.
It represents uninstrumented application/response overhead and should not be
treated as an exact socket-write duration.

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
5. classify requests above 500 ms, 1 s, and 2 s by the dominant measured
   phase, while checking the event-loop, Prisma, and container CPU metrics.

The report must end with an explicit attribution conclusion. Examples include
event-loop delay, transaction acquisition/pool contention, database query
time, GC, CPU throttling, or a measured combination. Metrics without this
comparison and conclusion are not a completed PR35 performance gate.
