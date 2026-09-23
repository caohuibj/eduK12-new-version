# PERF-01 compatibility corpus

Status: BASELINE_CAPTURED. The present runtime is the comparison oracle for PERF-02. Only the expressly planned SJT committed-child parent-recovery correction may intentionally change a prior error outcome. New hot-path commits must compare decoded results and frozen hashes; randomized ciphertext bytes are not an equality target.

| Contract / acceptance | Executable check and evidence | Current status |
| --- | --- | --- |
| Current Cognitive registry, exact profiles, score/quality/trace and frozen metadata | `npm run perf:corpus:verify`; [fixture corpus](../../server-version/perf/current-main-v1/evidence/fixture-corpus-20260923/README.md) | 29 entries, 87 golden cases matched on final candidate |
| SJT 10/30/60 linear, branching, identity and invalid submissions | `check-sjt-fixtures.mjs`; [SJT HTTP](../../server-version/perf/current-main-v1/evidence/fixture-corpus-20260923/sjt-http.json) | Fresh outcomes and 400/403/409 guards captured |
| Scale normal, legal maximum, oversize and reference selection | `check-scale-fixtures.mjs`; `scale-multi-reference.postgres.integration.test.ts`; [Scale HTTP](../../server-version/perf/current-main-v1/evidence/fixture-corpus-20260923/scale-http.json) | Fresh and negative HTTP captured; PostgreSQL multi-selection passed; reference-enabled HTTP fixture unsupported by current registry |
| Fresh versus replay and durable identity | `fresh-fixture-pool.test.mjs`, `report-run.test.mjs`; [full-request evidence](../../server-version/perf/current-main-v1/evidence/full-request-20260923/README.md) | Reuse/exhaustion rejected, response-loss recovery reconciled |
| Complete FINAL route guard/handler coverage | `check-final-routes.mjs`, `final-route-inventory.test.ts`; [route inventory](route-inventory.csv) | All 14 registered templates match; 14 first-attempt fresh baseline samples |
| Questionnaire / Composite auth and public parent-child binding | `summarize-route-baseline.mjs`; [route evidence](../../server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.json) | Embedded route cases durably fresh; authenticated, public and two explicit policy branches separated |
| Current principal, consent, visibility, CSRF and recovery controls | Route inventory, isolated HTTP samples, existing backend suite | PERF-01 pins current behavior; adversarial concurrency/privacy matrix is required in P2-C01 before changing runtime paths |

The isolated PostgreSQL setup and local HTTP samples do not prove high concurrency, campaign-wide organization behavior, or rated capacity. P2-C01 must add the full concurrent/privacy invariant matrix before P2 runtime changes.
