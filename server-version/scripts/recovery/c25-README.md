# C25 joint recovery preparation

## Status and scope

This is a prepared C22-over-C23 local synthetic qualification, not a release,
browser, load, CPU or capacity result. Product candidate is integration
`15cbdf0cdfbdbe54eceaf3e5c335d907311b9ec3`; subsequent commits here add only C25
recovery tools/docs. Producer execution and runtime require their own reviewed,
frozen inputs and authorization. No C23 acceptance whitelist is widened.

Changed components → new descriptor, client verifier and migration/restore
adapter. These reject a stale source, mismatching generated-client/schema pair,
unreviewed migration, changed historical rows or weakened guards. The main check
location is the existing private cloud workspace, under the shared exclusive
`tools/.measurement.lock`. Only new pure fault tests run during preparation;
unchanged accepted C21/C23 tests are not replayed. Each preparation command has a
120-second bound; runtime phases and audit deadlines are listed below.

## Independent stopped source

The source is stopped `eduk12_c23_http_03`, not the original C21 pgdata.
Its accepted C23 receipt SHA-256 is
`c81cd9219d12abc1f591c84f877ec21155076546ac0027b9536f1231e67e3c1e`;
final snapshot is
`4dd59702b756e0d16cf9fe1c2b821118ba1aa5587f0408a9ccb8527d3d8a01e5`:
217 tables and 6,529 rows, including 16 checkpoints (7 payloads, 9 tombstones).
The original C23 functional/race/restore acceptance remains 198/48 assertions,
16 restored checkpoints and 6,382 preserved original C21 rows. Both earlier C23
failed attempts and their recoverable archives remain historical failures.

`c25-source.py issue` takes its own measurement lock and creates a new private
descriptor plus complete stopped-source and cloned-data manifests. It checks the
accepted receipt/snapshot, shutdown control state, absent postmaster/live recorded
processes/ports, all source bytes, relative paths, modes, uid/gid, nanosecond mtime,
file count/size, and all existing xattrs/ACLs. Symlinks, hardlinks, special files,
external tablespaces/configuration and an existing/nested destination are rejected.
An empty environment `.git` sentinel does not prove repository membership; bounded
Git discovery rejects actual repositories, malformed/nonempty markers and errors.
The descriptor binds current Python/helper bytes and HEAD; issue only after the
entire prepared helper closure is committed and frozen. Existing HTTP03 files
named `source-byte-manifest-*` describe C21 lineage and are never relabelled as
HTTP03's new manifest. Private runtime credentials are referenced by file hash,
not copied into public documentation.

## Exact current generated client

The candidate source schema SHA-256 is
`2a753ccecd230abc8f4d468cf8ccc7a5313b0bdc6ba25a59620076b9db6a072e`;
installed embedded schema is
`3d13a0c9584a9797360c725f42d376f35603f79ec7909990b7dd18d580e814d3`.
`c25-verify-client.py` accepts only that reviewed pair and five explicit local
attribute moves in CompositeAssessmentAccessToken, SituationalAttempt and three
ScaleDeploymentPolicy date fields. All string, generator/configuration, argument,
field-order and remaining tokens remain exact. It verifies inline schema, DMMF,
model/enum mappings, installed native engine, full dependency/client bytes,
compiler, Node/Python identities and consumed Python helper closure before/after.
This is **existing generated client current-byte consistency**, with no historical
generation provenance claim. It performs no Prisma generation. It has not yet
been executed for C25.

## C22-only database adapter

The sole added migration is
`20261019060000_training_feedback_release`, SHA-256
`c14fbc1105a2e21f8479fb632547d13af30f3e507ef38470e5379f7908c899e6`.
It adds two nullable JSON/hash pairs to existing composite parent/attempt tables,
the exact pair constraints and exact parent/attempt guards, and no table.
`c25-db.py` checks every old column/constraint/guard, exact migration ledger delta,
existing owner/runtime role privileges, historical feedback NULLs, and all old
rows including every checkpoint. It rechecks canonical upgraded schema before
preservation/final/restore comparisons. The existing 73-column/three-parser
restore normalization stays unchanged. The nonempty new fixture is identified by
an explicit four-case manifest; it cannot name old rows or omit the retained D
payload and A/B/C terminal tombstones. Restore uses a separate new C25 database.

Old checkpoint TTLs have elapsed or will elapse naturally. They are observed only
through read-only SQL; no old-attempt checkpoint GET, global cleanup or background
maintenance may mutate them. Runtime keeps background/heavy/video workers off and
async reports on. Only new fixtures use the original claim/process report helper,
with other jobs row-locked out, and no fabricated state/queue updates.

## Joint HTTP plan and deadlines

Four parents on two publications suffice: A authenticated/default IMMEDIATE,
one Scale with checkpoint; B authenticated and C public bound-round SCHEDULED,
each FORM + Scale + Cognitive + embedded SJT; D valid public unbound recovery
identity retains one payload without FINAL. B/C/D freeze both checkpoint and
localCognitive policies (1h). There are nine accepted unit FINALs in total.

A preparation is separate (300 seconds). Scheduled phase is independently bounded
at 600 seconds: all resources exist before publication; use actual server T0 and
releaseAt=T0+300s. B/C FINAL plus a **single combined 120-second drain** and D must
finish within 180s; closed outlets have at most 60s and every real response/server
clock must still be before T0+240s and releaseAt. Crossing a boundary cannot count
as a closed refusal. Observe natural opening without changing policy/time or
retrying a failed phase. Four accepted unit snapshots become three measurement
reports plus FORM background data. Actual parent/job/budget/claim-count/checkpoint
revision/saveCount and phase queue baseline are asserted before and after drain.

Whole positive receipt/replay belongs only to A's real submissionId + epoch;
B/C child-final has NOT_RECEIVED whole status. Partial report is authenticated
`?partial=1`; public routes do not implement that query. Native routes and
teacher/export permissions follow actual auth/public availability, with a fresh
synthetic ADMIN for formal SJT approval. No invented public Scale/SJT-history route.
A separate actual compiled-consumer PG probe observes its own Prisma SQL and
result-cipher decrypts, never labels them API-internal SQL. History proof covers
one legitimate B row and its projection/query shape, not dynamic N+1 scaling.

Planned phases: upgrade 600s; prepare 300s; scheduled 600s; guards 300s;
consumer evidence finalization 300s; nonempty restore 600s. Each baseline,
post-phase preservation and final audit has its own aggregate 300-second tracked
child deadline. Writers stop before the final snapshot; PostgreSQL stops even if
that snapshot fails, and overall PASS requires it. Phase failure is retained and
stops the attempt without automatic restart/continuation. Services and clients
must share one persistent execution namespace.

## Resource and producer gate

Official tools remain Node 24.21.0, PostgreSQL 16.15 and Redis 7.4.11.
At execution time, under the exclusive lock, require at least 8 GiB free **after**
the independently inventoried clone plus 512 MiB reserve, and at least 2 GiB
MemAvailable. During phases keep the 8 GiB floor and API RSS below 1 GiB. Record
actual minima and phase samples; these are run protection, not performance gains.

The prepared producer contract requires one fresh backend emit and one fresh
frontend emit with the same current-client verification receipt. Old dist, if
present, must be retained via recoverable same-filesystem rename. Bind exact
current source/helper/config/environment/dependency/client/compiler/tool bytes
before and after; missing/failed final producer results cannot qualify artifacts.
The launcher rechecks a coherent reviewed build+client+source snapshot immediately
before and after binding, including expected HEAD and clean inputs, before clone.
Current source, producer and launcher still await immutable independent review.

## New foundation tests and retained evidence

Only new no-service tests ran under the measurement lock:
- First attempt: 17 source/client tests, 15 passed and 2 failed because empty
  environment `.git` sentinels were incorrectly treated as worktrees. No DB tests
  ran. Failure receipt is retained, SHA-256
  `e50ff475c3bffae9d2d4498956f098d4ee6025d1ad070b9db1b08d79f2d249d9`.
- Affected-only second attempt: 3 source tests passed (the two failures plus an
  issuance fault test strengthened to prove its intended branch); 21 new DB
  adapter mutation tests passed. No old suite or application check ran.
  Receipt SHA-256
  `b96ba72dd98d377d1e6cd1152159d33ce545b2c8962d9bcd0e36f785044397c1`.
- Raw private paths are `c25-build-evidence/foundation-01/` and `foundation-02/`
  outside the product repository. Second receipt binds equal full Python/schema/
  migration/tool input inventories. The first attempt's 14 unaffected passes
  plus the three affected passes cover the 17 source tests; no source test failure
  is erased. Raw logs, journals, source manifests and credentials stay out of Git.

## Remaining C25 release work

These core scripts do not close C19 missing-only checks: suppressed analysis,
exact long-CSV cells/headers and selected-video capability/hash/range denial.
Those need their own reviewed minimal supplement, not a replay of C19 suites.
Browser native IndexedDB/WebLocks lifecycle, C24 focus/interaction acceptance,
and real selected-video playback remain open; DTO metadata is not browser proof.
The previous browser startup restriction remains reported until an authorized
working browser is available. No capacity/throughput conclusion is supported.
