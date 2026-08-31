# Persistence capacity gate

`persistence-capacity.mjs` is a closed-loop HTTP capacity gate for the
assessment persistence paths. It uses only Node.js built-ins, runs one
sequential request loop per virtual user, records p50/p95/p99, throughput,
HTTP/API/network errors, and optionally samples explicitly named Docker
containers.

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
  --output /tmp/eduk12-capacity-report.json
```

Keep the generated report outside the repository. Before a release, attach
the report together with the exact application SHA, database migration state,
CPU/memory limits, duration, thresholds, and the isolated resource names.
