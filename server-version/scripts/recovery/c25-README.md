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
B/C child-final has NOT_RECEIVED whole status. Exact original FINAL bodies are
retained only in the private fixture and replayed again after parent completion
in both closed and open windows; accepted facts/jobs/checkpoints must not change.
A also replays its original whole body after completion and compares all durable
receipt fields (the actual receipt API generates `committedAt` at read time). Partial report is authenticated
`?partial=1`; public routes do not implement that query. Native routes and
teacher/export permissions follow actual auth/public availability, with a fresh
synthetic ADMIN for formal SJT approval. No invented public Scale/SJT-history route.
A separate actual compiled-consumer PG probe observes its own Prisma SQL and
result-cipher decrypts, never labels them API-internal SQL. History proof covers
one legitimate B row and its projection/query shape, not dynamic N+1 scaling.

Planned phases: upgrade 600s; prepare 300s; scheduled 600s; guards 300s;
consumer evidence finalization 300s; nonempty restore 600s. Each baseline,
post-phase preservation and final audit has its own aggregate 300-second tracked
child deadline. API lifetime has an independent fixed monotonic 2,700-second deadline, armed
with a process interrupt so audits or synchronous binding work cannot postpone
it. Expiry stops active writer groups, fails the attempt and never restarts API.
API stops normally immediately after the scheduled phase (the last HTTP-dependent
phase), before its preservation audit and the DB-only guards/file-only consumer
finalization/restore. This prevents the product's separate one-hour cleanup timer
from touching historical expired checkpoints even when background workers are
disabled. Completion requires that planned stop and a non-expired lifetime.
Writers stop before the final snapshot; PostgreSQL stops even if
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
The launcher and every DB audit/phase use the same absolute `sys.executable`;
its actual path, resolved path, SHA-256 and version are frozen and rechecked.
The launcher rechecks a coherent reviewed build+client+source snapshot immediately
before and after binding, including expected HEAD and clean inputs, before clone.
The prepared producer/launcher still await immutable independent review and execution approval.
Producer outputs must be new direct children of `c25-build-evidence`; runtime
state must be a new direct child of the scratch root named `eduk12_c25_http_NN`.
These restrictions, symlink rejection, real Git discovery and protected source/
evidence/tools checks run before mkdir/clone. Descriptor issuance also uses a new
direct child of that same verified C25 evidence root; never choose an old source,
failed-attempt or historical evidence directory as its parent.

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
  is erased. The first failed runner did not persist `inputs-after`; no complete
  first-run after closure is claimed. Its two previous sources were reconstructed
  later and matched their recorded input SHA exactly, with an explicitly labelled
  reconstruction receipt and exact diff; this only supports unaffected-test reuse.
  Raw logs, journals, source manifests and credentials stay out of Git.


## Second-batch targeted preparation evidence

All paths below are under the private `c25-build-evidence/` sibling of the repo;
no runtime, producer, database or browser was invoked by these tests.

- `http-contract-01/`: 10 pure HTTP/window/terminal/redaction contracts;
  receipt `af69f4a98ddd7e5d12aa69b93f097b7de62c72257ad83b1768dac4b1ac3eb431`.
- `http-contract-02/`: only the added post-terminal original-body/fact-preservation
  source contract and changed phase syntax, not the prior 10; receipt
  `811c2b011c9cdb8424686ddc446b578ae6b923888cbf6c0bbfd3615623df52a8`.
- `producer-contract-01/`: 17 new dual-artifact and actual launcher-binding
  mutation tests; receipt
  `31433a20a3ec420359fb047d64a73a192838c4cb642b92b52a1cfc9bd3061d7f`.
- Source inspection found the new client receipt also binds `tsconfig.json`.
  `producer-contract-02/` runs only the added four-input positive/missing/mutation
  test, not the previous 17; receipt
  `a9e5045705fd1119459ebffa479deb9ce33dd434d507d4891bd36bbc8b98dce5`.
- `producer-contract-03/` runs only the new dedicated-destination boundary test
  (old HTTP03/C21/failed evidence/tools/repo paths, existing/nested targets and
  aliases rejected) and parses the changed launcher/producer syntax;
  receipt `f3d3a8361354c7581c3958b8dc65e9ff4a6caf1a8ee460ecae2a420e166e69d9`.
- `consumer-contract-01/`: 13 new transparent-decrypt, actual-SQL-observation
  acceptance, clock/window, immutable-identity and hash-linked aggregation fault
  tests; also syntax-only parsing of not-yet-executed phase/launcher scripts.
  Receipt `8f9ddf747d561058ba1e0f58bdb25a7668a7ccbd605b06e21c21948ed5c2d69c`.

- `producer-contract-04/`: Python interpreter drift, independent API lifetime and
  affected completion checks: four passed; one newly added fake-process test
  failed because its synthetic status omitted `state`. No service was started.
  Failed receipt is retained:
  `063888b5acf6089885d425c36da3728be096065bc853e8c045bc1cdba161aafe`.
- `producer-contract-05/`: only that test reran after adding the missing fixture
  field and passed, with no runtime/production change. Receipt:
  `a0734c0fa87acf743cd0b4ab63825a0ca809a5fecbf754d7f39b2a9d85d40561`.
  Both attempts retain exact input copies and equal before/after inventories;
  the four unaffected successful checks were not rerun.

The earlier README/hand-off count of 14 consumer tests was incorrect: the raw
TAP and frozen test file contain **13**, as reported above; no test was added or
rerun to change that count.

These successful receipts bind equal before/after inputs. Later targeted receipts
retain exact consumed source copies; unchanged prior checks are not replayed.
The consumer records actual production results/SQL only when later authorized;
its pure synthetic tests are never reported as dynamic query/decrypt evidence.
Finalization accepts scheduled-phase hash references to both separate child
results and their private raw observations, revalidates their proofs without
connecting to a database, and refuses missing/tampered/cross-input evidence.

## Command sequence after the corresponding approval

Freeze every C25 helper first. Descriptor issuance is read-only to the accepted
source; its output belongs in the verified dedicated evidence root. Issuance owns
the measurement lock itself. Do not hold a second outer flock around it.

```sh
python3 server-version/scripts/recovery/c25-source.py issue \
  --tools "$TOOLS" --expected-head "$HEAD" \
  --source "$SCRATCH/eduk12_c23_http_03" \
  --output "$SCRATCH/c25-build-evidence/source-01"
```

After independent source/descriptor review and separate producer GO, backend
producer runs current-client verification once followed by one fresh emit;
frontend consumes its exact receipt and emits once. Do not run these preparation
commands before approval. Both own the same measurement lock.

```sh
python3 server-version/scripts/recovery/c25-produce.py --kind backend \
  --tools "$TOOLS" --descriptor "$DESCRIPTOR" \
  --expected-descriptor-sha256 "$DESCRIPTOR_SHA" --expected-head "$HEAD" \
  --output "$SCRATCH/c25-build-evidence/backend-01"
python3 server-version/scripts/recovery/c25-produce.py --kind frontend \
  --tools "$TOOLS" --descriptor "$DESCRIPTOR" \
  --expected-descriptor-sha256 "$DESCRIPTOR_SHA" --expected-head "$HEAD" \
  --client-receipt "$CLIENT_RECEIPT" --expected-client-receipt-sha256 "$CLIENT_SHA" \
  --output "$SCRATCH/c25-build-evidence/frontend-01"
```

After producer review and separate runtime GO, one persistent exec namespace
runs the launcher through restore. A preflight-only call is not qualification;
the real run repeats the coherent checks under its own uninterrupted lock.

```sh
python3 server-version/scripts/recovery/c25-http.py \
  --tools "$TOOLS" --descriptor "$DESCRIPTOR" --expected-descriptor-sha256 "$DESCRIPTOR_SHA" \
  --expected-head "$HEAD" --state "$SCRATCH/eduk12_c25_http_01" \
  --backend-receipt "$BACKEND_RECEIPT" --expected-backend-receipt-sha256 "$BACKEND_SHA" \
  --frontend-receipt "$FRONTEND_RECEIPT" --expected-frontend-receipt-sha256 "$FRONTEND_SHA" \
  --through restore
```

No command uploads private files, starts CI, pushes, merges or touches production.

## Remaining C25 release work

These core scripts do not close C19 missing-only checks: suppressed analysis,
exact long-CSV cells/headers and selected-video capability/hash/range denial.
Those need their own reviewed minimal supplement, not a replay of C19 suites.
Browser native IndexedDB/WebLocks lifecycle, C24 focus/interaction acceptance,
and real selected-video playback remain open; DTO metadata is not browser proof.
The previous browser startup restriction remains reported until an authorized
working browser is available. No capacity/throughput conclusion is supported.
