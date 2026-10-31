# B line: current-main resource accounting and bounded observation

Fixed source main: `555f705dd272f0ee9c7ac0d80770010d2d6e9675`.
The user specified a future 4-vCPU/4-GB host and requested testing against actual
current main, rather than relying on the old resource contract. No production
connection, configuration, permission, flag, deployment or load was attempted.

## Current-main defect and minimal candidate

Current migrations create SQL-owned `reporting_task_artifacts`, which is absent
from `scripts/runtime-table-policy.json`. On an actual disposable PostgreSQL
16.15 database, all 271 migrations succeeded, then the unchanged provisioning
script failed with `P0001 / UNCLASSIFIED_RUNTIME_TABLE` (psql exit 3). The
observer and fixture seed were not executed in that first invocation. This
refusal is correct; bypassing it or using owner credentials for the workload
would not verify the production runtime contract.

The only product change adds this one table as `RUNTIME_RW`, consistent with the
other reporting tables and the actual INSERT/SELECT consumers in
`reporting/task-artifact.ts`. No migration, trigger, SQL predicate, runtime
verification code, authentication or grant executor changes. Its immutable
trigger continues to refuse UPDATE and DELETE. It has zero file intersections
with the fetched changed-file lists of A's PR435/436/444/445/447. Those lists
establish file ownership at inspection time, not future integration qualification.

After the one-entry correction, R2 provisioned the restricted role successfully:
268 actual tables, one sequence, 271 applied migrations and fingerprint
`b0e516aa6d22b7a51d58bba3c9d1e9faab8afb34b28f85b6089bd6e6a7f7d35d`.
The new persistence probe verified actual encrypted artifact insert/decrypt/read,
wrong-container null, immutable UPDATE/DELETE refusal, and denied migration-ledger
write/schema CREATE. These are four recorded groups of assertions, not a claimed
four-case application or HTTP suite. The artifact is an explicitly synthetic
empty projection: no respondent answers, report generation or scoring.

R1 failure remains preserved. R2 reused the successful unchanged Prisma
generation; a fresh disposable database was necessary after R1's task container
was cleaned up. Migration application is setup, not an old lifecycle replay.
Both task containers were stopped and their tmpfs data discarded. Saved local
development databases were never connected to or changed.

## New actual current-authority observation

R2 creates one synthetic Teacher SELF library-Scale pending execution through
the existing source approval/publication fixture. It never STARTs or FINALs it.
Six actual current-authority calls use a restricted runtime role and explicit
read-only transactions. There are no completed answer or unit-snapshot rows
before or after. The persistence probe's unrelated empty artifact is present.

| Measurement | Observation |
|---|---:|
| First reader invocation through completion of its transaction callback | 52.264 ms |
| Subsequent five invocations, median | 24.627 ms |
| Business SELECTs per invocation | 7 |
| Library identity query planning, collapse 8 / 1 medians | 2.276 / 2.217 ms |
| Final population query planning, collapse 8 / 1 medians | 34.516 / 12.355 ms |

The transaction sample includes BEGIN/control reads and instrumentation before
reader completion, excludes COMMIT, and is not an HTTP response time. The first
invocation is process-first for that reader; database pages and setup were warm.
It is not a cache-cold browser/server/database observation. No p95, throughput,
pool-wait distribution, final-report wait or 4C4G capacity is inferred from six
calls. Per-query wall time includes driver/transport; EXPLAIN separately reports
actual PostgreSQL planning/execution/buffers, with interleaved 8/1 alternatives.
The final query's production setting already remains 1 from PR377. No extra
planner setting is proposed for the first query: this sample gives no useful
evidence of benefit. This is an updated observation after composition identity
changes, not a replay or replacement of PR377's old qualification.

The PostgreSQL container was limited to 1 CPU/512 MiB, shared_buffers 64 MiB,
max_connections 20, jit off, with a single-connection runtime pool. Node ran on
the shared cloud executor, not inside a 4C4G application envelope. Node
24.21.0, Prisma 5.22.0, and copied saved dependencies were used. Current backend
lock requires follow-redirects 1.16.2; the copied environment contains 1.16.1.
The diagnostic is not a fresh-lock installation, audit, production-image or
complete environment qualification. Source/dependency associations recorded
after execution are retrospective and unsigned. Original loaded-source hashes
are captured by the reader, and the binding manifest records this limitation.

## 4C4G source budget, not live capacity

Actual current-main Compose files were rendered with synthetic configuration
values and passed the existing `prelaunch-resource-preflight.mjs`. No services
were started by these renders. No Compose, production resource setting, pool or
admission limit was changed.

| Source defaults | CPU caps sum | Memory caps sum | Nominal host memory remainder | Budgeted app connections |
|---|---:|---:|---:|---:|
| Production Compose | 3.5 | 3200 MiB | 896 MiB | 28 |
| Capacity overlay, worker explicitly included | 4.0 | 3200 MiB | 896 MiB | 18 |

Per-service memory caps are PostgreSQL 1024, Redis 256, API 1024, worker 768 and
frontend 128 MiB. The arithmetic assumes the existing script's 4096-MiB host;
actual OS-visible RAM, CPU contention and extra host processes are unknown.
API/worker heaps are 640/192 MiB. Production default API pool 20 differs from
capacity-overlay pool 10, and admission defaults also differ. Neither is a
verified optimum for current main. The future run must bind actual flags,
worker participation and both configs rather than reuse an old profile name.
The existing preflight correctly returns `capacityCertified:false`.

## O12 accounting, reused originals

`ledger-derived.json` derives every selected table/checkpoint's table/index/
total bytes from the three retained lifecycle JSONs. All source hashes and
table+index=total identities were checked; no database lifecycle or gzip
experiment was rerun. The original selected 18-relation result at 30 synthetic
answers remains table bytes -565248, indexes +73728, total -491520 bytes. This is
16.57% of total selected allocation or 35.50% of baseline-subtracted growth;
neither measures whole production database or backups. At one answer the same
mode allocates 49152 bytes more; at ten, 114688 fewer. Existing shared templates
and per-person bindings are accounted for, not presumed removable duplicates.
WAL evidence is cluster insert-LSN advance, not retained WAL or backup fees.

The environment has no production/COS credential binding or private TCP access.
Prepared `production-readonly-snapshot.sql` has NOT run against production. It
requests metadata only: database/table/index sizes, tuple estimates, connection
wait aggregates, selected memory/WAL settings and cumulative WAL counters. No
answer columns, SQL text, secrets, new grants, extensions, VACUUM or ANALYZE.

For backup cost, reuse existing `host-ops/cos-inventory.cjs` and retained local
receipts/status snapshots through already-authorized operators. Required fields
are collection time/completeness; current/all-version/noncurrent object bytes;
version IDs, sizes, storage classes and retention classification; latest
encrypted DB/config object bytes; actual daily/weekly/monthly/protected/local
retention and quarantine; archive/attachment distinctions and disk availability.
Current `byStorageClass` summarizes CURRENT objects only, while
`allVersionBytes` sums versions: do not use the former to price all versions.
ETag+size duplicate candidates are not content/reference-proven deletion
candidates. Existing capacity.py envelopes assume unchanged backup sizes and
are not measured invoices. Actual rates/discounts/retention occupancy remain
unknown. No new inventory/cleanup or monitoring platform was created.

## Final comparison and pending dependencies

This is a bounded baseline and a local candidate, not final optimized-main
benefit. A owns integration, CI registration, merge order and release preparation.
Mother DOT must coordinate this one-entry candidate before final integration;
the baseline must not imply A's five drafts are merged or qualified.

For final O13, compare exact candidate source/locks/schema/flags/fixture/tool
inputs, actual build identity, hardware limits and worker participation. Reuse
these observations when their consumed inputs remain unchanged. Only changed
query/reader consumers invalidate this slice. Do not rerun the old 14+9 or
20-FINAL suites to populate a table. The still-missing comparable observations
are bounded cold/warm actual course opening/response access, request errors and
query/transport bytes, draft-save latency, retained report-read wait, and a
representative sustained isolated load with durable completion/queue-drain,
CPU/RSS and pool waits together. Report queue growth separately from ACK; no
production load and no four-entry×all-tool Cartesian sweep.

No final O12/O13 completion checkmark, formal CI, Ready, merge or deployment is
claimed.
