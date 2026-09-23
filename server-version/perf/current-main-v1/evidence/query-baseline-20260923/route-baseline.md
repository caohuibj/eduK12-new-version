# PERF-01 isolated PostgreSQL HTTP baseline

Runtime candidate `c91456d7f3c9c1b7e0a27b8351731acf2bdd7774`, base `68afbe63672b42c9a2086f834d5ae46794c3c013`; PostgreSQL 14.24. Fourteen FINAL templates and two policy-domain samples each completed one first-attempt fresh request. All sixteen were durable by the one-second window and after drain. SQL and logical Prisma calls exclude one measured /metrics scrape.

| Route case | Policy domain | SQL events | Prisma calls | Received network bytes | One request ms |
| --- | --- | ---: | ---: | ---: | ---: |
| SCALE_STANDALONE | GENERIC | 9 | 5 | 6065 | 46.6 |
| COGNITIVE_AUTH | GENERIC | 11 | 8 | 8432 | 62.2 |
| COGNITIVE_PUBLIC | GENERIC | 8 | 5 | 8518 | 31.6 |
| SJT_STANDALONE | GENERIC | 10 | 7 | 16534 | 68.4 |
| QUESTIONNAIRE_SCALE_AUTH | GENERIC | 11 | 6 | 6120 | 57.8 |
| QUESTIONNAIRE_FORM_AUTH | GENERIC | 20 | 11 | 1447 | 90.0 |
| QUESTIONNAIRE_SCALE_PUBLIC | GENERIC | 11 | 6 | 6213 | 45.8 |
| QUESTIONNAIRE_FORM_PUBLIC | GENERIC | 21 | 12 | 1533 | 48.4 |
| COMPOSITE_SCALE_AUTH | GENERIC | 12 | 8 | 6131 | 64.9 |
| COMPOSITE_SJT_AUTH | GENERIC | 24 | 14 | 16562 | 96.2 |
| COMPOSITE_FORM_AUTH | GENERIC | 23 | 12 | 1453 | 70.7 |
| COMPOSITE_SCALE_PUBLIC | GENERIC | 9 | 5 | 6220 | 42.2 |
| COMPOSITE_SJT_PUBLIC | GENERIC | 21 | 11 | 16649 | 77.7 |
| COMPOSITE_FORM_PUBLIC | GENERIC | 21 | 10 | 1541 | 54.9 |
| COMPOSITE_SCALE_AUTH_RELATIONAL | LEGACY_COURSE | 13 | 9 | 1324 | 103.8 |
| COMPOSITE_SCALE_AUTH_ORGANIZATION | ORGANIZATION_RUN | 13 | 9 | 1326 | 46.1 |

The duration column is one sample per case; it is not a useful p95 or capacity estimate. The k6 data_received value includes protocol overhead and is labelled network bytes. Phase means, model/action distributions, the raw SQL count, PostgreSQL table row ranges, indexes, and ANALYZE timestamps are in route-baseline.json. The API and load generator shared this Mac. CAPACITY_VERIFIED remains false. The ORGANIZATION_RUN row covers the assignment policy branch with a STUDENT/SELF respondent and no consent or Assessment Run execution; it is not a full organization campaign or observer-path benchmark.
