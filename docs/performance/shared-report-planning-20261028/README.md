# Four-entry current-main observations and shared report planner follow-up

Base: `642fda7ab754790686d6626efac62b73a332e663`. This follows the V2 roadmap;
it does not replace historical d01/31d9 or earlier four-entry observations.
No production service, configuration, data or deployment was changed.

## Remaining roadmap scope

Existing Teacher cognitive/SJT/bundle runtime adapters, education disclosure and
opening rules, source/P/R pagination, current-unit/receipt, compact facts and
shared templates are not rebuilt. Still open: comparable user-visible cold/warm
waiting, authorized synchronous inline feedback, measured duplicate work,
physical/WAL/backup/COS amortization and sustained distinct-user capacity.
Native content integration is independent PR368; ordinary framework support is
not proof that every native task is usable at all four entries.

## Current observations, not a capacity benchmark

The existing bounded probes were reused against current main in new task-owned
PG17.11/Redis8.0.2 instances, restricted runtime role, no production data or
network. All original observations and exact scope remain in evidence.

- Survey: three workloads, each PROCESS_FIRST/PROCESS_WARM, actual HTTP FINAL,
  lost-response replay and persisted-fact checks. FINAL ranged 26.6–85.7 ms.
  Warm samples were not uniformly faster; they are retained without repeated
  sampling to get prettier numbers. GENERAL_ONLY already uses inline receipt;
  the probe's extra general GET is not a universal product inefficiency.
- Training: prepared two-scale whole fixture, real HTTP ACK/replay, real manually
  claimed worker, READY and authorized report. ACK 28.5/11.1 ms; worker
  245.6/47.5 ms; report GET 8.6/6.1 ms. These are not actual scheduling/queue
  latency, publication/START, browser rendering, or sustained capacity.
- School/Teacher private Scale: actual service START/FINAL and authorized report
  HTTP. First/repeat report reads 69.2/42.3 and 44.3/40.5 ms. The combined service
  phase includes fixture verification reads and is not a single endpoint latency.

These protocols differ and must not be ranked as four equivalent workloads.
TS loader, same-process driver and warm database/OS caches are disclosed. No
p95/SLA or production throughput/monetary saving is inferred.

## Confirmed shared hotspot and minimal candidate

The newer multi-tool education report reader lacked the transaction-local
planning bound already used by the legacy Scale self-report reader. A separately
seeded accepted-FACT fixture measured the actual production report service:

| Entry/read | Base ms | Candidate ms | Base/candidate SQL |
|---|---:|---:|---:|
| School first |305.49|98.27|37/38|
| School repeat |267.00|60.66|37/38|
| Teacher first |257.04|61.89|37/38|
| Teacher repeat |251.16|59.54|37/38|

The candidate only adds `SET LOCAL join_collapse_limit = 1` inside the existing
transaction. Both current-authority reads, source rechecks, disclosure, timing,
canonical facts and report projection remain unchanged. There is no global
setting, permission cache, new queue, scoring replay or cross-request cache.
Survey/Training do not consume this particular education authorization SQL;
adding it there would be pointless. Both actual School/Teacher consumers are
covered together, without claiming the entire four-entry roadmap is complete.

An actual EXPLAIN ANALYZE of the same anchored authority SQL/parameters on one
synthetic School record gave default planning 105.697 ms / execution 1.311 ms;
transaction-local limit 1 gave planning 6.592 ms / execution 0.659 ms. Both
returned one row. This establishes the small-fixture planner search cost, not
large-data plan superiority or a universal percentage gain.

Candidate observations add outside-measurement SHOW/PID checks. Observed pooled
session settings were 8 before and after each call, same observed PID. Additional
School/Teacher probes retained metric value 10 and denied current REPORT_READ
revocation; the setting was again 8 afterward. Synthetic FINAL rows were prepared
by the existing report fixture: this qualifies report reading, not real new-tool
publication, START or FINAL. Response logical size stayed 783 bytes.

## Validation and evidence limits

- One changed orchestration test passed; 36 unrelated cases filtered and retained.
  It verifies the local setting precedes reads and both current authority checks
  still execute. The existing mock adds only the new execute sink.
- Exact staged backend tree typecheck exited 0; original argv/timing/log hash and
  pre-run component tree are in its receipt. No new frontend/API contract/schema.
- PG observations, query plans and two-product current revocation checks are
  real local PG17, not Actions PG16 or a full HTTP/browser qualification.
- Initial raw-schema byte check stopped before launching services. Official
  Prisma formatting on an isolated copy showed only formatting/directive order
  and two comments differed from installed schema; semantic token stream matched.
  Optional @prisma/internals was absent. Product schema/client were not changed.
- Diagnostics and failures are not overwritten. No formal CI, Ready, merge,
  application build, deployment or full-platform validation has occurred.

Next: independently freeze this tiny product change and its actual evidence,
select only the necessary current source/SAST/admission checks, and keep broader
storage/concurrency and true browser timing separate. Do not revive the old
PR361 exact binding or silently trigger its old full build/database replay.
