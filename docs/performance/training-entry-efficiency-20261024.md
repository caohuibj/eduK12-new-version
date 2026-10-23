# Training entry and assessment efficiency, 2026-10-24

Baseline: main `67d0c77034aea3c3cf1ee118eb65ab3aafe7b6eb`.
Validated application tree: `144ac6d6e92da2f71d1e8c78109c531b8c71aa86`.
This is a development branch, not CI qualification, a deployment or a capacity claim.

## Bounded changes

- Learner assessment discovery reuses an in-flight promise within the mounted
  course page. Course identity, page retry, assessment retry and cognitive
  capability changes invalidate it. Stale continuations cannot update a new
  course. It is not a cross-user authorization or result cache.
- Teacher data export presentation loads only when opened. A local loading/error
  state provides retry and close without submitting an export. The export intent,
  scope, disclosure rules and download logic are unchanged.
- Checkpoint SAVE acknowledgements and CLEAR reads/writes project only revision,
  successful-save count and expiry. Recovery GET and initial SAVE retain needed
  ciphertext and integrity reads. Validation indexes returned rows once instead
  of repeatedly scanning each batch. Historical duplicate scale-child rows keep
  the old first-match behavior.
- Training FINAL interpretation indexes frozen item/reference groups once per
  invocation. It preserves binding order and all repeated authority validations,
  current reads, locks and hash comparisons. It does not cache permission decisions.

## Executed checks and evidence boundaries

- 49 distinct frontend assertions passed across the affected learner and export
  consumers. Tests include stale course/capability/retry/remount behavior and
  deferred-code failure/retry/close. Changed-file lint passed.
- 28 distinct checkpoint assertions passed across the initial suite and its
  targeted additions/rechecks. A mixed mock fixture contains 75 drafts and 25
  cognitive result references. Actual instrumented identity-property reads were
  1,300 on baseline and 100 on candidate. The four validation model batches remain
  unchanged; this is not an actual SQL-count, CPU, memory or concurrency measurement.
- 21 FINAL receipt tests and 23 reference-consumption tests passed. Shared three-unit,
  two-reference-slot cases retain nine measurement and eighteen reference
  validations, with three release repository reads. No authority-read reduction
  is claimed.
- Backend TypeScript and frontend application TypeScript checks passed. The first
  frontend typecheck failed because a new test used Array.at outside the configured
  library target. Only the test expression was changed; the library target was not
  widened. The affected four tests and corrected typecheck passed.
- One candidate Vite production build passed. Its manifest marks AssessmentDataExport
  as a dynamic entry; neither teacher course assessments nor questionnaire-list
  static dependency closure contains the dialog or exportJobs. The dialog chunk is
  5,944 bytes uncompressed, 2,958 bytes gzip. This is the candidate chunk size, not a
  measured baseline-to-candidate transfer saving.
- Delayed-response UI mocks reproduce two away/back tab switches: four discovery
  endpoints are each invoked once instead of three times (12 to 4 requests).
  These are deterministic request-contract observations, not browser page timing.

Successful unchanged checks were not rerun as a full suite. Initial fixture/test
failures were retained and only affected checks were repeated. No assertions,
permissions, scoring, persistence or security gates were relaxed.

## Not completed / follow-up

Real Chromium measurement was blocked before page load by the execution
infrastructure; a reviewed execution retry also failed before browser startup.
No browser sandbox protection was disabled. Therefore real cold/warm timing,
transfer bytes, long tasks, heap, and native dynamic-import failure recovery remain
unverified. No real PostgreSQL concurrency/latency or backend CPU/RSS benchmark was
performed. No new CI run, PR merge or production deployment is represented here.

The governed teacher tool catalog still has per-tool authorization work. Batching
those checks needs explicit authorization-parity and revocation tests. Likewise,
FINAL measurement scope checks are deliberately not memoized: not all mutable
wrapper/version/media facts are row-locked, so eliminating repeated reads could
change READ COMMITTED revocation visibility. These are separate future changes,
not silently included performance shortcuts.
