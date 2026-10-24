# Survey researcher and respondent efficiency, 2026-10-24

This branch is stacked on the completed, unmerged Training candidate (remote
24c4ca6da9fbbd3aa3ccbc089eb305da07d10669; tree
18395c6df2995866f9e0b0f0c6a664c72e065252). It does not deploy or merge that candidate.
Survey's visual identity, permissions, publication, scoring and disclosure remain
separate from Training. No mini-program changes are included.

## Researcher entry and authoring

The tool library loads its editor only after selection; that editor loads only the
selected form/scale/composition editor. Wave preview, tool picking, legacy builder
and respondent preview code are also deferred until their controls are used.
A local deferred-component boundary catches download failures and supports retry
without unmounting the parent or discarding its unsaved edits. It shares code-loading
promises only, never API responses, drafts or authorization decisions. Existing
shared authoring components and settled markup remain unchanged.

## Respondent entry and checkpoints

The cognitive local store is no longer a synchronous import of the public entry's
local-registry/retention helpers. Actual scoped deletion and eligible retention
scans load it when needed; empty cleanup avoids the import. Retention still runs
on supported browsers, including for old cognitive data, so this is not a promise
that the store is never downloaded during a noncognitive visit. Web Locks, expiry,
identity, failure retention and pause rechecks remain.

Checkpoint requests previously read and verified the entire publication both
before and under locks. They now use the existing metadata locator outside the
transaction and perform full publication-ID/runtime/hash/digest and current
access checks under Project → Wave → Attempt locks, before disclosure or mutation.
The save path reads only prior checkpoint ID/version/expiry, not old ciphertext.
Each selected task's top-level material list is schema-parsed once instead of twice
when nonempty. No permissions or data are cached across requests, and no required
FINAL, credential, cognitive-union, revision or rollback checks are removed.

Researcher backend lists/projections, export byte budgets/cursors and request-local
memoization were already present. They were audited rather than duplicated; this
round does not replace Survey export or introduce Training's export helper there.

## Build comparison

The prior Training candidate's existing build was retained as baseline; it was not
rebuilt. One new-input Survey build used the same locked dependencies/configuration.
The table sums unique reachable JS/CSS files from Vite manifests, excluding images
and dynamic children. Gzip is a per-file compressed-byte sum, not observed traffic.

| Entry | Before raw bytes | After raw bytes | Before gzip sum | After gzip sum | Gzip reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Public respondent | 322735 | 303287 | 98501 | 92900 | 5.7% |
| Researcher tool library | 703800 | 433850 | 214682 | 128013 | 40.4% |
| Researcher wave studio | 929423 | 529850 | 280379 | 154984 | 44.7% |

Deferred editors/previews still download when opened. These figures do not establish
an equal reduction in page load time, total-session bytes, CPU/RAM or capacity.
Checkpoint full-publication processing and top-level material parsing each go from
2 to 1 by source path; no whole-service performance percentage is inferred.

## Verification and remaining gates

- Researcher: 88 distinct tests passed across 13 files; the two helper tests were
  subsequently rechecked after a test-only explicit generic fixed application
  typechecking. Initial stale READY/label test fixtures and the initial type failure
  are retained in evidence; behavior/assertions were not weakened.
- Respondent local/retention/deferred contracts: 14 tests passed.
- Backend contracts: 48 tests passed across seven files.
- Isolated PostgreSQL 17 operations: four tests passed. After the material-only
  refactor, only the entry case that calls task.public.ts was rechecked on final
  input (one passed, three intentionally filtered). The other cases do not call
  that path. The fixture was updated to use required explicit Scale publication;
  assertions remained. No production database was touched, and the test server
  stopped cleanly.
- Backend types, corrected frontend application types and one frontend production
  build passed. Changed frontend lint has no errors and one known pre-existing
  wave-studio dependency warning. Independent static review found and resolved the
  late-module-failure draft-loss risk before freeze.

Local browser execution remains unavailable. Visual runtime acceptance, native
module-download retry behavior and actual page/CPU/memory/DB latency are not claimed.
No CI qualification, PR merge, production deployment or new public-tool publication
is represented by these development checks.

## Second local optimization round (CI paused)

- FINAL and detailed-feedback queries now select only consumed fields, excluding
  unused attempt ciphertexts and Wave draft JSON. All current authorization,
  consent, publication integrity and locking checks remain. A selected snapshot
  is reused only inside the same FINAL transaction; scoring still uses the frozen
  union. Focused spies observe one selected projection for a first submission and
  none for receipt replay. This is not a database-byte or capacity benchmark.
- Retrying an already sealed FINAL envelope no longer sanitizes answers or seals
  timing again. The original request identity/body and attempt guard remain.
  Completed-attempt recovery avoids duplicate scoped cleanup, unused submission
  UUID creation and runnable-task initialization, while explicitly clearing old
  answer/timing/cognitive/navigation state. Draft parsing was already absent in
  this completed path and is not counted as a new saving.
- The researcher catalog joins only pending reads for the same project, API and
  page. Project-bound rendering and generation checks prevent old grants, results,
  errors and loading completions leaking into the new project view. Settled refresh
  and failed retries remain fresh requests. The measured two-to-one startup read
  reduction applies to development StrictMode setup replay, not production latency.

Validation was local and targeted: 66 affected backend contracts plus two new
variant cases; researcher catalog 13 cases with six affected cases rechecked after
a cleanup correction; respondent 19 targeted regressions, a new sealed-retry case
and four final terminal-state cases. Raw commands, real exits, source hashes and
case reports are retained outside the repository, including initial fixture
failures. Independent static review found and resolved the terminal-state reset
omission. No new build, browser, PostgreSQL run or CI was executed in this round.
The earlier bundle figures describe the earlier built candidate, not this new
source snapshot. Alignment with the eventual Training/main merge is still pending.
