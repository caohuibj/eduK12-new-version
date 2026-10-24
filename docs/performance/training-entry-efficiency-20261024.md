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

## Follow-up: first visit, login and registration

A further bounded change defers Survey and Education administration frames until
AppShell's existing route/identity checks select them. The Survey-specific style
sheet stays imported by its own frame rather than eagerly by AppShell. Existing
loading and top-level retry behavior remain. Login/registration pages were already
lazy; no duplicate login-response /me request existed to remove.

Using the preceding candidate's preserved dist as baseline (same dependencies and
build flags), one new Vite build produced these **static manifest reachable JS/CSS**
closures, excluding images and dynamic children:

| Route | Before raw bytes | After raw bytes | Before per-file gzip sum | After per-file gzip sum |
| --- | ---: | ---: | ---: | ---: |
| Training portal | 894579 | 866510 | 226226 | 218591 |
| Training login | 863243 | 835174 | 218189 | 210546 |
| Training registration-code entry | 862375 | 834306 | 217615 | 209979 |

Each closure is 28,069 raw bytes smaller and includes one fewer CSS file. Gzip
savings are about 7.6 KB (roughly 3.4–3.5% of this modeled closure), not a measured
browser transfer or latency improvement. Do not describe the entire shared
learner-navigation chunk as removed. The earlier baseline build was reused, not
re-executed; neither browser measurements nor production deployment occurred.

Registration username-existence reads now select only id. Both initial and locked
student course reads select the six fields consumed by registration and joinability.
All reads, lock ordering, code rotation checks, recruitment state checks, password
cost, MFA, session validation, admission limits and errors remain unchanged. In
particular /me still rereads current account/profile state; no stale principal cache
replaces it. Field selection reduces unnecessary data, not SQL statement count.

Additional affected validation: 80 frontend assertions (including authorized and
unauthorized Survey/School/Teacher management navigation and anonymous entry),
45 backend registration/entry/admission assertions, changed frontend lint, frontend
application types, backend types, and one new-input production frontend build all
passed. Registration projection mocks return only selected fields and preserve
locked-course race rejection checks. Real browser startup remains unavailable.

## Follow-up: learner assignments and check-ins

Registered learner forms now memoize unchanged instructional HTML and media
presentation. In paired jsdom probes using the real sanitizer/media implementation,
20 input events added 20 sanitizer calls on each old page and zero on each new page.
Media parsing calls were 120 to zero for assignments and 80 to zero for check-ins,
including internal image-URL parsing. These are operation counts, not browser
latency, CPU, heap or production capacity results; the API transport is mocked.

The assignment detail API already includes the student's submission. Ordinary
assignment opening plus one successful submission refresh now requires two GETs
instead of four. The fresh detail read remains. A compatibility exception retains
the raw my-submission endpoint when an answers map contains a nonempty assetId
key: valid question IDs are not restricted, and detail's recursive media hydration
can otherwise alter a url answer. Failure of this fallback does not hydrate the
potentially transformed answers. Check-ins retain their separate own-submission
request because their detail API does not provide that same contract.

Route-local layout cleanup and loaded-entity guards isolate late detail, POST and
upload outcomes (including finally blocks and compatibility fallback) from a newly
opened task. Fetch callbacks depend only on task ID, so ordinary typing does not
reset the form. Submission idempotency keys, retry on uncertain results, revisions,
requiredness, deadlines, feedback, fresh post-submit hydration and asset ownership
checks are preserved.

Backend submit gates now select only course/status/deadline fields needed by the
existing checks (assignment: three scalars; check-in: two). Assignment revision
history reads only its latest version number. Statement counts, membership reads,
locks, receipt replay guards, historical snapshot writes and image checks remain.

Validation: 35 backend and 45 frontend targeted assertions passed, plus two separate
baseline operation-count probes. Final changed frontend lint has zero warnings;
backend types, frontend application types and one new-input Vite build passed.
Independent static review found and resolved the route-cleanup gap and the valid
assetId/url answer compatibility issue before commit. An initial obsolete Vitest
CLI option failed before tests; an initial lazy-module mock harness was replaced
with the real media implementation. Final evidence retains these original attempts.
No real browser/DB resource benchmark, CI run, PR merge or deployment is claimed.
Anonymous media preloading was inspected but not changed in this batch.

## Follow-up: teacher task authoring, review and export

Standalone assignment/check-in lists defer course choices until authoring or reuse.
Course-context deep links still load their required prefill, and embedded pages use
their existing course. Loading failures now expose retry without clearing editor
input. The optional reuse-picker feedback keeps the dialog usable while choices
load. There is no course filter in the affected catalog toolbar to starve.

Assignment submission review coalesces repeated in-flight opens in the same dialog,
invalidates closed/replaced reads, and reports retryable failures. Closing and
reopening deliberately performs a fresh read. Batch grading retains its complete
selection semantics; stale completion cannot refresh another task. The ungraded
partition is memoized only by the current submission array and updates after refresh.

Mocked paired probes observed course-option GETs per standalone list entry 1 to 0,
same-turn duplicate review GETs 2 to 1, and ten-row batch-comment status-property
reads 90 to 30. These are request/render-work counters, not real browser latency or
system throughput measurements. Existing task-export deduplication and finishing
an explicitly requested download after navigation are unchanged.

Backend legacy teacher list queries use a live course.creatorId relation predicate
instead of materializing all owned course IDs. Authorized legacy requests use two
model queries instead of three; an explicitly foreign course previously returned
early after one course-ID query and now performs two scoped queries. This is not
a universal query-count reduction, and the current summary-list route is unchanged.
Teacher/admin branches, course constraints, Activity exclusions and list/count
predicates remain aligned. Review authorization selects only required ownership
and context fields. Workbook generation completes before Excel response headers
are set, so generation failures retain the existing JSON error response behavior.
Export columns and authorization are unchanged.

Validation: 26 distinct backend assertions, 34 distinct frontend assertions,
backend/frontend application types and one new-input Vite build passed. Changed
frontend lint has zero errors and eight verified pre-existing warnings; no new
warning or rule suppression was introduced. Initial mock HTTP expectations and
option-name locators were corrected to the unchanged production contracts; their
failure history is retained. Independent review found no remaining static blocker.

Large assignment review remains a full-list operation, and both XLSX exports still
materialize full workbook buffers. Cursor paging must preserve explicit batch
selection semantics; streaming exports need completeness and failure tests. These
larger changes are not silently included. Real browser/DB capacity measurements,
CI qualification, PR merge and deployment remain outside this batch.

## Implemented follow-up: paged review and bounded XLSX exports

This supersedes the earlier deferred-pagination/export note for the web workflow.

### Review and grading

- Submission review defaults to 25 rows (maximum 100) with an immutable ID keyset.
  The UI describes stable ordering and refresh; it does not claim chronological
  ordering or a cross-request database snapshot. Counts within each response use
  the same RepeatableRead transaction.
- Page selection and all-ungraded selection are separate actions. All-ungraded
  means the existing status-not-GRADED predicate, including its legacy DRAFT case.
  Selection captures at most 5,000 IDs and observed revisions in one read; overflow
  rejects the operation rather than selecting a prefix.
- Fifteen-minute, actor/assignment-bound HMAC proofs contain at most 100 entries
  per chunk, with explicit domain separation from session tokens. No answers or
  persistent access credentials are included. Later arrivals are not members.
- Grading shares student submission advisory locks and conditionally updates the
  observed revision/status, incrementing revision. Changed records are skipped,
  not overwritten. UI reports confirmed applied versus changed/already-processed
  counts, preserves comments, and retries the uncertain chunk without claiming an
  identical idempotent response. Single-grade callers can send expectedRevision;
  older callers omitting it retain weaker stale-UI protection. The independent
  historical snapshot version sequence is unchanged.

### Export resource and failure contract

- 250-row timestamp/ID keysets capture rows and mapping metadata in a bounded
  RepeatableRead transaction (5 seconds, 2 seconds maximum acquisition wait).
  NDJSON is written to a private temporary file. The database connection is
  released before workbook compression or client download.
- An isolated ExcelJS 4.4.0 adapter commits rows with checked backpressure, guards
  pending writes/footer completion, and fails closed on an incompatible library.
  Shared strings are disabled. A stalled-output test limits producer advancement
  and queued output rather than treating eventual round-trip success as proof.
- Existing limits apply: default 10,000 records, 50 MiB, and 2,000 fields (also
  bounded by Excel limits). One active export per process and a 120-second overall
  deadline bound concurrent work. Oversized, busy or failed exports return errors;
  they never silently return a successful partial workbook.
- Only a completed XLSX receives download headers. Immediately before delivery,
  the existing authentication and teacher-role policies run again, followed by
  current ownership checks. Authentication next(error), revoked role/ownership,
  deletion and expiry all fail closed. Initial route authentication is not repeated
  unnecessarily at controller entry.
- Generation, stream, disk, timeout and unfinished-response disconnect paths
  release temporary resources. Successful response closure is not an abort.
  Error responses are shown as bounded plain-text JSON messages by the existing
  frontend export hook; successful downloads still finish after navigation.
- Columns and visible cell values are retained. Inline empty strings read back as
  blank/null in ExcelJS rather than its old shared-string empty value; tests record
  that distinction. Binary-identical workbooks are not claimed.

### Validation boundaries

Backend review unit tests, scoped permission/export consumers, real ExcelJS output,
slow/stalled/error sinks, cleanup, concurrency admission, caps and authorization
revocation tests passed. Web paging/selection/retry tests and 18 export-hook tests
passed; backend and frontend application types and one new-input frontend build
passed. Changed review-page lint retains four verified pre-existing warnings, with
no new warnings or rule suppression.

Five isolated PostgreSQL 17.11 tests passed. They execute the actual grading service
with competing advisory locks, revision conflicts, retries and ownership change,
and verify frozen selection membership. The export case proves the SQL MVCC
keyset premise under concurrent mutation; it does not represent full controller
or production-runtime verification. The student writer is a SQL-equivalent test
operation, not the complete HTTP submit handler. The server stopped afterward.

No real browser timing, production capacity, CI qualification, merge or deployment
is claimed. Mini-program teacher compatibility changes were excluded at the user's
request; this batch qualifies the web workflow only. Larger future changes to
limits or ordering require their own evidence, not weakening these guards.
# Additional local round while PR #348 is paused

Student assignment/check-in detail queries no longer request the submission-count
aggregate that their responses already omit. Teacher/admin queries and existing
count-disclosure rules are unchanged; membership and foreign-course checks remain.
This removes an unused aggregate, not necessarily a whole SQL round trip.

Public check-in instructions are sanitized only when content changes, and immutable
media presentation components are memoized with source/token/title props. Twenty
typing events produced zero additional sanitizer or media-parser calls in focused
tests; task changes still update instructions and media. Media authorization and
the existing eager signed-asset blob download behavior are unchanged.

Twelve new backend cases and two new frontend cases passed. The initial frontend
label-locator failure is retained; only its affected case was rerun after correction.
Lint passed with one verified existing hook-dependency warning. A final React memo
typing-only adjustment was statically checked against installed types, not reported
as a fresh runtime test. No new build, full typecheck, browser or CI was run.

These additions are backup-only pending PR #347 integration and final input
qualification. Prior fixed CI bindings do not qualify this expanded source delta;
the earlier performance/build figures remain tied to their original candidates.

## Integration of PR #347 and subsequent bounded changes

Official main `4d95a5b11c3b2261c96d7161eea66ebf8d6f0626` was integrated locally
without replacing existing optimization history. The backend merge changes only
PR #347's five intended paths; prior registration, assignment/check-in, checkpoint,
FINAL and export optimizations remain intact. Twenty-five of twenty-seven earlier
frontend optimization paths retain identical blobs; the shared shell and its test
were reconciled to preserve both new management UI and existing lazy frames.

New Training management code is now loaded behind the unchanged entry grant/path
check rather than on every public visit. Startup management CSS remains eager to
preserve pending-auth/loading appearance. Resource catalog filtering is memoized
by rows and applied query, so draft typing does not scan the same rows repeatedly.
Eleven focused frontend cases and changed-file lint passed.

Course completion reads a filtered ACTIVE enrollment count rather than materializing
all student IDs. Roster retrieval selects only fields used in the complete existing
response; ownership/admin checks, status/order and credential-protection batching
are unchanged. Seven new query/response contracts passed. These results establish
query shape and render-call savings, not measured PostgreSQL latency or capacity.

The global 587-byte startup stylesheet was assessed but left unchanged: conditional
loading could flash the wrong theme; inlining trades one request for larger HTML
and needs its own browser verification. New intentional vector lettering is not
compressed by changing its appearance. Prior bundle measurements are historical,
not measurements of this merged candidate. Exact CI bindings remain stale until
explicitly frozen again. No GitHub CI, PR merge or deployment was initiated.
