# Local Training receipt cipher-column diagnostic

This is a sanitized, portable extraction of the real-HTTP diagnostic, not a performance benchmark, CI gate, production runner, browser test, or full reproduction of earlier cold/warm series. The extracted launcher was run once from its repository path against dedicated local PostgreSQL 17 and Redis on 2026-10-24, using new ephemeral keys and fresh synthetic fixtures; both versions completed and all assertions passed (exit 0). Resources were stopped afterward. The original local diagnostic passed on product parent `cb325f1ed34e5444342cb5380c98040cc4554f6a` and candidate `3e903730df23a6013f90bf41e47a312d4903ed30`. A first attempt successfully submitted one unit, then failed in its SQL selector; that evidence was retained. The corrected selector scopes the primary-key assessment SELECT to BEGIN/COMMIT.

## Published source identities

Local-to-GitHub commit rewriting preserves the exact product tree. For checkout from the backup branch, use published parent `c794fc6e62a4faee41fc8b78897626aeff5ca9bc` (tree `0db4b1788d448fe46beb76e084e4b5981f6a5fc6`) and candidate `9e69cc22cf8f9b33e1d0d5d5f33444967edc13bd` (tree `50157a4d22389ad755a8e85f14b0e06c5fb68281`). They correspond to the local source identities above; do not assume those local commit objects are present on GitHub. Pin matching dependencies and generated clients, and provide the resulting backend directories explicitly.

## Safety and prerequisites

- Operator must explicitly provision a disposable synthetic PostgreSQL database (already migrated for both source versions) and a dedicated Redis instance. Do not use a tunnel to any shared or production service. The script cannot determine whether a loopback port forwards elsewhere.
- No defaults connect to a database. Both URLs require `127.0.0.1` and explicit ports; database name must end `_perf_test`. Only limited Prisma URL options are accepted. The explicit acknowledgement is not a substitute for checking resource ownership.
- Provide two immutable backend source directories with compatible generated Prisma clients and installed dependencies. No install, Prisma generate, migration, download, database drop, or upload is performed.
- Synthetic fixture rows are inserted and retained. Encryption/session keys are randomly generated in memory for this invocation, never printed or written. Existing synthetic rows from this invocation will not be decryptable in a later process. Use a disposable database and retain only diagnostic outputs, not credentials.
- Outputs contain synthetic identifiers and SQL with placeholders, not bound parameter values or authorization cookies. Treat stdout/error logs as private until reviewed. Never upload database URLs, environment dumps, databases, or generated credentials.
- Run only with exclusive local test resources. The process owns its loopback API and byte proxy, but does not start or stop your provisioned PostgreSQL/Redis. The operator owns their shutdown and retention.

## Invocation

Supply these environment variables through your local execution environment, without committing their values:

- `SYNTHETIC_LOCAL_PROBE_ACK=disposable-local-only`
- `DATABASE_URL`: explicit local disposable PostgreSQL URL; no example credential is supplied.
- `REDIS_URL`: explicit dedicated local Redis URL.
- `PARENT_BACKEND_ROOT`, `CANDIDATE_BACKEND_ROOT`: absolute backend directories.
- `PROBE_OUTPUT_DIR`: a new local output directory.

Then run `node run.mjs`. Any assertion failure returns nonzero. Per-step partial evidence is retained. Do not rerun just to obtain favorable timing; this diagnostic intentionally makes no timing comparison.

## What is exercised

Each version gets one new synthetic questionnaire with two 20-item custom descriptive scales. Fixture admission/frozen content is prepared through repository helpers. Real authenticated Training router requests use JWT, session revocation checks, CSRF and current authorization. The harness does not inject `req.user`. It is not an actual login or browser flow.

1. First scale FINAL with `?response=receipt`: expected one transaction assessment reread, cipher present in parent and absent in candidate, one snapshot created.
2. Exact receipt replay: no transaction reread, no DML, full persisted-row hash unchanged.
3. Normal current-unit GET delivers the second unit.
4. Second scale first FINAL with no query: cipher remains selected in both versions.
5. Normal finalizing GET, report status and report; two scale scores must equal 20.
6. Default detail replay after report availability: detail remains present, no DML or stored-row change; report response remains exactly equal within that attempt.

The fixture uses IMMEDIATE policy but normal parent lifecycle defers unit detail until the aggregate report is ready. Report availability is never forced. First submissions legitimately update assessment rows and insert snapshots; “zero extra facts” refers to replays, not initial submissions.

## Interpretation

Original diagnostic receipt first submit: 19 SQL events and 257 HTTP body bytes in both versions; DB protocol received 52,428 to 34,215 bytes. The deterministic claim is omission of the cipher column, not a guaranteed bandwidth saving of exactly 18,213 bytes for every deployment. DB protocol bytes include statement preparation/metadata; the following default request may prepare a different projection. SQL events exclude internal trigger statements and are not a full DB work count.

`NODE_ENV=test` skips the product's ordinary Redis/IP limiter. Authentication/revocation and relevant business checks still run. This is not full production middleware cost, public-network latency, cold process timing, concurrency correctness, or capacity evidence. No isolated function/decryption invocation count is collected. The same-instance report equality is exact; cross-fixture UUID/hash/time differences require a separately disclosed semantic comparison.

Only source/helper resolution and local orchestration were made portable; product code is not patched. No historical measurement or formal CI qualification is conferred on this extraction. Review it before running, and preserve its source hash alongside source, dependency and configuration identities for any later evidence.
