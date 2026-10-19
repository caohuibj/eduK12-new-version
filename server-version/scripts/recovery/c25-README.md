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
- `producer-contract-06/`: one new cleanup-entry alarm fault passed. It executes
  the actual launcher cleanup with fake processes, injects a pending alarm both
  before and at the deadline, and verifies API-first bounded writer shutdown,
  PostgreSQL shutdown despite failed final audit, expired failure preservation
  and no restart. Cleanup ignores then cancels the run alarm before any waits;
  synchronous expiry handling cannot throw past PostgreSQL shutdown. Receipt:
  `2f9388a77a3a4b5cf2fe52304e4e02de2efabb5412bc8eca1ecd437d8b0b1ce7`.
  Earlier successful checks were not replayed; no service was started.

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

The first core attempt, `eduk12_c25_http_01`, remains **overall false**. Its
upgrade and immediate/A preparation passed; scheduled stopped before its first
completed check because the anonymous-token fixture recomputed `now + 1h`,
74.480 seconds later than the already-published assessment expiry. The API
correctly returned 400. Guards, consumer finalization and restore did not run.
All services stopped cleanly; final audit retained all 6,529 original rows and
16 historical checkpoints. Failed runtime receipt:
`8f7f0697582519c4032a1726e71fb2bd3879c7f81afea54e36d76d6c07c50eff`.
Read-only diagnosis index `c25-build-evidence/runtime-01-diagnosis/receipt.json`:
`e0698268911302522543bb1cb78beaef79bd2266bc506e5475c9e17373138427`.

The fixture now sends the exact published `p.expiresAt`. Only the new targeted
test ran: it calls actual `startAnonymous` with mock transports for bound and
unbound rounds, immediately and after a 74.480-second simulated delay, asserting
the unchanged publication expiry and normal token/start flow. Raw evidence is
`http-contract-03/`, receipt
`1a1696e584c040403d0cd078eb9369b518d83d14c024361d54cf462d03c5a33b`.
No product, Python helper, client or build changed; no runtime retry occurred.
Any controlled continuation requires its own reviewed contract and explicit GO;
the command examples below do not authorize overwriting or restarting HTTP01.

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

## Explicit continuation preparation (separate approval required)

The continuation is a new run identity, not a rewrite or resumption of HTTP01's
failed receipt. It reuses the stopped, owned HTTP01 database only after a
separately approved complete reversible archive. The old `overall=false`, raw
journals, fixture, snapshots, receipts and every other nondata byte remain at
their original paths. Only the three explicitly approved data roots `pgdata`,
`uploads` and `exports` may acquire new runtime bytes. HTTP03 and C21 remain
read-only accepted sources.

`c25-continuation.mjs` embeds its exact Python program rather than modifying any
of the 72 Python helpers consumed by the reviewed client receipt. Its frozen
binding includes all tracked recovery source, all embedded programs, the actual
Python realpath/SHA/version, existing helper closure, Node/PostgreSQL/Redis
executables and libraries, component inputs/dependencies/generated client/dist,
and the exact dual producer/client/source/recovery receipt references. Build
reuse is limited to committed C25 harness changes under the unchanged validator;
no emit or Prisma generation is needed for this adapter. The new frozen HEAD
still needs a freshly issued HTTP03 descriptor: source-03 retains its historical
7f49852a identity and must not bypass the strict current-HEAD assertion.

The prior passing upgrade and prepare/A results are inherited by exact SHA:

- upgrade: `baaa49cbab8351e5da7930667a127746743afb0284695be8e0caf38f8349011f`
- prepare/A: `e2fac92a430680d0e671df6d890a3ef41b1b3cc2bfb57d5301aa4cbbbb4fc001`
- failed final snapshot: `4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1`

The new receipt lists inherited versus newly executed phases separately. It
never repeats migration, A FINAL/replay or A drain. Its independent evidence
root must be a new direct sibling `eduk12_c25_continuation_NN`, not nested inside
any accepted source, old failure, tool directory, evidence root or Git worktree.

### Recovery point and resource contract

The separately approved archive command is `c25-continuation-archive.mjs`, with
an absolute `--python`, exact HTTP01 source and exact new destination
`/tmp/c25-continuation-recovery-01`. It owns the measurement lock and has a
600-second aggregate deadline (archive child 300 seconds, extraction 180 seconds,
integrity 60 seconds). All child groups are killed/reaped on timeout or resource
failure. A 1 GiB hard archive size bound and conservative extraction allocation
are checked before writing. Archive and verification extraction coexist in the
independent `/tmp` tmpfs, with at least 512 MiB free there and 2 GiB MemAvailable;
tmpfs use is included in the memory budget. Workspace admission remains
8 GiB + 512 MiB, with the unchanged 8 GiB runtime floor.

The archive preserves every data path, file byte/SHA, type, mode, owner/group,
mtime to nanoseconds, xattr and ACL. Current zero-link topology is explicitly
validated; any symlink, hardlink, special file, foreign owner or nested mount
rejects issuance. Full extraction into a new private directory must match every
entry and stopped PostgreSQL control output, then files/manifests/receipt and
recovery descriptor are fsynced. Only that newly created verified extraction is
removed; original raw data is retained. Archive failure material remains private,
and no failed/partial descriptor can authorize continuation.

The retained archive is a **node-local temporary recovery point**, not a durable
backup: `/tmp` is tmpfs and is lost on host restart. The compressed archive and
metadata stay throughout the run. Restoring it requires separate authorization,
stopped writers and extraction to a fresh directory; never overwrite data in
place. Nondata evidence is protected by a complete manifest whose traversal
prunes the three mutable roots before hashing, including while PostgreSQL runs.

Before creating the new working evidence or starting services, the locked
launcher rechecks the recovery point, HTTP03 full stopped manifest, current
inputs and workspace >= 8 GiB + 512 MiB. Planning allows <= 300 MiB new workspace
peak, including one original 52 MB row-evidence copy, one approximately 53 MB
failed-run full-row baseline and restore/dump outputs. Per-phase row baselines
are not copied repeatedly. This estimate does not replace sampled floors or
promise completion with narrow headroom.

### New work and dual full-row preservation

The first read-only database operation requires the complete live 217-table
snapshot to equal the pinned failed final snapshot, then captures all current
columns and all **6,582 rows / 17 checkpoints** once. Both immediate startup
receipt-cleanup tables must have zero rows; otherwise API startup is forbidden.
The original **6,529 rows / 16 checkpoints** evidence is copied byte-for-byte and
remains a separate protection layer. All old rows, including A, old published
scheduled policy, partial old B, jobs, accepted snapshots, checkpoints and shared
queue singleton, must remain present as full logical-row multisets after each
phase and at finalization. There are no table/column exemptions, global cleanup
calls or HTTP reads of old checkpoints.

The new fixture retains A and actor/course identities but removes old B and the
old scheduled publication from only the new fixture manifest. It prepares one
new scheduled publication and new B/C/D with a new T0. The fixed replacement SJT
uses the same synthetic scientific template and teacher-owned image asset,
creates a new instrument identity through the formal draft/review/admin-publish
APIs, and creates a new release-specific DISTRIBUTE grant for the existing
synthetic teacher/course. All release/hash/grant values come from real API
responses. Old release/grant/asset rows are read-only and compared before/after;
only new draft rows may transition. No old grant extension, old-release regrant,
clock change or expiry-dependent fallback is permitted. New grant admission
requires at least 1,200 seconds on the actual PostgreSQL clock.

New phases, each with an aggregate process-group deadline:

1. continuation-prepare: 300 seconds, new fixture and formal SJT resource only;
2. scheduled: 600 seconds, original T0+300 natural release contract, shared
   B/C drain, 180-second submission/drain and 60-second closed matrix budgets,
   all closed responses before T0+240; real closed/open consumer observations;
3. guards: 300 seconds, original restricted-role rollback cases;
4. consumers: 300 seconds, finalize actual scheduled consumer evidence;
5. restore: 600 seconds, unchanged full C25 restore plus exact full-row equality
   of every current row and retention of both old baselines.

Baseline/preservation/final audits each have an independent 300-second aggregate
child deadline. API has the unchanged independent 2,700-second hard lifetime,
including synchronous audits/binding waits. It starts once and stops normally
immediately after scheduled, before later audit/guard/restore work. Cleanup first
ignores/cancels its alarm, then bounded API-first writer shutdown, bounded final
read-only audit and PostgreSQL shutdown in `finally`. Failed/timeout snapshots
cannot become PASS. The independent result is
`c25-continuation-result.json`; HTTP01 remains overall false even if this later
continuation passes.

Preparation evidence is private under `c25-build-evidence/`:
`continuation-contract-01` ran 28 Node tests (27 passed, one positive test fixture
omitted the required `--python` flag) plus seven passing inline Python archive
contracts. Its complete input copies and equal before/after closure are retained;
receipt `67d6241cb1bbb4eec7252903ab404674fdd07655d924204cf2a0393ac87341af`.
Only that test argv was corrected. `continuation-contract-02` reran that one
previously failed check and passed, receipt
`f275583c318e517b43917bacf13f591502b7bebcf3696042ad453216697e8f0d`.
The other 27 Node checks and seven Python checks were not replayed. Both attempts
verified the existing client's exact 72-file Python closure unchanged. Neither
attempt created an archive or ran a database, application service or producer.

The first separately approved archive attempt stopped before creating its
output directory or running compression/extraction: the official installed Node
has exactly two package hardlinks, whereas the initial generic evidence binding
required one link. The private failure receipt is
`/tmp/c25-continuation-archive-launch-01/receipt.json`, SHA
`0cb82a39304affd43978541e439b4e73191310a314fdb35ae83650e817edbd28`.
No service started and the old raw state was not modified.

The tool-only fix binds canonical/realpath, device/inode, uid/gid, mode, size,
full SHA and exact nlink. Only the two explicit installed Node paths may have
nlink=2, must share an inode, and must match all three original client/backend/
frontend receipt hashes. Data and private evidence still reject hardlinks. One
new targeted fault accepts that exact topology and rejects data aliases and
byte/inode/link-count drift; receipt `continuation-contract-03/receipt.json`,
SHA `3aed1d8c16505056247e6684c30193bd329d90378553bbc1f87bd3d6f8e7b956`.
Earlier successful checks were not replayed. The subsequently approved single
archive retry is recorded below.

After this fix is frozen and reviewed, the newly approved descriptor destination
is `/tmp/c25-source-05`, using the unchanged issuer and validator with their full
normal manifests. Existing `destination_path` accepts this independent new
non-Git path without any whitelist change; all original source/tool/old-evidence
protections still apply. This costs approximately 14 MB of independent tmpfs,
not overlay admission reserve. It is node-local temporary evidence and must
remain with the recovery point throughout continuation. Existing descriptors
01–04 retain their exact original identities and bytes. No alternate descriptor
format, historical HEAD rebinding, shared manifest alias or validator exception
is introduced.

Prepared commands, only after the corresponding explicit approval. `$PYTHON`
must be the exact Python command path consumed by the reviewed backend producer
(`/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3`),
not merely another alias to the same executable; existing exact argv checks stay
unchanged:

```sh
"$NODE" server-version/scripts/recovery/c25-continuation-archive.mjs \
  --python "$PYTHON" --tools "$TOOLS" --failure-state "$SCRATCH/eduk12_c25_http_01" \
  --output /tmp/c25-continuation-recovery-01 --expected-head "$HEAD" \
  --descriptor "$DESCRIPTOR" --expected-descriptor-sha256 "$DESCRIPTOR_SHA"
"$NODE" server-version/scripts/recovery/c25-continuation.mjs \
  --python "$PYTHON" --tools "$TOOLS" --failure-state "$SCRATCH/eduk12_c25_http_01" \
  --state "$SCRATCH/eduk12_c25_continuation_01" --expected-head "$HEAD" \
  --descriptor "$DESCRIPTOR" --expected-descriptor-sha256 "$DESCRIPTOR_SHA" \
  --recovery-descriptor "$RECOVERY_DESCRIPTOR" --expected-recovery-sha256 "$RECOVERY_SHA" \
  --backend-receipt "$BACKEND_RECEIPT" --expected-backend-receipt-sha256 "$BACKEND_SHA" \
  --frontend-receipt "$FRONTEND_RECEIPT" --expected-frontend-receipt-sha256 "$FRONTEND_SHA"
```

Pure fault tests are preparation evidence only; neither these commands nor this
document authorize archive creation, database startup or qualification.

### Executed continuation 01 and nullable-context correction

At clean `77369f280e42032222d00524c8522c92dff5e22a`, the ordinary source05
descriptor was issued under `/tmp/c25-source-05` with SHA
`401d08907740da6574b316de26d72db8a78245c456e6375288e86eb1a32c25f7`.
Its full HTTP03 manifests retain the prior exact bytes. The separately approved
archive retry completed full extraction and bytes/metadata comparison in
64.46 seconds. Recovery descriptor SHA
`3c312d06aa1d967584ada480a35fd6eacb13a3a6ed4d520ae25fe3abf239ae3d`,
archive receipt SHA
`6b91c32683de736ed00cdd142b464c7a9c4c8d4785860916311a73bd3ab22c58`,
and the 248,850,312-byte archive SHA
`01971f7679d20c3da9cacb2a673f6629ba57160c5db6590ff766e438d38133f8`
remain under `/tmp/c25-continuation-recovery-01`. All 21,546 source entries had
empty xattrs and no extended ACLs. GNU tar reported basic/default ACL ENOTSUP on
tmpfs; restored modes and empty xattr inventories matched exactly. This does not
qualify restoration of nonempty ACLs. Original raw data was not removed, and
these recovery materials remain node-local temporary storage.

The authorized `eduk12_c25_continuation_01` then stopped **overall false**:
receipt SHA `16293c2c79b377c36fe665e260d8f45c43941df89d003e7be993925905a50f08`.
Upgrade and immediate A were inherited, not repeated. New formal SJT resource/
grant preparation passed. B/C each accepted four typed FINALs and exact replays;
the one original shared drain observed both jobs PENDING/attemptCount 0/
budgetHeld true become READY/attemptCount 1/budgetHeld false, with COMPLETED
parents, four accepted snapshots each, checkpoint revision 5→6, saveCount 1
preserved, and payload/hash/expiry cleared. D saved without FINAL. The closed
HTTP matrix ran, but the independent compiled consumer rejected its fixture
before opening a database connection. Scheduled has **no overall PASS**, no
`closedFinishedAt`, and no successful compiled closed observation. Its separate
143-request journal and catch-time PostgreSQL observation at
`2026-10-19T10:27:39.104Z` may support only the actually completed HTTP subchecks;
neither natural opening nor the missing open/guards/consumer/restore work ran.

Cleanup and final full-row audit passed. All original 6,529 rows/16 checkpoints
and failed-run 6,582 rows/17 checkpoints survived without column exemptions.
The new stopped final has 6,651 rows/20 checkpoints, snapshot SHA
`cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf`.
API/Redis/PostgreSQL exited 0; the scheduled child exited 1. HTTP03, old failure
nondata evidence, recovery archive and input bindings remained unchanged.
Observed minimum workspace free was 9,014,710,272 bytes and MemAvailable was
6,540,275,712 bytes; these are safety observations, not capacity results.

The defect is consumer-only: real A/B/C/D all have an explicit null
`contextSnapshotHash`, which the nullable product schema and FINAL contract
permit. Fixture `retain` faithfully recorded it. The consumer incorrectly
required a 64-hex string at both immutable fixture and database-row validation.
Both now accept **explicit null or a 64-lowercase-hex hash**; missing/undefined,
empty and malformed values still fail, and database↔fixture exact equality is
unchanged. No hash is invented and no product/schema/helper/producer is changed.
Pre-probe exceptions now retain a mode-0600 original stack in the validated
private scratch state while public output remains redacted.

Only two new no-service faults ran: nullable fixture plus closed/open DB-binding
contract (including mismatches and malformed values), and actual CLI pre-probe
failure journaling/redaction. Both passed in 0.304 seconds with full input copies
and equal before/after closure; `/tmp/c25-consumer-null-contract-01/receipt.json`
SHA `36782fc40b41902478944ced814ac421c7829121e21684743242b3e53e30313d`, raw log
SHA `a3f6624967dc19bead73c2ef48422307809f9bbbda903d796236ce6ff8f17fff`.
An earlier wrapper indentation error happened before lock/test execution; its
original wrapper and honestly transcribed diagnostic are retained separately.
The old 13 consumer tests were not replayed. Future missing-only runtime work
needs its own reviewed receipt/adapter, protection of the new 6,651-row state,
and separate authorization; old false receipts cannot be rewritten as passed.

## Missing-only preparation after the second failure

The new `c25-missing-*` adapters keep both historical overall-false receipts.
They accept only exact, separately identified successful subchecks: HTTP01
upgrade/immediate A; continuation01 fixture preparation, eight child FINALs,
actual shared drain/replays, teacher CSV and its 81 closed-matrix requests within
143 recorded HTTP requests. The real catch-time PG bound remains separate;
missing `closedFinishedAt` and failed scheduled/consumer phases are not promoted.

The prepared execution scope is old B/C current-open reads and original A/B/C/D
OPEN-only compiled observations, then a distinct new E authenticated student and
Cognitive-only scheduled publication. E uses one 120-trial FINAL and one original
isolated report claim, a legal **empty** encrypted checkpoint envelope, and a
real T0+300-second release. Its history query is unfiltered and must contain
exactly E. E's own closed/open identity and result-cipher observer evidence are
paired; they never stand in for the missing old closed observation. No A HTTP
read, old FINAL, teacher export, or old checkpoint GET is replayed. B/C read
operations preserve their full accepted rows before/after.

Three protection layers remain mandatory: HTTP03 6,529 rows/16 checkpoints,
HTTP01 6,582/17, and continuation01 6,651/20. One new full-row baseline is captured;
the prior 6,582-row file is SHA-bound and read in place. Restore requires a
stopped API, no other source connection, a new restore database, the unchanged
73-ordinal/three-parser equivalence checks, original four-case fixtures,
historical NULLs, restricted-role verification and equality of every current
source/restored row including E. The original guard SQL body is exported without
changing its bytes; its old CLI still requires its original passed prerequisites.

Only 29 new no-service contracts ran, all passed (4.72 seconds); no old passing
suite was replayed. Evidence: `/tmp/c25-missing-foundation-01/receipt.json`, SHA
`70bfefcd0c69164a03df543088a2f107fd413675cbb7acfa2ddba819dcfbdadf`; raw log
`new-contract-tests.log`, SHA
`f5cf84c9206c741e49ce9d971e507c0efc559f9851ca75b398e6e88edf7cb613`.
Exact source copies and equal input before/after inventories are retained; all
72 Python helpers still match the accepted current-client receipt. The draft
archive/coordinator are explicitly excluded from this test result. This is
preparation evidence only. A newly frozen current descriptor and a fully verified
6,651-row filesystem recovery point must be reviewed before a separately approved
missing-only runtime; existing producer bytes are reused, not re-emitted.

### Missing-only coordinator and recovery-point gate

The separate `c25-missing.mjs` launcher accepts only new
`eduk12_c25_continuation_02` evidence, reuses the stopped mutable data roots under
HTTP01, and reads continuation01 evidence without changing it. It binds the
actual launcher Python, all source/helper/tool/client/compiler/dependency bytes,
both accepted producers, both false receipts and current source/recovery
descriptors before and after. A coherent accepted binding and the exact
6,651-row final snapshot are checked before API startup. Old assignment/checkin
receipt tables must still be empty because API startup cleanup is unconditional.

The five newly executed phases are `missing-open` (180s), `missing-probe` (600s),
`missing-consumers` finalization (60s), `missing-guards` (120s), and
`missing-restore` (600s). Baseline, each phase preservation and final audit each
have a separate 300s aggregate child deadline. The API stops immediately after
the E probe, before its preservation audit and restore; the independent 2,700s
API lifetime guard covers earlier audits/binding waits, allows no restart, and
cleanup ignores/cancels alarms before bounded API-first shutdown and final PG
shutdown. Consumer children inherit the owned phase process group.

`c25-missing-archive.mjs` prepares a new `/tmp/c25-missing-recovery-01` recovery
point only after a new current-HEAD HTTP03 descriptor is issued in a separate
`/tmp/c25-source-06` directory. It reuses the already reviewed archive primitives
without changing Python files. Its 600s aggregate deadline covers tar/gzip,
complete extraction, every file's content/metadata/xattr/ACL/link comparison,
PG control state and fsync. Both false-evidence roots and the historical source05
and continuation recovery files are captured and preserved. Raw data is retained;
only the newly created verification extraction may be removed after full success.
This tmpfs recovery point is node-local and temporary, not a durable backup.

Entry still requires workspace free ≥8GiB+512MiB, MemAvailable ≥2GiB and tmp free
≥512MiB plus archive/extraction coexistence budget. Runtime keeps the unchanged
8GiB/2GiB/512MiB floors. A single additional full-row baseline and one byte-exact
original-row copy consume the existing reserve; prior full-row evidence is read
in place. Archive and runtime each need separate authorization after review.
Only these prepared argv are intended (all SHA/HEAD values must be the independently
reviewed exact values, never placeholders at execution):

```text
NODE c25-missing-archive.mjs --python ABSOLUTE_PYTHON --tools TOOLS
  --output /tmp/c25-missing-recovery-01 --descriptor /tmp/c25-source-06/c25-source-descriptor.json
  --expected-head FROZEN_HEAD --expected-descriptor-sha256 SOURCE_SHA
NODE c25-missing.mjs --python ABSOLUTE_PYTHON --tools TOOLS
  --descriptor /tmp/c25-source-06/c25-source-descriptor.json --expected-descriptor-sha256 SOURCE_SHA
  --state SCRATCH/eduk12_c25_continuation_02 --expected-head FROZEN_HEAD
  --failure-state SCRATCH/eduk12_c25_http_01 --continuation-state SCRATCH/eduk12_c25_continuation_01
  --recovery-descriptor /tmp/c25-missing-recovery-01/c25-missing-recovery-descriptor.json
  --expected-recovery-sha256 RECOVERY_SHA
  --backend-receipt SCRATCH/c25-build-evidence/backend-01/backend-build.receipt.json
  --expected-backend-receipt-sha256 ffca85332844b7f9caeac3252119e1354c498e9de11e757c5763e525d2bf8d95
  --frontend-receipt SCRATCH/c25-build-evidence/frontend-01/frontend-build.receipt.json
  --expected-frontend-receipt-sha256 7064d220540d1faf8851cec0e6c8ba4151070a61163ed60bf8f5d895f0415f5a
```

Five additional new no-service archive/coordinator contracts passed in 0.810s,
with full input copies, equal before/after closure and the unchanged 72 Python
helper inventory. Receipt `/tmp/c25-missing-coordinator-01/receipt.json` SHA
`0723678084620dc35cd533b333ec408d42af46de9f34482a5da6a31768348409`;
raw `new-contract-tests.log` SHA
`36cd96da9dc4efccd90afaaedd6b29e7bd17ca7db75a9365c3562c9ac937f2ae`.
The earlier 29 contracts were not replayed. No new descriptor, archive, database,
HTTP runtime or producer was executed during this preparation. The old A
publication expiry does not enter its read-only compact feedback projection;
A HTTP admission/report work is not repeated and its dates remain unchanged.

## Remaining C25 release work

The bounded C19 suppressed-analysis / exact long-CSV supplement below has now
passed independent evidence review. Selected-video capability/hash/range denial,
native Training IndexedDB/Web Locks lifecycle, C24 browser interactions and
real selected-video playback remain open. DTO metadata and mock DOM results do
not substitute for these browser checks. The existing cloud Chromium was
controllable, but two browser-to-loopback attempts were refused; native IDB,
Web Locks, picker and visual checks did not run. A reachable, supported browser
or official CI environment is still required. No capacity conclusion is supported.

## C19 existing-job continuation preparation

The first C19 supplement remains failed: its overall receipt is
`efffe632f5d7f56db83b56dd41cfb10aa00e9903da356baf31af9a3b38530394`.
It accepted three attempts / four FINALs (31 successful HTTP responses), but
its report child stalled on the now-reproduced ESM top-level-await cycle.
The final database audit also failed on the reports budget row; no final
snapshot was retained. Old material files passed their separate audit. These
facts do not constitute analysis or CSV acceptance. Fix `929637f4` separates
the CLI entry; its seven real Node/no-service contracts are separate evidence.

Prepared `c25-analysis-resume-*` uses a new `eduk12_c25_analysis_02` evidence
directory and the same owned, stopped physical cluster. It inherits the three
attempts and four FINALs, submits none again, and calls the three original
report jobs once through original claim/process, followed only by the remaining
analysis/download and permission checks. Its independent overall receipt is
`c25-analysis-resume-overall-result.json`; the executed phase is
`analysis-resume`. The old 37-file failed evidence set is hash-pinned, including
the original false receipt, before-drain facts, and original full 6,667 rows.

Admission must first persist current full rows, schema/columns and snapshot
privately (0600, exclusive creation, fsync), then prove all 6,666 unaffected
original rows exact. The one original `reports` row must be exactly pending
0→3, independently explained by the three full frozen PENDING jobs, each
attemptCount=0/budgetHeld=true, and all 148 old jobs. The actual current row count
is observed at admission; it is not inferred from the absent failed final
snapshot. A single partial baseline is retained. Capture failures or semantic
failures retain their raw facts and a false audit receipt.

Preserve/final audits restore the entire original 6,667-row protection,
including reports pending=0 and the exact original 21 checkpoints. Every
partial-baseline row also remains exact except these source-derived columns
on the exact three new parent/job IDs:

- Parent: status, progress, completed_items, completed_at, total_time,
  last_saved_at, aggregate_input_hash, task_satisfaction,
  training_flow_path_encrypted. Completion values come from the four accepted
  snapshots; path hash is unchanged, and authenticated before/after path
  plaintext and canonical hashes must agree despite legitimate re-encryption.
- Job: status, claimed_revision, attempt_count, budget_held, next_attempt_at,
  report_encrypted, aggregate_input_hash,
  completed_at, updated_at. Final status READY, attemptCount=1 and released
  budget are mandatory. Lease/error fields remain exactly NULL across the
  baseline/final comparison. The four snapshots and Form/Scale accepted facts have
  no exceptions.
- Only the actual new report-manifest-referenced, authenticated layout
  templates and at most one course/teacher-bound CSV batch/artifact may append.
  Overall success separately requires exactly one downloaded 4×24 CSV proof.

The remaining phase has one aggregate 300s deadline, sharing the original
120s report and 60s export child limits; baseline/preserve/final audits each
have 300s and the old uploads/exports file-subset check has 60s. The API is
stopped immediately after the sole dependent phase and still has its independent
45-minute lifetime ceiling. PostgreSQL stops in finally even if either final
DB or materials protection fails. Original source/build/client/tool bindings,
72 unchanged Python helpers, lock and resource floors are retained. Entry
requires disk 8GiB+512MiB; the 512MiB buffer is consumable, while runtime disk
8GiB, memory 2GiB and tmp 512MiB remain hard floors.

The new archive adapter only prepares a separate
`/tmp/c25-analysis-resume-recovery-01` recovery point. It labels current logical
counts unknown, inherits accepted-core counts explicitly, preserves the failed
analysis and all earlier recovery/evidence, and uses the existing full metadata
roundtrip/fsync/600s contract. It does not overwrite the pre-failure 6,667-row
archive. Descriptor issuance, archive execution and continuation runtime each
still need approval after the frozen preparation review. No new full database
restore, threshold N=4/5, selected-video, browser or capacity claim is added.

New no-service preparation evidence: 23 contracts passed once in 12.223s;
`/tmp/c25-analysis-resume-08/receipt.json` SHA
`204bdf0960adb3afa0eeb8fc6899291b246d5b859ab249ba86a9584be76be8fc`,
raw `new-resume-contract-tests.log` SHA
`ed6110d3aa728c0412c91c7c58722eb3553e097fb1796db2615f28d315f0bab6`.
Its 229 inputs / 226 copies and equal before/after closure are retained; the
separate read-only frozen-failure contract also passed. Four additional compact
encoding contracts passed in 1.669s using the exact frozen production compact
codec/canonical modules, with synthetic values and no application services.
`/tmp/c25-analysis-resume-09/receipt.json` SHA
`e0a6d6d58777275f0f0e242bafc3d97a172232b914bfd70286813d10efb3410b`,
raw `new-compact-contract-tests.log` SHA
`f64980714f2d94df0f12bd0a6569d6cbfbcc939f3c09ed13f51b6443440e0271`.
Its 235 inputs / 232 copies are retained with equal before/after closure; all
four embedded Python programs compiled without execution. The earlier 23
contracts were not repeated. Both receipts verify the original 72 Python
helper bytes against the existing current-client receipt. The aggregate input
hash is computed by the original finalizer and authenticated across
parent/job/report; this adapter does not claim independent recomputation.
No new descriptor, archive, database, HTTP runtime, emit or restore ran in this
preparation. Raw/private evidence remains outside Git.

The resume archive also requires its newly captured full physical manifest to
match the already frozen failed-scene manifest exactly, before creating the
output directory or invoking tar. The fixed historical manifest SHA is
`25130fcbd3376031533e54e9d9ad7e1b8a6261e9590a891e44585b3035414415`;
its identity is rechecked after reading and recorded in both recovery receipt
and descriptor. Thus intervening additions, deletion, bytes or metadata drift
cannot silently become a new recovery baseline. Runtime descriptor validation
keeps this original binding while allowing only the subsequently authorized
mutable data roots to change. One new drift/read-race fault group and the
single affected descriptor contract passed; no other tests were repeated.
`/tmp/c25-analysis-resume-10/receipt.json` SHA
`5696d39b5009d82e031cd3f1d64493e9920a2337e1c082bc2a64acd7b1041e30`;
raw `physical-manifest-linkage-tests.log` SHA
`71a4e8f60786c5a38b74dac2157f2dad3c507b9ade535970cc6d4ea7c2174a62`.
The 230-input / 227-copy before/after closure and unchanged 72 Python helpers
are retained. This is preparation evidence; no actual archive ran.

## C19 remaining analysis / CSV acceptance (2026-10-19 UTC)

The separately authorized run used clean runtime HEAD
216027f248d9320d4825d5dea962ceaa50578052 on
work/training-c25-c19-supplement-20261019, with unchanged product, schema,
72 Python helpers and previously accepted client/backend/frontend producers.
The integration ref remains at 662075ca; its documentation differences are not
represented as runtime-tested inputs. This documentation-only commit is later
than the actual runtime HEAD.

Independent final evidence review accepted the limited
C25_C19_EXISTING_THREE_JOBS_REMAINING_ANALYSIS_CSV_COMPOSITION scope with no
remaining P1/P2. The original failed analysis_01 receipt above remains false,
including its failed queue-row audit and absent final snapshot. Existing three
attempts, four FINALs and the accepted core are inherited, not replayed. The new
analysis_02 phase created zero courses, publications, attempts or FINALs.
It drained exactly the three existing jobs once through the real claim/process
path and enqueued/executed one new export through the original task.

- Admission first saved complete private rows/schema/snapshot, then observed
  217 tables / 6,704 current rows. All original 6,666 unaffected rows were exact;
  the sole reports queue change pending=0→3 was explained by the three exact
  PENDING/count=0/budget-held jobs. All 148 older jobs were retained and isolated.
- The three jobs became READY/count=1/budget-released, and their parents became
  COMPLETED. Authenticated flow-path plaintext and canonical hash stayed equal
  across legitimate ciphertext re-encryption. Four accepted unit snapshots and
  all Form/Scale facts remained exact; only the documented parent/job columns
  changed. No independent recomputation of aggregateInputHash is claimed.
- Actual N=1 paired analysis suppressed its statistics/count domain. Legitimate
  manifest/source/quality metadata remained available. This does not dynamically
  qualify the N=4/5 threshold boundary.
- Twenty real HTTP requests returned 16×200, 3×404 and 1×403, including login;
  these are request counts, not 20 separate test cases. The four permission
  negatives were other-teacher analysis, artifact status and download, plus
  student analysis. The authorized teacher downloaded a 3,662-byte, 4×24 CSV;
  all 96 cells matched the independent oracle: MA=1, MB=0, SA=NOT_ASSIGNED,
  SB=NO_OBSERVATION, including exact attempt/measurement provenance. This is
  authorized row-level pseudonymized data, not absolute anonymity.
- Report/export child receipts record real argv/PID, close with code=0, no
  timeout or termination signal (about 1.889s / 2.201s respectively). Export
  passed the queued job's actual retry metadata into the original task. Redis
  remained waiting before/after: this proves the real task result and download,
  not Bull scheduler completion.
- Preserve/final audits both passed. All original 6,667 rows, including the
  queue restored exactly to pending=0, were retained without exemptions. The
  6,704-row partial baseline was protected by the explicit column contract.
  Final state: 217 tables / 6,708 rows / 21 checkpoints, with exactly two report
  layouts, one export batch and one artifact appended. All 36 older material
  files (7,288,316 bytes), their file metadata and six directories were retained;
  only directory mtime may change when adding a file.
- The API stopped after its dependent phase; all nine recorded processes and
  both report/export children exited successfully. Final read-only checks found
  recorded PIDs absent, ports closed, no postmaster PID, clean runtime HEAD and
  the measurement lock released. Original HTTP03, failed receipts and every
  retained recovery point remained unchanged. The new 6,708-row database was
  not subjected to a new full database restore; the earlier 6,667-row restore
  remains explicitly inherited.

Exact private evidence references (raw material is not committed):

- Overall eduk12_c25_analysis_02/c25-analysis-resume-overall-result.json SHA:
  7605c14677befe44709d66be4177a3e28944a79d49a40aade716073cdf2c27ac.
- Final DB snapshot **file SHA**:
  f4e761419f5faf4a84befef265b4edff45d49d5a1d16a89cc09d039b1eed34b4;
  its **normalized logical hash** is
  13a4c74414346816e9786ca2f12337af7ff8ff68b7fa8cce57b8d51112b91eb2.
- /tmp/c25-analysis-resume-runtime-launch-01/review-index.json SHA:
  4cc690eb2e4d0219d97743d501be0c1d3842c27326c1f00d6d7ad851c9e878a6,
  binding all 61 state files and seven launch files. Post-runtime stopping and
  reference check SHA:
  32af113aa069bc65f3f5d4d7c237bf4606b0fc2fc92f5e0bee8b62c8696ea4ec.
- Source08 descriptor SHA:
  307165c3e57b60f0dd5b737e4c846c701dce610b9d936913a8db1f4c3bd0cc7c;
  partial recovery descriptor SHA:
  c1ab1f0803a97bc0a140f408ea0b9948e1feaa241a347612eaa819ccf77b7a8f.
  Its 271,910,360-byte archive SHA is
  fbb6a36448235b50112b96cec206515525103247e75339b8dfe440a680fbb582.
  Full physical lineage matched the frozen failed manifest exactly; all 23,305
  data entries / 888,287,967 bytes were extracted and compared. Source xattrs
  were empty; 23,305 basic-ACL and 46 default-ACL ENOTSUP warnings are retained.
  This is a node-local temporary recovery point, not durable backup or proof of
  nontrivial ACL restoration. Its pre-run logical counts remained unknown until
  the actual admission audit; no count was retrospectively invented.

Locked entry disk was 9,204,518,912 B with the unchanged 8GiB+512MiB admission
requirement. The 512MiB entry buffer was consumable. Recorded runtime minima
were disk 8,999,563,264 B, available memory 5,429,190,656 B and tmp 3,065,589,760 B;
post-output disk was 8,999,424,000 B. Hard runtime floors remained disk 8GiB,
memory 2GiB and tmp 512MiB. Peak observed API RSS was 333,934,592 B. These are
resource guards for this local synthetic run, not CPU/throughput/capacity gains.
Further heavy execution requires a fresh resource gate and separate approval.

### Still-open minimal C25 browser/media work

1. Selected Training video: a formally admitted/reached SJT video fixture with
   authenticated/public access, actual selected bytes/hash and correct binding;
   HEAD, valid single-range 206 and invalid-range rejection; non-owner, wrong
   parent/epoch/hash and unreached/revoked access must fail. A real browser must
   load metadata, play and seek the native video/track. Existing generic media
   helpers can support this, but generic capability checks do not qualify the
   Training route binding.
2. Native Training Cognitive persistence: real IndexedDB reload, TTL cleanup
   across all three stores, two-tab active lease protection/release, tombstone
   preventing an old tab from reviving expired data, and sealed/retry/unrelated
   or legacy-history protection. The Survey browser architecture is reusable
   only after exact input review; Survey results are not Training acceptance.
3. C24 changed interactions: inbox/submission/checkin error focus and late
   response focus stability, real picker cancel/failure and PDF/preview focus
   return, keyboard use plus 390/1440 long-text/touch/contrast screenshots.
   Previously disclosed shared MediaRenderer keyboard access and course
   settings/analysis error-focus gaps need a separate scoped fix decision.

A reachable supported Playwright/official CI environment can run these missing
scenarios with exact product/helper/browser bindings and retained raw evidence,
without replaying the accepted core or this supplement. The current scripts and
CI routing do not already grant these new Training checks a pass. Native browser,
selected-video, dynamic N=4/5 and C26 measurement remain unaccepted; C25 as a whole
is not declared complete.


## C26 preparation: observation contracts only

This first C26 subset adds only `c25-c26-*` recovery tooling on the dedicated
C19 supplement branch. It does not start API/PG/Redis, connect to a database,
measure a business workload, issue a descriptor, or qualify A/B performance.
The 72 original Python helpers and existing product/dist/client/dependency
bytes are unchanged. Existing functional acceptance remains scoped above.

The planned A workload is exact: one newly authorized parent, one native FINAL
for each Form/Scale/Cognitive/SJT, one actual report job/drain invocation and
one queued export/task. It is not four whole-assessment submissions. The new
checkpoint is saved once; four serial recovery GETs and one two-read wave then
run before any FINAL. After the four FINALs, original report task and new export,
the other five categories each run four serial reads followed by one two-read
wave. Totals are 24 serial requests and six two-read waves (12 requests).
The categories are checkpoint recovery read, report status, full report,
Cognitive result-or-history, teacher analysis, and existing artifact download.
The driver fixes one route per category; actual fixture identities and authority
must still be frozen before execution;
setup/login/admission/native reads are separately counted, not hidden in those
36 read requests. Concurrent SQL belongs to the complete wave, not either
request. No automatic retries, extra FINALs or automatic B experiment are allowed.

`runtimeMetricLines()` resets the production event-loop histogram, so it is
not a read-only observation source. The test-only CommonJS preload instead
calls the original `recordPrismaSqlEvent` first, preserving receiver, arguments,
return value and thrown exception, then mirrors enabled finite nonnegative
SQL-event counts/durations. IPC snapshots read that mirror plus process CPU and
memory. No `/metrics`, metric reset, query text/parameters, inspector, GC,
product patch or extra database call is involved. It observes this frozen
Prisma event consumer only, not all database SQL. The original function remains
responsible for production metrics.

The preload pins the four actual compiled module hashes and requires installation
before runtime/database consumers load. It checks require-cache/module/export
identity, the actual database consumer's runtime child and Prisma registration
identity, PID/startTicks, environment, nonce and sequence. A different module,
captured/late reference, changed exports or incompatible ESM producer fails;
it is not silently treated as supported. Requiring the cached preload retains
the singleton; explicit duplicate install fails. Close is one-way and must follow
quiescence; any later SQL event emits an observation fault, without changing the
business return. A/B must use identical probe bytes/order/frequency. Mirror and
snapshot body CPU/wall counters and IPC counts/bytes are separate overhead data;
serialization/sampling/ACK/exit tails remain in total process cost and must not
be silently subtracted.

The service-free probe fixture loads the frozen production runtime and actual
`database.js` query callback, replacing only Prisma construction/event-source I/O
and denying socket connections. It checks real callback events, repeat snapshots
without added SQL/reset, identity/late-load/close faults and exact exception
forwarding. These synthetic event tests do not prove actual PG query counts.

The process helper keys Linux observations by PID plus exact startTicks, references
shared physical accounts once, and separates API, dynamic report/export workers,
PG roles, Redis, driver and observer. Real synthetic Node children exercise
start/final resource sampling, identity/nonce ACK and successful close, plus
missing-tail/error/timeout rejection and owned process-group TERM/KILL/reap.
A terminal sample includes process startup through the final sample; subsequent
ACK/exit CPU is explicitly excluded. RSS is sampled and lifetime high-water data
is labeled as such. Role references overlap and cannot be added together.
Actual worker/API integration, the Linux process/socket reader, dedicated PG
connection adapter and aggregate coordinator remain to be implemented and
reviewed; these helpers do not establish capacity gains.

The proposed aggregate A budget remains 1,200s including setup/audits, with 60s
reserved for bounded cleanup, 30s idle and 60s tail, and child budgets at most
90s. Entry requires disk 8GiB plus a consumable 512MiB buffer; runtime floors
remain disk 8GiB, MemAvailable 2GiB and tmp 512MiB, API RSS strictly below 1GiB.
Uncertain or failed writes retain issued intent and stop without resubmission.
Preparation is capped at 2MiB new tools plus 8MiB private evidence. Targeted tests
run under the exclusive measurement lock with a 90s aggregate command limit.
No measurement database or future 1,200s run is authorized by this documentation.

The bounded child adapter also scans its verified owned PGID after the leader
closes. Any live descendant permanently fails the observation, even if subsequent
bounded group cleanup succeeds. Scan/permission/parse failures do not mean an
empty group. Cleanup records actual members and requires no live member before
settlement; retained Z/X entries are not falsely described as waitpid-reaped.
The scan shares the original aggregate deadline. The targeted descendant fault
uses real same-group processes and covers both normal and abnormal leader close.


### C26 next tool batch: inert transport, driver and PG observation contracts

The new modules still have no executable service entry. Their targeted tests
inject HTTP, SQL, process frames, timers and runtime boundaries; they do not
connect to PostgreSQL/Redis or start an application. Previously passed first-batch
checks are inherited under their original hashes rather than executed again.

The raw HTTP transport never calls `/metrics` and never automatically retries.
An issued write with an uncertain response permanently stops the workload. Two
reads use distinct journal entries and a common failure latch; both settle before
another window starts. The sole POST classified as a read is the exact frozen
Training analysis course route and selector-body hash. IPC requires the pinned
production preload's PID/startTicks, nonce, role, module bindings and monotonic
SQL/CPU counters. Missing/late/disconnected replies and journal failures stop the
coordinator; no zero-counter fallback is accepted.

The finite workload has one new parent and four native unit FINAL requests,
not four whole-parent submissions. Setup is recorded separately. Checkpoint
reads precede FINAL; all other category reads follow report/export completion.
There is no extra warmup, replay or second attempt. `cold` field names are retained
as ledger labels only: the claim is the first measured new chain, not cold OS,
PG buffers or application process. Per-category and phase latencies remain
separate; concurrent SQL is attributed to the whole two-request wave.

The teacher-analysis samples are an independent, read-only workload over the
accepted joint-restore A/B Scale waves. They are not an analysis of the new
four-tool parent. The coordinator must bind the real original teacher/course
permissions, two selectors, source hashes and complete rows, and protect those
old rows before/after. No old checkpoint is read, no old publication/grant/TTL
is changed, and no extra publication or FINAL is created for analysis. A later
optimization comparison must use exactly the same analysis selector and data.

The PG observer contract uses a dedicated read-only connection with autocommit
SELECTs, server statement timeout at most 200ms and `stats_fetch_consistency=none`.
It records 100ms process samples, 250ms PG activity/stat samples, before/operation
end/settled boundaries and at least 1100ms stats settlement, all within its one
aggregate window (at most 90s). Required SQL/permission/counter-reset failures
stop. `pg_stat_statements` is either explicitly required or explicitly marked
unsupported; required failures are never converted to unsupported. Observation
query counts/time/CPU and process-sampling costs are disclosed, not subtracted
from raw totals. Tuple counts are not SQL counts, query duration is not CPU,
and WAL/background costs remain cluster-wide, including the protected primary.

Every backend requires both its actual owning process/socket and matching
application name; PID/startTicks, physical cluster, postmaster and database must
match. Unknown or ambiguous clients, foreign-database activity, PID reuse,
missing required process data and sampling overruns stop. Dynamic report/export
closing uses an explicit preparation notification before permitting actual
cleanup/disconnect, then a bounded fresh PG check and identity-bound child
terminal/close/group-quiescence proof. Only the previously attributed worker's
exact retiring backend identities are considered; missing CPU is recorded as
unobserved, never zero-filled. The same window deadline remains in force and
cannot finish while retirement is pending. The real child lifecycle handshake
and process/socket adapter must consume this contract in the next reviewed batch.
