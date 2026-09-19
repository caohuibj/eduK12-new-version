# PR3 acceptance evidence — Organization Reporting Core

Date: 2026-09-19  
PR: #121 `feat(reporting): add organization reporting core`  
Base: `main@38bc442f834d4cdaf0c3d80ab17edcd2281ce3ea`  
Validation target: the exact branch HEAD of `feat/org-03-reporting-core`; the final CI run is recorded in the PR description after this evidence commit is validated.

## Scope boundary

PR3 implements ordinary Organization `GROUP` reporting from frozen `SELF` Run Track observations. The authoritative result adapter currently accepts completed `COMPOSITE`-bound Run executions and reads canonical `UNIT_RESULT` snapshots. Protected feedback, longitudinal/matched analysis, multi-rater combination, Safety redesign, and CSV/export are intentionally outside PR3 and remain fail-closed/deferred to PR4.

## Migrations and release gates

PR3 adds:

- `20260919115500_freeze_run_start_attempt_identity`
- `20260919121000_reporting_core`

CI runs a populated baseline-to-head rehearsal in `server-version/backend/scripts/pr3-baseline-upgrade-rehearsal.mjs`. It deploys all pre-PR3 migrations into a temporary PostgreSQL database, inserts real legacy Organization/Run/Membership/START-claim/admission-audit rows, applies the two PR3 migrations, verifies START identity backfill and old-row preservation, verifies reporting tables, and re-runs exact-head migrations as an idempotent no-op.

The critical-suite no-skip gate includes:

- `assessmentRunConsentRecovery.postgres.integration.test.ts`
- `reportingCore.postgres.integration.test.ts`
- `reportingHttp.postgres.integration.test.ts`
- `reportingQueryBudget.postgres.integration.test.ts`

## Correctness findings closed during PR3 review

1. **START recovery consent race:** first admission durably freezes the accepted attempt identity; recovery reconciles that admitted operation without re-authorizing changed consent before START recovery. Current consent remains authoritative for FINAL.
2. **Deterministic statistics:** numeric inputs are deterministically ordered before floating-point accumulation, so input permutations cannot produce different projections/snapshot hashes under one analysis identity.
3. **Stable spec-version conflicts:** duplicate `(specKey, version)` creation maps to `REPORT_SPEC_VERSION_CONFLICT` / HTTP 409, including raw PostgreSQL unique violations.
4. **Cross-Organization authorization:** Run identity is bound to the requested Organization before audience-role checks; cached/reused artifacts never carry authorization.
5. **HTTP boundary ordering:** tests distinguish the production CSRF-before-auth boundary (403 without CSRF) from the authenticated-route boundary (401 when CSRF is valid but no session exists).
6. **Frozen label cohorts:** Run publication freezes the selected Membership population; later label assignment changes do not mutate reporting cohort identity.
7. **Controlled concurrency:** artifact create-or-reuse uses an explicit start barrier rather than relying on natural Promise scheduling; eight candidates converge to one persisted artifact.
8. **Real query/row budget:** A-08 measures Prisma operation shape and returned-array row counts for 100 and 500 SUBJECT cohorts; result resolution remains batched rather than per-person.
9. **Effective privacy floor:** reporting uses `max(resource minimumRespondents, Run Track minimumRespondents)`. A stricter Track therefore cannot be weakened at reporting time, and the effective floor is part of analysis identity so a result calculated under a wider floor cannot be reused under a stricter one.

## Plan coverage

| Plan area | Evidence |
| --- | --- |
| C01 governed specs | Strict `GROUP` spec schema; SYSTEM_ADMIN governance; DRAFT → REVIEWED → PUBLISHED/RETIRED lifecycle; REVIEWED content freeze and database transition guard; PR4 kinds rejected. HTTP and real-PostgreSQL tests cover authority, invalid kind, duplicate version, and immutability. |
| C02 deterministic primitives | Type-7 quartiles; defined population/sample SD semantics; strict finite-number admission; deterministic accumulation/order regression. |
| C03 cohort snapshots | Immutable snapshots derived from frozen Run execution/actor Membership identity; same N/different members yields different identity; label population remains frozen after current label changes. |
| C04 authoritative batch results | One Run-graph batch plus authoritative Composite attempt/snapshot batches; completed/missing/mismatched/unsupported result states fail closed and do not silently contribute. |
| C05 observation eligibility | SUBJECT observation unit; SELF-only PR3 generic reporting; `UNIQUE_OR_REJECT`; result/metric quality filters; explicit valid/missing counts. |
| C06 privacy | Overall contributor and per-metric suppression are server-owned; resource and Track floors are combined by maximum; distribution cells use the effective metric floor. |
| C07 scientific provenance | Frozen input maturity/provenance hashes feed the manifest; mixed inputs report the weakest evidence; legacy-unfrozen input is capped at PILOT with an explicit limitation; report evidence ceiling is enforced. |
| C08 deterministic persistence/reuse | Analysis identity binds Organization, exact cohort identity, governed spec/hash, resource identity, effective privacy floor, execution→result associations, scientific provenance, and options. Controlled concurrent creation persists one immutable artifact. |
| C09 authorization | Generate/read/reuse re-authorize current Organization access and explicit denies. Suspension is distinguished from hidden unauthorized access. A generic GROUP artifact spans multiple subjects, so one child's historical Parent evidence is deliberately not widened into aggregate access; Parent-only readers fail closed, and revoked relationship evidence cannot authorize the group artifact. |
| C10 API | HTTP routes require production CSRF/auth boundaries, reject unpublished specs and client-controlled raw-row options, hide cross-org guesses, and expose only `{ artifactId, generatedAt, projection }` for artifacts. Internal manifests/hashes/rows are not projected. |
| C11 release/performance | Fresh deploy + seeded idempotency, populated pre-PR3→PR3 migration rehearsal, deterministic output, controlled concurrency, 100/500 query/returned-row budget, and critical-suite no-skip enforcement are in CI. |

## Acceptance matrix

| Acceptance | Evidence |
| --- | --- |
| M-01 | `assessmentRunConsentRecovery.postgres.integration.test.ts`: admitted START identity survives UNKNOWN/retry/rebind; FINAL still rejects revoked current consent. |
| M-02 | Mixed frozen maturities resolve to the weakest evidence level with mixed-input limitation. |
| M-03 | `LEGACY_UNFROZEN` input is capped at PILOT and carries an explicit limitation. |
| A-01 | Only approved finite numeric values enter statistics; strings, objects, non-finite values and disallowed quality states do not. |
| A-02 | Duplicate subject observations are rejected; N cannot be inflated. |
| A-03 | Eligible N may be large while contributor N below the effective floor suppresses the whole projection. |
| A-04 | Metrics independently suppress when valid N is below their effective floor while sufficiently populated metrics remain present. |
| A-05 | Same N with different exact Membership/Run provenance yields different cohort/analysis identity. |
| A-06 | Barrier-controlled concurrent same-identity creation converges to one persisted immutable artifact. |
| A-07 | Swapping execution→canonical-result associations changes analysis identity; hashes are not treated as an unbound set. |
| A-08 | 100 and 500 SUBJECT fixtures retain the same batched access shape; returned rows scale linearly with population rather than query count scaling per person. |

## Security/state exit checks

PR3 release tests specifically guard against:

- numeric coercion entering analysis;
- duplicate observations inflating N;
- resource/Track privacy-floor bypass;
- historical maturity promotion;
- unauthorized cached/reused artifact reads;
- cross-Organization Run/artifact guessing;
- duplicate artifacts for one analysis identity;
- mutation/deletion of frozen cohort/artifact records;
- silent skipping of critical PostgreSQL suites.

## Remaining PR3 release condition

No additional PR3 domain capability is intentionally pending in this document. The remaining release condition is **Full Gate success on the exact final HEAD created by this evidence update and any subsequent fixes**. A previous green job or an earlier SHA is not sufficient merge evidence.
