# Analysis-only ABBA preparation

This is test scaffolding, not a platform runtime change or a completed performance
experiment. A remains the immutable `c41cabef` source/artifact. B's separate
`394731e6` producer was built once. The physical recovery descriptor still says
`BProductEmitted=false`; the later B receipt is a separate required input.

## Small batch 1: artifact selection and fixed algorithm

* `analysis-artifacts.cjs` pins the historical A manifest, independent B receipt
  and complete emitted inventory, and the current physical recovery descriptor.
  The outer runtime must additionally run the original recovery consumer,
  current-harness binding and full before/after input checks. Merely calling this
  selector does not perform those outer checks or create a source attestation.
* A and B use one explicit original dependency search root. Package symlinks
  into the accepted C20 install are validated against the original dependency
  receipt's exact realpath and SHA, rather than permitted by a broad prefix.
  Actual Node static `require.resolve` traversal verifies 49 packaged JSON
  resources without evaluating API/Prisma/queue code. Dynamic imports remain
  bounded by the complete immutable artifact, not claimed as statically resolved.
* Both arms use the same new analysis API/probe files, original backend cwd,
  explicit identical upload/export roots, and disabled Node compile-cache writes.
  No OS/business cache reset or GC is introduced. Startup cost stays separate.
* Four fresh API processes run A, B, B, A. Each has three warm-up responses,
  ten measured serial responses, and one measured simultaneous two-read pair.
  Each arm therefore has 20 formal serial responses and two pair windows;
  the complete run has 12 warm-ups plus 48 formal responses.
* The complete response.data oracle reconstructs the unsigned manifest and SHA using
  frozen selector/sources/dictionary/actor/authority. It changes only the cutoff
  and its recomputed manifest hash for comparison. All analysis/quality/metadata
  fields within data remain exact, including the small-N suppression contract. Historical
  A07 authority is explicitly pinned; current full baseline equality remains an
  independent prerequisite. Fixed-cutoff pure output is checked against both
  actual compiled artifacts, not two wrappers around B.
* The ABBA algorithm currently consumes bounded `openBlock/request/measure/
  closeBlock/stop` callbacks. The actual HTTP/PG bridge, one 6708/6719 baseline and
  final audit, negative authorization requests, outer 1200-second hard watchdog,
  material audit and durable final release publication are the next batch.
  `workloadComplete` alone cannot set `overallPassed`. Pair CPU/SQL is shared
  process cost, never divided into fictitious per-request observations.

## Exact thin-fork differences from the historical helpers

Historical helpers must remain byte-identical for the already issued recovery
consumer. They were not edited or recompiled.

* `analysis-api.mjs` differs from `c25-c26-api.mjs` only by the exported function
  name, an explicit arm argument and artifact/environment check, selection of the
  two analysis preload/leaf filenames, and additional artifact identity fields
  in the lifecycle receipt. Lifecycle, deadlines, IPC, signals and cleanup stay
  byte-identical otherwise.
* `analysis-api-child.mjs` adds the fixed artifact selector and imports its
  selected entry after the same ownership LOAD permission and cwd assertion.
* `analysis-probe.cjs` selects the fixed dist/dependency proof, replaces the two
  dist path constructions, and checks the arm/NODE_PATH/cache environment,
  pinned probe bytes and cwd. Its actual SQL callback wrapper, counters, IPC,
  singleton checks, snapshot/close semantics and CPU-tail limitation are unchanged.

These narrow copies can be unified in a later scaffolding-only maintenance batch.
That refactor is intentionally outside this evidence-bound preparation.

## New no-service evidence

`/tmp/c25-c26-analysis-abba-prepare-02` retains the first eight contracts: six
passed; two exposed an overly strict local dependency-prefix assumption.
`prepare-03` retains the two corrected contracts, both actually passed; its
wrapper remained false because it expected a skipped test that Node did not
include. `prepare-04` reran only the API boundary after denying network/listen
before the replacement hook; it passed with exact close/group proof and durable
lock-release evidence. The six and one unaffected successes were not rerun.
`prepare-01` failed before tests because the private launcher named the wrong
existing export. Its evidence was retained with that precise scope.

No database, business API, new fixture, FINAL, export, or ABBA measurement was
executed by this batch. PG coverage/lower bounds and observer overhead remain
separate from API self metrics; no performance improvement is asserted.

### Independent review correction

The original bad-identity test could catch its own expected-rejection assertion.
Only that actual compiled A/B pure contract is rechecked in prepare-05, requiring
the three exact product error codes and status 409; an accepting callback must
fail the test helper. The old raw and wrapper outcomes remain unchanged.

For prepare-02/03/04 the then-untracked eight new files had retained pre-run
copies matching the eventual Git blobs (with the documented later fixes), but
were absent from the tracked-only before/after inventory. Do not claim historical
post-run hashes for those new files. Prepare-05 explicitly binds all eight files
before and after; it does not retroactively recreate the old measurements.

The real HTTP bridge must separately retain and check HTTP status, code, message,
and the exact envelope before handing data to this oracle. No HTTP acceptance
is implied by these pure contracts.

## Analysis-only execution adapter preparation

The next batch provides three analysis-specific adapters and seven new no-service
contracts. It does not execute the ABBA experiment.

* `analysis-entry.mjs` connects the accepted algorithm to the actual transport,
  full HTTP envelope checks, existing owner/other-teacher/student identities,
  selected A/B API leaf and PG observation session. The current frozen two-wave
  selector and actor are identical across all four blocks. Positive responses
  and the exact 404/403 envelopes are retained before the data oracle runs.
* Each block opens a fresh API and observer session. Startup/auth/permission
  checks, each warm-up and each formal serial/pair operation have separate
  windows. The planned 60 windows comprise four startup windows, 12 warm-ups,
  and 44 formal windows containing 48 formal responses. API process CPU/heap/
  callback SQL are observed per window; concurrent requests share their process
  window. PG totals include the observer and remain sampled lower bounds.
* `analysis-db.mjs` uses the unchanged read-only Database implementation. It
  captures complete rows and schemas before assertions, requires the current
  primary 6708 and working 6719 facts, then freezes that actual admission for the
  final exact audit. No old ordinal/parser normalization applies and no new rows
  are permitted. The original A07 false and the separate two-file repair remain
  historical facts.
* `analysis-run.mjs` consumes the unchanged reviewed ownership, process signal,
  cleanup, resource and deadline definitions through exact AST selection. The
  adapted controller preserves startup/readiness/durable-status ordering and
  writer-stop, database audit, material audit and PG shutdown ordering. Changed
  seams are artifact/input selection, the analysis entry, exact current baseline
  and analysis result validation. The historical controller is not edited.
* A separate supervisor holds the measurement lock and watches the controller
  independently of its Python/Node execution. All processes share the same
  1200-second start, with work ending at 720 and driver cleanup at 780; final
  audit/material/stop reserves stay inside that total. The actual controller exit
  is durable before lock release/reacquisition. Only the outer Python exit plus
  final resource/deadline/I/O checks can publish the separate acceptance file.
  Controller/workload receipts alone never confer the final qualification.

`/tmp/c25-c26-analysis-execution-prepare-01` records six passing new contracts
and one failed assertion that searched JSON-escaped stdin source as plain text.
The real shared-AST and absolute-deadline checks had already completed; the
assertion is corrected to decode and compare the entire exact program.
`prepare-02` reruns only that single affected contract and passes. Both rounds
explicitly bind all twelve selected harness files before and after and retain
input copies. The six unaffected successes retain their first-round identity.

The tests exercise actual transport/algorithm code with boundary replacements,
real private frozen rows without SQL, and real synthetic Python child exits,
including a detached-descendant timeout. They also verify real temporary lock
release before publication and post-write resource failure. They do not claim
real HTTP authorization, database startup or performance results. The future
runtime still requires a clean current HEAD, full A/B/recovery inputs, actual
logical admission, full final protection and a separate execution approval.

The execution review identified one active/idle channel overlap: the 100ms
resource inspection could call the API's idle-only health assertion while a
legitimate probe RPC was pending, or while an observer/API block was closing.
The entry now marks only those active operations; resources, original deadlines
and the existing RPC/onFault paths remain checked. Historical probe and session
helpers are unchanged. Execution prepare-03 adds one targeted two-branch contract:
snapshot/close cross multiple real resource-timer ticks and complete normally;
a propagated probe fault still stops the block and preserves a false result.
The seven prior contracts keep their own raw identities and were not rerun.

The first real analysis ABBA attempt reached all 15 responses in its first A
block, then failed because a resource tick parsed API VmRSS during normal block
close. Its actual /proc status frame was not retained; no specific terminal
state is inferred. Both databases, all 39 material files and inputs passed the
final protection checks; the API/observer exited 0 and all services stopped.
The attempt remains false, with no B block or A/B performance conclusion.

Only the new entry is adjusted: block-close and final cleanup inspect global
resource floors without requesting API RSS. Active API RSS remains strict, and
final probe/actual exit/group-quiescence proofs remain mandatory. Execution
prepare-04 passes one new two-branch timer contract for normal closing and
active malformed RSS rejection. No old parser or safety ownership is changed.

Analysis ABBA02 has a one-time, explicit read-only lineage admission from the
failed ABBA01. The original 394731e6 full XZ archive, descriptor and actual
round-trip evidence retain their original consumer validation with
`check_data=False`. They are a consistent whole rollback set, not a claim that
current WAL/control or physical bytes still match that archive.

The new entry binds the entire frozen ABBA01 false index, both actual full
before/after rows and schemas (primary 6708, working 6719), 39 material files,
actual API/observer exit 0, and completed cleanup. It additionally binds current
full manifest b9c6d671 and all 47 complete old/new object differences from the
original recovery manifest. That exact transition includes two numeric relation
files; no general relation/WAL exception or future drift is authorized. Before
startup, the entire stopped tree must equal this fixed current manifest. The
new HEAD and A/B artifacts are separately bound, and a fresh exact logical
baseline still precedes API startup. Final checks revalidate all immutable prior
evidence without demanding that another PostgreSQL session leave physical
metadata unchanged. Recovery means restoring the whole original archive; it
never permits mixing its files with current WAL or control files.

Execution prepare-05 passes the new actual frozen-evidence/current-tree contract
and its seven drift/safety rejection branches, plus only the affected existing
6719-row/schema admission contract. It executes no SQL, archive or service.
ABBA01 and its false result remain unchanged; ABBA02 uses fresh state/launch
roots and still needs separate runtime authorization. This bridge does not
claim a new logical restore test or an A/B performance result.
