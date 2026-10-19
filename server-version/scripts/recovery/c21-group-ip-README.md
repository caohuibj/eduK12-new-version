# C21 isolated Training public-round qualification

These scripts are not evidence of a successful run. They operate only on a new private clone of a stopped C20 checkpoint. A single persistent invocation owns PostgreSQL, Redis, the production-dist API, all HTTP clients, and `.measurement.lock`. Do not launch individual phases or services in separate tool invocations/network namespaces. No production operations, push, dependency installation, build, original-state edits, business-guard disabling, clock spoofing, or credential publication is performed.

## Inputs and exact command

Only after source review, source commit, a matching built `dist`, fresh generated Prisma, and explicit parent approval to run:

```sh
python3 server-version/scripts/recovery/c21-group-ip-http.py \
  --tools /workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018 \
  --source-state /workspace/scratch/5a77e8bdc1ae/eduk12_c20_http_09 \
  --state /workspace/scratch/5a77e8bdc1ae/eduk12_c21_http_01 \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-source-receipt-sha256 "$(sha256sum /workspace/scratch/5a77e8bdc1ae/eduk12_c20_http_09/c20-runtime-result.json | cut -d' ' -f1)" \
  --build-receipt /workspace/scratch/5a77e8bdc1ae/c21-build-evidence/build-04.receipt.json \
  --expected-build-receipt-sha256 "$(sha256sum /workspace/scratch/5a77e8bdc1ae/c21-build-evidence/build-04.receipt.json | cut -d' ' -f1)" \
  --through restore
```

Run from the C21 repository, and use the reviewed explicit SHA values when recording the final producer. The state destination must not exist. `--through` permits a planned prefix only, not replay or automatic continuation. Any partial failure stays failed; stop, inspect the exact private logs, and design a bounded separately reviewed continuation rather than repeat accepted work. All newly produced files default to 0600 and the state directory to 0700. Runtime credentials and original full rows are private.

Preflight requires Node 24.21.0, PostgreSQL 16.15, Redis 7.4.11; at least 8 GiB remains after projected one-time clone plus 512 MiB output reserve. Runtime stops below 8 GiB free, 2 GiB MemAvailable or at API RSS 1 GiB. The stopped source receipt is accepted for its integrity and final checkpoint only, explicitly preserving its `passed:false`; no C20 qualification success is inferred. Original source bytes are hashed before and after. Compiler receipt must include successful tsc, exact compiler and installed dependency logical-path/realpath/byte closure, unchanged generated client, and original successful Prisma-generation receipt binding. Dependency closure is compared before and after the invocation. Compiler reuse accepts only ancestor producer with byte-identical compiler inputs/dist/client and a closed source inventory; separately changed migration SQL and new C21 harness paths are explicitly bound to the execution HEAD without rewriting the compiler receipt. Source HEAD, all selected source files, harnesses, generated client, production dist, tools and effective configurations are pinned and rechecked at phase boundaries and shutdown. API/client children never receive the owner URL.

## Producers

- `c21-group-ip-db.py --phase upgrade`: actual additive migration, no backfill, exact retained old columns/full rows/guards/constraints, only named additive guards, official limited-role apply and verify.
- `c21-group-ip-functional.mjs`: fresh users/course, real role logins, HTTP-authored/published FORM task; prior-day task starts a server-now round, raw token/round binding, same-round links, list/reveal, wrong publication/teacher/student/window denies, null legacy behavior; actual wall-clock round expiry and link revocation; original anonymous FORM FINAL/idempotent replay and report outbox processing/recovery.
- `c21-group-ip-performance.mjs`: real loopback HTTP using compiled production middleware and real PostgreSQL. Terminal handler has no business SQL to isolate additional policy SQL. Original coarse allowance uses zero SQL; over-coarse valid traffic reads current bindings once each; 125 successful validations do not consume the 120-negative budget; failed verification storm stops SQL at 120. Real PostgreSQL table-lock barrier observes four live queries/eight queued and overflow rejection. This is isolated middleware overhead/bounds evidence, not a whole-application load test or a claim of capacity/resource improvement. A separate focused real Redis production-branch probe temporarily switches only the harness process environment, verifies exact synthetic-key MONITOR command counts (GET+TTL for successful checks, EVAL/INCR/EXPIRE for failures), checks the shared 120-failure ceiling, then closes its cache connection and requires fail-closed zero-SQL behavior. It does not start the application in production mode. A held real SQL query remains active after its response deadline until the database lock is released.
- `c21-group-ip-races.mjs`: independent worker's real PostgreSQL writer races and mutation guard matrix; new synthetic rows only, actual blocking observations and original failure codes preserved.
- `c21-group-ip-db.py --phase restore`: nonempty new round/token data plus every table, logical row and guard restored; existing exact C19 physical-ordinal/parser whitelist remains enforced; restored restricted-role contract checked.

Public outcome: `c21-runtime-result.json` and individual phase result JSON. Raw HTTP journals, SQL fixture data, API/service logs, frozen inputs and source manifests remain private. A runtime result succeeds only when all requested phases, input preservation, source preservation and cleanup succeed. It does not grant CI acceptance, deployment permission, or capacity qualification.
