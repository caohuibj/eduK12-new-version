# Persistence capacity gate

`persistence-capacity.mjs` is a closed-loop HTTP capacity gate for the
assessment persistence paths. It uses only Node.js built-ins, runs one
sequential request loop per virtual user, records p50/p95/p99, throughput,
HTTP/API/network errors, and optionally samples explicitly named Docker
containers. When `--metrics-url` is provided, it also captures the backend
runtime metrics before and after each steady-state stage and writes deltas for
slow-request attribution, exclusive dominant phase, event-loop delay, Prisma
timings, and bounded error counters.

The fixture must be prepared outside the repository against an isolated test
deployment. It must contain one independent, valid assessment/resume
capability per virtual user; a shared cookie or shared public capability would
not represent concurrent students. Do not put real credentials, bearer
capabilities, cookies, answer values, or database URLs in Git.

Example fixture shape (use placeholders only in documentation):

```json
{
  "name": "questionnaire-persistence",
  "baseUrl": "http://127.0.0.1:18080",
  "thinkTimeMs": 250,
  "users": [
    {
      "id": "student-001",
      "headers": { "Authorization": "Bearer <dedicated-capability>" },
      "variables": {
        "sessionId": "<dedicated-session-id>",
        "scaleAssessmentId": "<dedicated-scale-assessment-id>"
      }
    }
  ],
  "steps": [
    {
      "name": "read-assessment",
      "method": "GET",
      "path": "/api/public/assessments/{{sessionId}}",
      "weight": 0.25
    },
    {
      "name": "submit-scale-checkpoint",
      "method": "PATCH",
      "path": "/api/public/assessments/{{sessionId}}/answers/batch",
      "weight": 0.75,
      "body": {
        "answers": [
          {
            "scaleAssessmentId": "{{scaleAssessmentId}}",
            "itemCode": "q-{{iteration}}",
            "responseValue": 2,
            "expectedRevision": 0
          }
        ]
      }
    }
  ]
}
```

For the real gate, expand `users` to at least 300 and use a fixture with a
valid scale item/revision for each user. The runner defaults to the staged
levels `100,150,200,250,300`; it fails when the configured p95 or error-rate
threshold is exceeded. Use `--target-label 4c4g` only when the isolated target
has actually been constrained and recorded as 4 vCPU/4 GiB. The label is
metadata, not proof of the machine size.

Example invocation:

```bash
node server-version/scripts/load/persistence-capacity.mjs \
  --scenario-file /secure/eduk12-capacity-fixture.json \
  --base-url http://127.0.0.1:18080 \
  --target-label 4c4g \
  --containers eduk12-load-backend,eduk12-load-postgres \
  --metrics-url http://127.0.0.1:13000/metrics \
  --output /tmp/eduk12-capacity-report.json
```

Keep the generated report outside the repository. Before a release, attach
the report together with the exact application SHA, database migration state,
CPU/memory limits, duration, thresholds, and the isolated resource names.

For the PR35 attribution gate, run the same scenario against the baseline and
instrumented deployments with stages `1,5,10,25,50,100`, a 30–60 second
warm-up, a 60–180 second steady-state window, and three independent runs per
deployment. Compare p50/p95/p99, throughput, errors, CPU and runtime metrics;
use the candidate's per-stage `observability.delta` slow-request samples for
the explicit attribution conclusion. A pre-PR35 baseline may have no
`/metrics` endpoint; that does not invalidate the latency overhead comparison,
but candidate metrics must be available for a causal attribution conclusion.
