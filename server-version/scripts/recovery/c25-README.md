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

## Remaining C25 release work

These core scripts do not close C19 missing-only checks: suppressed analysis,
exact long-CSV cells/headers and selected-video capability/hash/range denial.
Those need their own reviewed minimal supplement, not a replay of C19 suites.
Browser native IndexedDB/WebLocks lifecycle, C24 focus/interaction acceptance,
and real selected-video playback remain open; DTO metadata is not browser proof.
The previous browser startup restriction remains reported until an authorized
working browser is available. No capacity/throughput conclusion is supported.
