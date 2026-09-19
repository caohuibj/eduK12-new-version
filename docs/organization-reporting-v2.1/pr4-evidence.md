# PR4 server acceptance evidence

Baseline: `main@f351fe03d3184ac8739d9c793f1576ce276f30cf` (PR #121).
PR: https://github.com/caohuibj/eduK12-new-version/pull/122

## Implemented contracts

| Plan | Implementation and verification |
| --- | --- |
| C01 | Organization/resource-scoped Series, immutable Wave/cohort/result bindings; `reporting-series.test.ts` and real PostgreSQL `reportingSeries.postgres.integration.test.ts`. |
| C02 | Governed comparability levels, evidence-bound metric comparisons and delta allowlist; `reporting-comparability.test.ts`. No automatic equating or causal claims. |
| C03 | Independent frozen populations per Wave with explicit repeated-cohort limitations; `reporting-repeated.test.ts`. |
| C04 | Stable User matching with separate Membership provenance, metric-specific complete pairs/cases and privacy suppression; `reporting-matched.test.ts`. |
| C05 | Multi-rater observations separated by Track, relationship, perspective and respondent; explicit authorized execution allowlist; `reporting-multi-rater.test.ts`. This is an internal input contract, not a public raw-observation endpoint. |
| C06 | Governed `ORG_PROTECTED_FEEDBACK_V1`, fixed subject/source tuple, resource and spec respondent floors; subject denial precedes administrator/export capabilities; protected unit tests and real PostgreSQL delivery tests. |
| C07 | Legacy Course aggregation remains scoped to its policy domain. Generic Composite/Scale report and export guards reject protected inputs. Cognitive/Scale/Situational runtime result projection checks frozen assignment visibility even for Parent/Teacher respondents. History and wrapper-export isolation retain their existing boundaries. |
| C08 | Organization view resolves existing Safety cases through their canonical snapshot and completed Run binding. Current responsible psychology staff receive FULL, responsible teacher/counselor ACTION, active organization administrator SUMMARY. Subject and Parent access denied; suspension retains current case responsibility without a general tenant bypass. |
| C09 | Explicit REPORT_EXPORT or REPORT_MEMBER_EXPORT intersects current underlying read authority. Member export additionally requires current per-member class/counselor/self authority; protected member exports are disabled. Fifteen-minute viewer-bound immutable tickets contain no report payload; every download rebuilds the currently authorized projection. CSV quoting and formula neutralization apply to every cell. |
| C10 | Database migration rehearsal, real database/HTTP delivery tests, non-skipping CI gates for Series and delivery, and existing PR1–3 regression suites. Full CI must pass on the final candidate before merge. |

## API and policy boundary

Existing organization reporting analyze/read endpoints serve GROUP, REPEATED_COHORT, MATCHED_LONGITUDINAL and PROTECTED_FEEDBACK with strict schemas and governed published specs.

- `POST /api/organizations/:organizationId/reporting/exports`: `{ kind: "AGGREGATE" | "MEMBER", artifactId }` or `{ kind: "SAFETY", caseId }`.
- `GET /api/organizations/:organizationId/reporting/exports/:exportId`: authenticated, reauthorized CSV; `Cache-Control: no-store`.
- `GET /api/organizations/:organizationId/safety/cases/:caseId`: server-selected projection of the existing Safety authority, not a second case store or raw-response scorer.

Unsupported Safety source families fail closed. Canonical-unit cases must match the current completed attempt epoch, source hash, exact organization Run binding and subject. No production Safety trigger or governed reporting spec is automatically published by this migration. Historical Parent evidence alone never grants export capability or protected/Safety access.

## Reproducible validation

From `server-version/backend`, with a migrated dedicated PostgreSQL database and test encryption/JWT configuration:

```
npm run build
npm test -- src/__tests__/assessment-relational src/__tests__/assessment-safety src/__tests__/reporting src/__tests__/integration/reporting --no-file-parallelism
node scripts/pr3-baseline-upgrade-rehearsal.mjs
```

The upgrade rehearsal populates the pre-PR3 baseline, applies all subsequent migrations through PR4, verifies preserved start identities/reporting storage, and repeats deployment to verify idempotency. CI also runs the full backend/frontend regression, browser acceptance, CodeQL and production container builds.

Delivery integration assertions cover successful aggregate/member/protected exports; no-grant/no-underlying-read rejection; cross-viewer tickets; grant and relationship revocation before download; administrator-subject exclusion; protected respondent identity/count suppression; Safety SUMMARY/ACTION/FULL, suspension, responsibility loss and cross-organization rejection; authenticated HTTP CSV and Safety responses.

## Rollout

Apply migrations and pass the complete CI gate before enabling reviewed PR4 specs. Keep the existing governed spec draft/review/publish lifecycle; no client-selected policy or projection override is accepted. UI integration remains PR5. Roll back application access by disabling relevant published entry points/grants rather than deleting immutable report, Wave or Safety history.
