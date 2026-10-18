# C07 typed report and CSV/ZIP local functional evidence

Source is based on C06 `1d41cd716342985226b23977e2fa112245d65db9`. This records source and local functional checks; browser and formal performance qualification remain separate. No production, push, PR, CI or browser execution by this task. All new checks run only in the current isolated cloud node under the shared measurement lock.

## Contract

- Accepted encrypted V2/V3 collection facts remain authoritative. A pure loaded-source reader shares the report reader's canonical/schema/section/epoch validation. Export loads frozen sections once and selected current-epoch snapshots in one bounded query, not one query per attempt. Missing/mismatched/unknown-version facts fail closed, never fall back to String shadows. Legacy fields inside typed sections use their original compatibility projection from canonical facts.
- Existing bounded materialization, export intent, queue consumer, artifact provenance, current-principal reauthorization and download routes remain in use. This is not streaming and not a performance improvement claim. Typed schema identity is included in the existing projection fingerprint; legacy-only fingerprint behavior is unchanged.
- NUMBER/SLIDER and CONSTANT_SUM component columns remain numeric, with no display rounding. Canonical negative zero is already normalized to zero; NaN/Infinity are not valid facts. MULTIPLE/RANK_ORDER use JSON_STRING_ARRAY in accepted order; MATRIX/MATRIX_MULTIPLE have an explicit JSON_OBJECT and frozen row columns. CONSTANT_SUM has JSON_OBJECT plus numeric columns in frozen option order, preserving 0. JSON_OBJECT distinguishes an empty object from absent null in V2.
- New SHORT_TEXT/LONG_TEXT/OTHER_TEXT use explicit JSON_STRING cells, decoded with JSON.parse, so original `=1+1` and original `'=1+1` remain distinguishable. Typed text still passes the shared CSV formula guard. Other TEXT cells follow the documented apostrophe defense and are not generally reversible if such a prefix is added; current choice keys are restricted to `^[a-z][a-z0-9_-]{0,79}$`, and DATE/TIME are format-validated. Legacy-only CSV bytes are unchanged. Survey imports the same pure guard from the common utility rather than Training importing Survey services.
- New typed summary excludes SHORT_TEXT/LONG_TEXT and other text. Full follows existing authority. Fields and ZIP dictionary are built together, with source item/section keys, definition hashes, section-effective V2/V3 fact version, options/row labels, encoding and missing semantics. Zero-record schema is definition-driven. V2 state remains null/NOT_RECORDED; only V3 persisted states distinguish ANSWERED, REFUSED, SHOWN_MISSING and NOT_SHOWN.
- Typed SAV is explicitly rejected before enqueue and at writing, including summary with all text suppressed. C07 supports CSV/ZIP, not every export format. Existing legacy SAV is unchanged.
- Report adds typedValue and minimal frozen presentation alongside legacy value/displayValue, from the same canonical reader call. The shared read-only component renders option/row labels, rank order, numeric zero and explicit row states. It computes no score or visibility. Original report permission and anonymous recovery remain unchanged. Typed compact fast-path fallback is retained; cost is deferred to C26.

## Check selection and evidence status

Changed components → typed fact adapter, export columns/dictionary/fingerprint, report presentation and export UI. Required checks → exact typed values/zero/null/four-state/mixed legacy behavior, formula encoding, unknown facts and wrong binding denial, summary exclusions, pre-enqueue SAV denial, original revocation/download gates, cached report/read-only rendering, real public authoring→FINAL→report→original queue→CSV/ZIP. Primary location → current node only. Unchanged schema/migrations and old source facts are not relabeled as newly qualified.

## Executed checks

Raw logs and per-file SHA-256 are in [c07-evidence/manifest.json](c07-evidence/manifest.json). Tested final source is `ff1c3ebcac3f7518c198cece2b3d450d9c6ed0d6`; subsequent evidence-only commit does not change tested product code. Each test group below overlaps earlier groups and must not be summed as unique tests.

- Backend `tsc` (repository tsconfig.json, emitting tested dist): final log `c07-tsc-04.log`, passed. Initial literal-type error is retained in `c07-tsc-01.log`.
- Backend Vitest group 01: typed-form-export, typed-form-facts, composite export.service, Survey research-storage-export-roundtrip: 4 files / 120 passed.
- Backend group 02: typed-form-export, assessment-export-enqueue, assessment-export-download: 3 files / 44 passed.
- Backend final group 03: typed-form-export: 1 file / 32 passed. Independent literal expectations cover exact decimal/zero/null, JSON array boundaries, section-effective V3 metadata with mixed legacy items, zero-row schema, four states, unknown/missing/mismatched facts, one snapshot query, formula text distinctions, finite validation and SAV guard.
- Frontend `tsc -b`: final `c07-front-tsc-03.log`, passed. Initial implicit-any errors and corrections are retained.
- Frontend Vitest group 01: ReadonlyFormAnswer, CompositeReportPage, CompositeAssessmentEdit: 3 files / 29 passed. Group 02: ReadonlyFormAnswer, QuestionnaireProducts: 2 files / 31 passed.
- Frontend final group 03: TypedFormExportActions, QuestionnaireProducts, ReadonlyFormAnswer: 3 files / 35 passed. Includes real nested teacher DTO detection, original intent/poll/authenticated-download path, denied download, and refused matrix row labels/states.
- Targeted ESLint on six changed frontend production files: zero errors, two pre-existing hook warnings (same lines present in C06). `vite build` passed, with bundle-size warning retained.
- Independent worktree dependencies were installed from official-registry cache and Prisma generated; logs retained. All execution was serialized with the shared `.measurement.lock`. HTTP databases explicitly use UTC. Vitest log display timestamps reflect the runner environment and are not used as UTC evidence timestamps.

## Real HTTP queue and artifact checks

The isolated launcher runs the existing API and report worker and preloads the **original exportProcessor** into that test worker process. It does not replace queue logic or artifact/download authorization. It intentionally avoids unrelated image/video processors. The test consumer receives runtime credentials only, not the owner database URL or unrestricted parent environment. This same-process test assembly is not evidence for independent production worker CPU/RSS. Existing bounded materialization remains; no streaming or performance improvement is claimed.

Six fresh, local-only attempts are preserved, each with source/runtime fingerprint and verified child cleanup:

1. HTTP 01 failed before business checks: enabling unrelated image processing required an unavailable native canvas module. The harness was narrowed to the original export consumer.
2. HTTP 02 failed on an invalid fixture maxLength of 16000 (public limit 10000); fixture corrected.
3. HTTP 03 failed because V2 fixture used types requiring public V3 policy authoring; fixture corrected to publicly authorable V2 fields.
4. HTTP 04 failed because the harness assumed flat teacher form DTO/section IDs. The actual nested DTO was adopted; the same discovery fixed new typed-export UI detection and gained a real-DTO component test.
5. HTTP 05 is **overall failed**. Its complete V2 logged-in subgroup passed canonical FINAL/report/cache, CSV/ZIP values and dictionaries, summary suppression, SAV enqueue rejection, and download denial after authority revocation. Later V3 setup failed on missing compatible formOptions. The passed V2 subgroup is explicitly retained without relabeling this whole run as successful.
6. HTTP 06 is **V3-only passed**, after compatible formOptions correction. Anonymous public FINAL/recovery/report/cache, all four states and per-row states, other text, original export queue CSV/ZIP, dictionary, summary, SAV rejection and revoked-authority download checks passed. Cleanup verified.

Runs 05 and 06 used identical backend dist: 4965 files, fingerprint `da5870b79f3d0b826be9aa83561f3a502370f02cc9ae8b74df4f7734f636c231`. Their exact tested scripts are retained as tested-v2-smoke.mjs and tested-v3-smoke.mjs; source revisions and harness hashes are in runtime results. CSV and ZIP checks use an independent parser and literal expected values, including `=1+1` versus original apostrophe text, long Unicode, -12.34567891, zero, null, rank order, matrix rows and constant-sum components. Synthetic String shadows were poisoned to verify canonical authority. No real personal data was used or retained in these evidence files.

Observed payload/storage bytes (functional observations, not load/performance qualification):

| Run/group | Full ZIP bytes / CSV bytes / fields | Summary ZIP bytes / CSV bytes / fields | Full CSV bytes | Accepted fact ciphertext bytes |
| --- | --- | --- | --- | --- |
| 05 V2 completed subgroup | 65587 / 12897 / 45 | 46597 / 798 / 39 | 12897 | 25146 |
| 06 V3-only passed | 77121 / 13206 / 53 | 54440 / 1006 / 44 | 13206 | 26534 |

Artifact download bytes equal stored artifact bytes in all six generated artifacts. Run 05's 64 requests total 32435 request-body / 401262 response bytes, including the later failed V3 setup. Run 06's 61 requests total 33236 / 529745 bytes. Per-request raw statuses/bytes are retained without request bodies, session credentials, owner URLs or fixture secrets. Incidental duration/RSS fields in raw status are not formal measurements. C26 owns CPU/RSS/SQL/concurrency qualification; C25 owns browser coverage. C09 timing facts are not fabricated. No CI qualification is inherited.
