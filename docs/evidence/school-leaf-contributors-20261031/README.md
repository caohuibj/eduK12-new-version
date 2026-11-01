# School leaf effective-contributor disclosure fix

A School leaf report could pass roster-based overlap checks while two disclosed numeric metrics differ by only one effective participant. The candidate reuses the engine's frozen inputManifest/metricContributorExecutionIds at generation-before-persist and historical read. Original roster/source/manager/frozen-policy checks and the School release lock remain; legitimate partial reports retain their policy. Metric aliases compare by sourceMetricKey.

Only4application/test paths differ from base main25cad994ec20b32b53ed8735c732143376536da0: campus/group-reports.ts, new campus/group-contributor-differencing.ts, new campus/group-contributor-differencing.test.ts and the existing campus/group-reports.test.ts fixture correction. Teacher, shared engine, source/history list pagination, schema, dependencies, CI controls and production are unchanged. Long owns the other3functional fixes.

## Local evidence

- Valid published-spec fixtures:15distinct direct cases passed (14from native15PASS plus the valid distinct-source replacement case1PASS/14filtered). Native baseline on unchanged63 reproduces the original unexpected disclosure; affected School/reporting blobs are identical in25.
- Existing nearest tests:21distinct cases passed across20PASS/1FAIL and failed-case-only1PASS/16filtered. The old missing source contract and stale principal expectation each reproduce on untouched main63. Both first failures are retained; the full failed invocation is not relabeled successful.
- Backend compiler: final integrated product source tsc --noEmit r5 exits0,41.245s. Only excluded test code changed afterward; no compiler-consumed source delta. Earlier declaration errors remain in originals.
- PostgreSQL16.15: final valid-fixture captured SQL returns27distinct disclosures in20+7pages, preserves microseconds and publication linkage, excludes self/foreign/unrelated records. Temporary minimal schema/owner role, zero FINALs; not full271schema, HTTP/auth, runtime-role or production proof. Query text also matches the earlier27row proof; valid fixture metadata changed, so only this affected SQL fixture was continued.

Independent review's2confirmed initial defects (historical floor pollution and unbounded application materialization) have targeted regression/self-check evidence; see review.md.20row batches do not certify total latency or4CPU/4GiB production capacity. Installed dependencies are reused and not fresh-lock qualified; follow-redirects1.16.1 differs from lock1.16.2. No formalCI or signing claim.

## Originals and reproduction

executions.json.gz retains raw reporter/logs, failures, filtered cases and type invocations. native-query.json.gz is a synthetic service capture with valid spec/rule/manifest metadata. as-run-probe.py and as-run-query.sql.gz preserve the exact final SQL probe; no credentials, real users, answers or dependency directories are present. The probe was run with a disposable postgres:16.15-bookworm container named b-school-contributor-native-20261031, network disabled,1CPU/512MiB. To reproduce that query fixture in an authorized isolated environment, expand native-query.json.gz to /tmp/school-contributor-query-native.json and run as-run-probe.py against that disposable container; it does not perform app publication or FINAL.

Draft review only. Formal readiness and merge are separately coordinated by mother DOT/A. The configured Notion CI checklist fetch returned404through Hui; this is recorded, not claimed read. No manual/Ready qualification is activated by this candidate; ordinary Draft PR automation is left unchanged.
