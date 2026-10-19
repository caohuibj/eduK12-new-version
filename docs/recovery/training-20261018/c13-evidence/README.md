# C13 evidence index

All data and actors are synthetic. No production database, remote object store, browser, CI, or full-pressure benchmark was exercised. Raw database dumps and runtime credentials remain private on the current node and are not committed.

## Scope and input reuse

- First implementation checkpoint: `327cb0801430f9344ef2901464cb5adf525ff6c5`.
- Scope locks/catalog APIs and frozen harnesses: `1babfd77d6338409b97315f3ce8cbf5b902b1631`.
- Catalog UI: `18c91cbb`.
- `backend-build-01.log` retains successful original build prerequisites and the first TypeScript failure. `image-lock-tsc-02.log` is the subsequent successful TypeScript run (empty output); `image-media-provenance-final.log` binds the later media narrowing fix.
- `admission-unit-01.log`: 24 tests in three resolver/snapshot/admission files. `admission-delta-02.log`: only the four admission tests affected by scope prelocks, successful. Do not add reruns to the unique test total.
- `course-regression-01.log`: 41 tests in the one existing copy regression file. The requested nonexistent standalone runtime test path did not add a test file.
- `grant-unit-01.log`: 66 tests across grant and existing authoring suites. `grant-unit-02.log`: 42 grant tests after scope-lock and cursor changes, including post-wait account/course state. Prior unchanged authoring suites were not repeated.
- `image-lock-unit-01.log` and `image-lock-unit-02.log`: initial 74 media tests plus five shared-lock tests. Later shared-lock changes require a new affected-only result; these initial logs do not establish that later delta.
- `image-pagination-unit-01.log`: 13 media-directory pagination tests.
- Frontend first/review/workbench logs preserve the original affected component checks and TypeScript. Pagination final log preserves 17 passing tests and one failing test-only URL mock assertion; the image-retry log contains the single corrected test passing, six unrelated tests skipped. The pagination group contains 18 distinct tests, plus two workbench protocol-adaptation tests from the first pagination log. No browser evidence is implied.

## Actual C12 upgrade and restore

`upgrade-result.json` is the successful stopped-C12-copy migration result, including source PGdata fingerprint, schema/migration input hashes and dump hashes. The original source was unchanged before and after the run.

The old-table preservation scope is **202 business tables**, excluding `_prisma_migrations` and including `_legacy_import_batches` and `_legacy_import_id_map`. The migration ledger is checked separately (169 → 170). After adding grant and audit tables, the restored restricted-runtime contract covers **205 total tables and one sequence**: 202 + ledger + 2. All old columns preserve their complete table projections; new nullable fields remain NULL. Every upgraded table/column and encrypted byte survives a fresh-database restore. New grant tables are empty in this old-state qualification; nonempty C13 grant/receipt/image restore is a separate pending HTTP-written format check.

`cleanupVerified=true` for the upgrade. Dump hashes are public evidence; dumps, credentials and source synthetic rows are not included.

## Shared-lock checkpoint (historical)

`c995344db90ad89a398fc2c0cb0807ffcbc35908` freezes the shared asset SHARE-lock/batch-attach delta. `shared-lock-batch-unit-01.log` records 92 passing tests in eight affected files; `backend-tsc-final-03.log` is the final successful full backend TypeScript run (empty output). Both independent source reviews gave limited source GO. True PostgreSQL contention, the C13 HTTP chain, and nonempty new-format restore were pending at that checkpoint; the final results are recorded below. The runnable harnesses are under `server-version/scripts/recovery/c13-sjt-*.{py,mjs}`. Full browser remains C25; complete CPU/RSS/DB pressure comparison remains C26.

## Real HTTP and partial PG run (11:23 UTC)

`http-01-*` preserves the fixture-only immutable course-domain failure and verified cleanup. Fix `5d8d8b9d` creates Training courses directly; no product code or trigger changed.

`http-02-c13-http-result.json`: **42 checks / 212 HTTP requests passed**, 18 no-artifact censuses, ten observed PostgreSQL blocking events, four exact frozen grant receipts. Student and unique-course anonymous recovery after revoke/expiry, independent review/adaptation/media preview, legacy null multi-course anonymous flow, original CSV/ZIP queue, and grant/scope races passed. This successful HTTP phase is reused, not replayed.

The containing `http-02-c13-runtime-result.json` remains **failed**, cleanup verified, because the later asset PostgreSQL suite had four passed and six failed tests. Every failure was in observation SQL: Prisma bound the PID as bigint, while PostgreSQL `pg_blocking_pids` requires int4. Test-only commit `41355d45` adds `::int`; no assertion was removed and no runtime product code/dist changed. The four passing tests are shared physical COS protection, same-owner reverse-order idempotency, actual GENERAL reversed section publishing, and actual COURSE reversed mixed-media publishing. A stopped-state clone will rerun only six failed tests and the not-yet-run new-format restore; original failures remain intact.

## Final affected-scope qualification (11:27 UTC)

`followup-01-c13-followup-result.json`: passed, cleanupVerified and sourceUnchanged all true. The source PGdata and original failed aggregate remain untouched. Every original business source/config/schema/dependency blob and runtime/dist fingerprint matched. The PG test diff was restricted to its single explicit PID cast. The original HTTP result and four passed PG cases were reused without execution.

`followup-01-c13-image-lock-pg-followup-result.json`: exactly **six passed / zero failed / four skipped**. The six named cases establish publish retain-first/delete-first, attempt retain-first/delete-first, ownership recheck after delete waits, and two concurrent SHARE retainers blocking deletion. Combined coverage is **four original passed + six newly passed**, not a rewritten all-green original job. Original General/Course reversed multi-media publishing and same-owner idempotency results remain separate.

`followup-01-c13-new-format-restore-result.json` and `new-format-table-projections.json`: **205 tables**, all columns exact through dump→new DB restore; **10 grants, 19 audits, 2 authored releases, 5 situational attempts, 4 raw submissions, 6 asset references** are nonempty. Four actual HTTP-frozen exact grant receipts retain byte-identical ciphertext; one private image was independently copied and matched by SHA/size. The restored restricted-runtime role passes. Dump SHA256: `6e8c25425e04cce31814a00215e4fc4e7d6c6ac3b5106f2bf0cd8163859d8d84`. Dumps and image bytes are private local evidence, not committed. No HTTP/API/Redis was restarted in this follow-up.

Repro command: `python3 server-version/scripts/recovery/c13-sjt-followup.py --tools TOOLS --source-state STOPPED_C13_HTTP_02 --state NEW_PRIVATE_STATE`, under `TOOLS/.measurement.lock`. The script derives an anchored six-case pattern from the original failure JSON and enforces the exact test-only diff. The earlier full attempt command is `python3 server-version/scripts/recovery/c13-sjt-http.py --tools TOOLS --state NEW_PRIVATE_STATE`. Both own service cleanup.

Evidence supports only this affected scope. There is no claim of full-platform regression, browser acceptance, pressure benchmarking, COS production operations, or CI. New controlled publications support one real Training course; legacy null multi-course/anonymous paths remain supported. Cross-generation ADAPT image relicensing is deliberately rejected with an actionable error.
