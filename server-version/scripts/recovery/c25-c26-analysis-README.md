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
* The complete response oracle reconstructs the unsigned manifest and SHA using
  frozen selector/sources/dictionary/actor/authority. It changes only the cutoff
  and its recomputed manifest hash for comparison. All analysis/quality/metadata
  fields remain exact, including the small-N suppression contract. Historical
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
