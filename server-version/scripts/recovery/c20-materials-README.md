# C20 private production-dist PostgreSQL qualification

Status: authored and syntax-checked only. No service, migration, HTTP scenario,
heavy test, CI, push or deployment was run by the harness author. A successful
result is valid only after the designated operator freezes inputs and executes
this launcher. This is functional/restore/query-budget evidence, never C26
capacity or browser qualification.

## Scope and execution contract

Changed component → failure detected → primary execution:
- C20 additive migration/role → historical row/schema/guard loss, invalid new
  reservation ledger → isolated PostgreSQL 16.15, upgrade/guards/restore.
- C20 production admission/path/consumers → partial reservation, identity leak,
  stale restart authority, broken provenance → frozen production dist over HTTP,
  original native FINAL handlers and report/export workers.
- C20 query paths → history scans/N+1 or candidate payload expansion → serial
  real-PG SQL events at specified populations; no throughput extrapolation.

The only old source is the stopped C19 state08. The launcher verifies its runtime
receipt SHA f248800fe0b654d9b3ca8654ee76a71117627e41ee892b2ab5eac6d19cf7ad58
and nonempty dump SHA
c93890e3958e905304254225c9c94879690a0c37da13755a462fc77103c6dd15.
It copies the stopped cluster/uploads/exports into a new private directory,
compares byte manifests, then starts services only against the copy. The pinned
dump is independently restored and compared before the additive migration.
No source service starts; source and any predecessor remain byte-for-byte fixed.

Use the unified launcher directly, never an outer flock. It acquires
TOOLS/.measurement.lock once. PG, Redis, API, clients and workers must remain in
one persistent executor namespace. PG is bound to 127.0.0.1, has no Unix socket,
and uses UTC. Runtime principal remains restricted; owner access is limited to
migrations/restore and scoped PostgreSQL failure triggers. No production/Mac or
external task is involved. No backup or historical evidence is deleted.

Stop lines: free disk <8 GiB, available memory <2 GiB, API RSS >=1 GiB. Before
copying, the launcher reserves the clone bytes plus 512 MiB above the disk floor.
Each HTTP phase has a 600-second failure timeout; DB phases have 300 seconds.
A timeout is a failed retained checkpoint, not a license to replay accepted work.
Tools are pinned to Node v24.21.0, PostgreSQL 16.15 and Redis 7.4.11. Prisma must
already be freshly generated and dist already built from committed business
inputs. The launcher never generates/builds during a run. Source, dist,
generated client, tool executable and exact environment hashes are checked
before and after each phase and at shutdown. Private endpoint/credential paths
are relocated without changing their values otherwise.

Example (operator must supply the actual frozen full HEAD and a NEW state path):

    python3 server-version/scripts/recovery/c20-materials-http.py \
      --tools /workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018 \
      --source-state /workspace/scratch/5a77e8bdc1ae/eduk12_c19_http_08 \
      --state /workspace/scratch/5a77e8bdc1ae/eduk12_c20_http_01 \
      --expected-head FULL_FROZEN_HEAD --phase main

## Independently recorded phases

1. upgrade: 211 old tables/174 migrations → 215 tables/175 migrations; old full
   rows and exact same-database column ordinals/constraints/functions retained.
   Exactly three new old-table identity guards are checked against their frozen
   migration body and exact trigger metadata, then bound for later comparison.
   Official restricted runtime-role apply/verify must succeed.
2. main: fresh reviewed/granted four-tool publication; one Form → Scale → real
   120-trial Cognitive → online SJT path. Every FINAL is genuine, exact replay
   stays one fact, late native admission remains deferred. Original queued
   report materialization precedes asserting COMPLETED. Unreached probes never
   invent nonexistent native rows. No old C19 FINAL is submitted.
3. anonymous: four fresh publications, each tool genuinely first-reached;
   recovery/restart retains participant and claim/group/quota, rotates recovery
   authority, nulls the old parent hash, rejects actual retired native routes,
   and counts ABANDONED against maxAttempts.
4. linked: two known initial groups and a fresh second publication prove
   KEEP_LINKED inheritance, original-group-full denial while another group is
   still free, course/owner isolation, and new legitimate-attempt claims.
5. race: observes two actual PG lock waiters for the final quota slot and same
   anonymous restart. Also observes legacy null-flow start versus restart on
   the same product/token. Concurrent HTTP requests alone are not evidence.
6. rollback: exact-fixture AFTER triggers throw inside real admission at quota,
   token and first-native writes. Every partial parent/token/claim/counter/native
   effect must roll back; all injection DDL is removed even on failure.
7. branches: SCREEN_OUT, COMPLETE_EARLY, refusal and public recovery retain
   assigned material/quota and do not admit skipped tools.
8. revocation: fresh course grants for Scale/SJT; already-reached A restores and
   completes after revocation, unreached B remains denied with WAITING outbox,
   no new native child, and unchanged material assignment/quota.
9. consumers: separately authored companion producer checks report/CSV/analysis
   provenance, redaction, suppression, real queue artifacts, and preserves
   original accepted facts/jobs. It creates only its new second-wave FINALs.
10. consumer-cost: separately authored companion producer creates 51 distinct
    people × 2 short publications (102 completed parents, 204 genuine FINALs),
    with the same experiment/KEEP_LINKED and quota a=50/b=1.
    At 10/20/50 actual group-a participants it measures real production analysis/export SQL and a real
    individual report at each population; full composite export explicitly includes
    the actual a+b population. The selected analysis group is never mixed with b.
    Observations include transparent decrypt-byte
    counters. It does not claim a nonexistent batched-report API or capacity.
11. cost: cold/warm/restart/linked/full quota HTTP SQL windows plus legal 2-vs-8
    group actual admission sizes, with same 8000-character group bodies. Frozen
    candidates must contain no group material text and remain fixed-size even
    while the publication configuration grows.
12. guards: restricted-principal UPDATE/DELETE failures and rollback-only
    missing-claim, +2 counter, duplicate ordinal, above-count ordinal failures.
    Diagnostic parent clones exist only inside aborted transactions; they are
    never committed or counted as accepted attempt/fact evidence.
13. restore: all four new tables must be nonempty. Every 215-table logical
    projection, definition, guard and fact must survive new-format dump/restore.
    The inherited C19 parser whitelist is additionally pinned to exactly its
    73 physical-ordinal differences and three CHECK reparse proofs. Same-DB
    comparisons never use ordinal normalization. Runtime role verification and
    unchanged pinned old-dump hash are required again.

`--phase X` executes the prerequisite prefix, or reuses only matching completed
phases from `--from-state`. Phase hashes bind their direct inputs. Existing
successful evidence is not relabeled as freshly executed. Result request arrays
are transport measurements, not independent test-case counts.

## Failure retention and continuation

Every HTTP operation is journaled privately before sending and after receiving,
including the exact new submissionId and response digest. Each phase writes its
own result even on exception. The launcher stops all owned services, checks
ports/pid files and source byte manifests, and retains the final DB snapshot
with its SHA in the runtime receipt. It does not auto-retry a partially successful
phase, reset failed export jobs or replay accepted FINALs.

For a reviewed continuation, supply a new c20-*.mjs producer, its SHA, the exact
prior runtime-receipt SHA, `--from-state`, and that single missing `--phase`:

    --continuation-script c20-REVIEWED-continuation.mjs \
    --continuation-sha256 EXACT_SCRIPT_SHA256 \
    --expected-prior-runtime-sha256 EXACT_PRIOR_RECEIPT_SHA256

The predecessor final DB snapshot is SHA-verified and compared with the fresh
clone. All prerequisite successful phases must match. Failed producer results
are copied under a prior-failed name; private journals and operation files are
retained. The continuation must explicitly inspect accepted state and issue
only missing operations. It cannot rewrite the original source state or claim
that an unexecuted assertion passed. A changed business/dist input invalidates
only relevant evidence but requires a separately reviewed compatibility plan;
this launcher deliberately refuses to silently replay incompatible phases.

Only sanitized results/manifests may be published. Private runtime, journals,
credentials, raw rows, answers, dumps, uploads and operation files remain local.
