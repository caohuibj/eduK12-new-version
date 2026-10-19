# C23 Training checkpoint qualification harness

Prepared harness, not execution evidence. This package has not started PostgreSQL, Redis, the API, a clone, a build or a qualification run. Actual qualification requires the parent to review frozen sources, matching build/Prisma receipts and current resource budget first.

## Frozen scope and failure ownership

C23 persistence migration, authorization, encrypted checkpoint CAS and cleanup → a lost draft, cross-owner read, stale-writer overwrite, reset save budget, or old-row loss → one isolated local production-dist/PG run → unchanged C21 recovery helpers and the accepted C21 checkpoint descriptor → upgrade 10 minutes, HTTP 10 minutes, race 5 minutes, nonempty restore 10 minutes maximum. Service readiness is bounded at 60 seconds. These are maximum phase deadlines, not instructions to spend all of them.

Only the C23 migration over C21 is accepted. C22 feedback work or another migration changes this scope and must be reviewed separately. There is no CI, push, merge, production operation, capacity assertion, 4-live/8-queued C21 replay, unrelated scientific regression, automatic retry, continuation or implicit full-suite replay.

## Actual producers

- `c23-checkpoint-http.py`: exclusive existing `tools/.measurement.lock`; validated stopped C21 descriptor, exact accepted continuation receipt and source bytes; one new private clone; services and all children remain in one invocation/network namespace. Official existing Node 24.21.0, PostgreSQL 16.15 and Redis 7.4.11 are required. Nothing installs or builds tools.
- `c23-checkpoint-db.py --phase upgrade`: deploy exactly `20261019050000_training_persistence`, one new table/four nullable columns, zero backfill, five exact additive guard identities, unchanged old full rows/columns/constraints/guard definitions; official restricted-role apply and verify.
- `c23-checkpoint-functional.mjs`: new synthetic teacher/student/outsider and HTTP-authored no-flow two-FORM publication. Authenticated and anonymous recovery ownership, stale epoch/hashes, null and bound round, existing accepted legacy-null attempt, initial-clear tombstone, 100 actual HTTP saves across clear/expiry, immutable publication recheck, current course cutoff tightening/closure, natural bound-round closure, actual production cleanup idempotence. Only new checkpoint rows receive guarded expiry shortening with PostgreSQL server time; no clock replacement or guard bypass.
- `c23-checkpoint-races.mjs`: real row locks and pending PostgreSQL blocker paths for save/save, save/clear, expired-read/save, maintenance SKIP LOCKED/save and child FINAL/checkpoint. The normal 500ms application lock timeout stays enabled. The barrier requires an actual acyclic PG wait graph; polling delay is not accepted evidence. A real child FINAL removes its draft from recovery while retaining the other unfinished draft; final parent completion and synthetic abandonment erase payload but retain identity/count. Restricted-role DELETE, reset-budget, revision, definition, round, retention extension, attempt epoch/snapshot, published policy and historical-null upgrade guards are actually exercised.
- `c23-checkpoint-db.py --phase restore`: requires successful HTTP and race producers and nonempty encrypted, tombstone, bound-round and 100-save checkpoint rows; dumps and restores every table into a new C23 database. Exact old C19 73-column ordinal/3-parser whitelist is unchanged. Every accepted old full row, complete logical snapshot and guard is compared, then restored restricted privileges are verified.

No accepted result or snapshot is seeded. New attempts and child FINALs use the API. Resource setup and intentionally invalid guarded mutations use the restricted runtime role. The migration/backup operator alone receives the owner URL.

## Source checkpoint and prerequisites

The reviewed descriptor is `/workspace/scratch/5a77e8bdc1ae/c21-checkpoint-descriptor-20261019.json`, SHA-256 `3c56792af3eb299f221a5f863d7225248d713d72fd5598fe399750a54edc0fe7`.

It deliberately distinguishes:

- data root `eduk12_c21_http_01`
- accepted evidence root `eduk12_c21_http_01_continuation_04`
- accepted final receipt SHA-256 `8b7e4a772d84e45f8d0d3e08f67b6e524ba77ac0a5248a588e8c5be330606c01`

The old failed data-root receipt is neither edited nor treated as successful. The accepted final continuation must have `passed`, cleanup, input/source preservation and final snapshot verification all true. Every descriptor file and its byte count is checked. Actual stopped pgdata/uploads/exports must exactly match its accepted final manifest before cloning.

Backend source, schema, scripts and all recovery helpers must be committed and clean. The compiler receipt must bind successful tsc, the exact Node binary, a closed source inventory, complete dist/client inventories, compiler bytes, complete installed dependency logical path/realpath/byte closure and either the successful original Prisma-generation receipt or the distinct current-client verification receipt below. Post-build commits may change only C23 harness or separately bound migration SQL; business/schema/dependency changes need their affected fresh producer. Generated schema bytes must match current schema exactly, or match only the explicit reviewed C23 formatting pair described below. No existing receipt is rewritten.

### Existing generated client verification

The recorded `prisma-02.log` says generation succeeded, but its old ledger explicitly lacks original before/after closure. Never represent it as such. `c23-checkpoint-verify-client.py` can instead produce `EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE`. It does not generate files, load the client or connect to PostgreSQL.

It freezes all current installed dependency, compiler/Prisma/tool/native-engine and generated-client bytes before and after. Generated native engine bytes must equal the installed Prisma engine. The `index.js` inline schema must exactly equal generated `schema.prisma`; all runtime model identities/table mappings, enum identities/ordered values/mappings, and field names, types, list/nullability and database mappings are checked. Its recorded limitation is explicit: this is consistency verification of current bytes, not historical generation provenance or dynamic behavior qualification.

Exact source/generated schema SHA-256 equality is preferred. The only reviewed nonidentical pair accepted here is:

- source: `4ce65dad2773c956c79c2fb56d3d74c50c28430a01e0b131a5e796db2a14244b`
- generated: `c1fbc3dfe259197ce8c14b523c9f0831a7d8a895a81a54ef862093846a490339`

Its differences are formatting/comments and independent model-attribute ordering in `CompositeAssessmentAccessToken` / `SituationalAttempt`, plus `@map` / `@db.Timestamptz` ordering for `ScaleDeploymentPolicy.createdAt`, `activatedAt`, and `retiredAt`. The inherited token comparison retains every identifier, field order, string, attribute argument and generator/config token. Any other nonidentical byte pair fails, even if token comparison might otherwise pass. Changing generator/config arguments never qualifies as formatting.

After reviewing these exact inputs, create the current receipt once:

```sh
python3 server-version/scripts/recovery/c23-checkpoint-verify-client.py \
  --backend server-version/backend \
  --node /workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018/node_modules/node/bin/node \
  --expected-head REVIEWED_FULL_COMMIT_SHA \
  --receipt NEW_PRIVATE_CLIENT_VERIFICATION_RECEIPT_PATH
```

The build receipt links it as `prismaClientReceipt: {path, sha256}` (the historical `priorPrismaReceipt` key remains supported for an actual original generation receipt). This branch requires its explicit scope, all verification flags, exact full dependency/client equality with build inputs, the exact verification-tool SHA and an ancestor source HEAD. The later actual migration/HTTP/PG checks still must pass; this verifier does not replace them.

Disk: at least 8 GiB free after projected clone plus an additional 512 MiB output reserve. Memory: at least 2 GiB MemAvailable. Ongoing guards retain the 8 GiB disk / 2 GiB memory floors and API RSS below 1 GiB. The descriptor itself recorded insufficient space when it was created; that is not a current budget approval.

## Reviewed command

Run once, only after the parent accepts the frozen harness, matching build receipt and current budget. Replace placeholders with actual reviewed values; do not substitute successful-looking receipt paths.

```sh
python3 server-version/scripts/recovery/c23-checkpoint-http.py \
  --tools /workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018 \
  --descriptor /workspace/scratch/5a77e8bdc1ae/c21-checkpoint-descriptor-20261019.json \
  --expected-descriptor-sha256 3c56792af3eb299f221a5f863d7225248d713d72fd5598fe399750a54edc0fe7 \
  --expected-source-receipt-sha256 8b7e4a772d84e45f8d0d3e08f67b6e524ba77ac0a5248a588e8c5be330606c01 \
  --state /workspace/scratch/5a77e8bdc1ae/eduk12_c23_http_01 \
  --expected-head REVIEWED_FULL_COMMIT_SHA \
  --build-receipt REVIEWED_BUILD_RECEIPT_PATH \
  --expected-build-receipt-sha256 REVIEWED_BUILD_RECEIPT_SHA256 \
  --through restore
```

Appending `--preflight-only` checks these prerequisites and source manifests under the exclusive lock, then exits without creating the state directory, cloning or starting services. Its output is explicitly not qualification. A planned `--through` prefix may stop early, but cannot mark the full C23 runtime receipt passed.

All raw service/SQL/HTTP diagnostics, credentials, payloads, source manifests and DB snapshots remain in the 0700 state directory; newly written files use 0600. Public errors use fixed messages/SQLSTATE only and token paths/query strings are redacted. A failed attempt keeps its original private journal and failed receipt. Investigate the exact phase; any continuation needs its own explicit bounded review and does not rewrite the original result.

Final success requires all four phases, writer quiescence before final snapshot creation, unchanged build/dependency/client/tool/source evidence, unchanged stopped source bytes, complete process/port cleanup with exit 0 for PostgreSQL/Redis/API (including process-exit races), and no surviving postmaster PID. A missing or failed final snapshot cannot pass.

## No-service preparation checks

```sh
python3 server-version/scripts/recovery/c23-checkpoint-tests.py
/workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018/node_modules/node/bin/node \
  --test server-version/scripts/recovery/c23-checkpoint-barrier.test.mjs
```

These fault checks cover fail-closed disk/memory budgets, failed source receipts, closed build reuse, non-emitting compiler receipts, incomplete/failing final snapshots/phases, exact additive schema/guard inventory, disabled/rewritten guards, graph cycles/unknown blockers/missing waiters and public error redaction. They never connect to a database or substitute for dynamic authorization, migration, concurrency or restoration evidence.
