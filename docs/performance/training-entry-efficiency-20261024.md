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

## Learner lifecycle follow-up

Registered and anonymous questionnaire state endpoints dispatch FINAL_ONLY from
scalar headers rather than loading then discarding legacy form definitions, scale
children and answer payloads. Existing authoritative service reads and reconciliation,
registered ownership checks, and anonymous resume-capability middleware remain.
FINAL controller query count is unchanged; the legacy compatibility path adds one
header query before its unchanged full projection and fresh ownership check.
Twenty-two scoped assertions passed, including a targeted correction of the legacy
transaction-read call index (2 to 3) without changing its exact reload assertion.

Anonymous check-in validation now selects only check-in id, courseId,
allowAnonymous and endTime for both hashed and legacy-token lookup. Full token
scalars, expiry/revocation/usage checks, session capabilities and atomic submission
SQL are unchanged. Display content is still freshly read separately. Thirty-four
focused assertions passed. A synthetic fixture's relation JSON shrank from 38,876
to 77 bytes; this is not a database-wire or production-memory measurement.

Accepted-draft IndexedDB cleanup reads primary keys rather than cloning complete
answer/trial values merely to delete them. Exact scope, same transaction, failure
rollback and expired Training tombstones remain. Composite form saves still persist
every answer; only an empty stale-answer cleanup operation is skipped. Real hidden
answers continue to be removed. Eight distinct focused tests passed, including
failure rollback and visible-field pruning; IndexedDB testing uses a transaction
double, not a native browser. Initial no-test/locator failures were retained.

Not implemented in this round: on-demand protected public video/document loading,
SJT history/prefix hashing and growing journal serialization, or removing up to 200
stale-asset cleanup operations from an anonymous request. These need separate
behavioral, authorization, retention or scheduling validation. No debouncing of
scientific events or weakening of submission/permission checks is introduced.

## PR #349 alignment and bounded phase-one follow-ups

Integrated main `3ee60da761bf777da833f77e81565c5b3d5898a1` locally while preserving
its trainer-registration/account-lifecycle behavior and schema migration. The
merged auth controller differs from that main only by the previous four narrow
projections; administrator-selected account term and expiry boundary remain.
The generated Prisma client was refreshed from this schema, without migrating a
database or deploying. Old CI bindings are not valid for this expanded candidate.

- SJT V2 saves reuse an operation-local history projection inside the existing
  save queue. Three history constructions replace seven, retaining fresh
  post-invalidation binding, reachable-key pruning and independent final sealing.
  The synchronous submission precheck computes history at most once. Hash bytes,
  research journal contents, event order and persistence order are unchanged.
  This does not claim the same gain for V1 static online SJT. Forty-five affected
  assertions have passing results; two new instrumentation expectations were
  corrected and selectively rerun, and three affected submit cases rechecked
  after lazy precheck initialization. Original failures remain recorded.
- Periodic stale-upload sweeps no longer run inside student-upload, anonymous-
  upload or anonymous-submit handlers. A separate lightweight in-process scheduler
  waits for completion before scheduling another sweep: default five minutes plus
  0–30 seconds jitter, at most ten candidates per category, sequentially. Settings
  are bounded by CHECKIN_UPLOAD_CLEANUP_BATCH_SIZE (1–25),
  CHECKIN_UPLOAD_CLEANUP_INTERVAL_SECONDS (60–3600), and
  CHECKIN_UPLOAD_CLEANUP_JITTER_SECONDS (0–60). Limits are per process, not cluster.
  Stop tracks/drains the actual active promise before Prisma disconnect, subject
  to the pre-existing five-second hard exit. Other hourly jobs/heavy-worker gates,
  TTL, deletion eligibility, reference guards and compensation remain. Forty-three
  focused assertions passed, with one overbroad new assertion corrected and only
  that case rerun. Independent review found no blocker. This remains best-effort:
  durable physical-delete retry, existing staging TTL races and backlog monitoring
  are not added; smaller batches may increase cleanup delay.
- Protected public-check-in videos/documents load only on explicit activation.
  The initial unused-content request count is zero in focused tests. Cancel,
  duplicate clicks, late results, token/source identity changes, object-URL release
  and retries are guarded. Expired URLs refresh through the existing single-asset
  endpoint, not the detail endpoint that issues an upload session. Documents use
  prepare-then-open clicks. Images/external/legacy media and server authorization
  are unchanged. Twenty-two new cases and two existing presentation cases passed.
  Actual browser playback, popup/new-tab lifetime, transfer bytes and memory remain
  unverified; activated videos still wait for the complete blob, not Range streaming.
- Training administrator registration codes use opt-in page/pageSize=20, capped
  at 50, stable createdAt/id order and a server total. Legacy unpaged callers keep
  their response. Create/delete refresh and page-request epochs preserve current
  data; a loaded-page guard prevents failed navigation showing the old page as the
  new one. Twelve backend and ten distinct frontend cases passed. No new schema
  index is added: this bounds fetched/rendered rows, not database scanning cost.

Raw command/exits, source hashes, initial failures and selective follow-up results
are retained in dedicated evidence directories. No new production build, native
browser acceptance, PostgreSQL run, GitHub CI, PR merge or deployment is claimed.

## Administrator access follow-up

The workspace now loads only the selected account/course/resource component, and
registration-code code only after disclosure. The account lifecycle modal loads
only after a management selection. A small code-only loader shares pending/resolved
module imports, clears failed imports for retry, ignores unmounted completions,
and preserves parent search/drafts. Child render exceptions still reach the real
application error boundary. Existing route grants, MFA, redirects, lifecycle busy
and one-time-password handoff behavior remain. Thirty-eight distinct focused cases
passed (37 first run, one additional cancellation/reopen case separately); scoped
lint passed. These are code-loading contracts, not a measured emitted-bundle or
first-load latency reduction; extra lazy chunk waterfalls need browser measurement.

Grant list/batch/set response metadata now groups resource IDs by type, deduplicates
within the request and reads database types in sequential batches of at most 250.
Output order, duplicates, teacher/granter fields, missing/deleted resources, report
ID interpretation and first-match Bundle metadata remain. Authorization and mutation
transactions are unchanged. A 100-grant/same-resource fixture needs one resource
metadata ORM call. Actual SQL savings are not asserted because Prisma may batch
old findUnique operations internally; no metadata survives across requests.

The Training resource directory explicitly requests /scales?view=training-catalog.
After the original current-rights visibility/filter evaluation, it selects eight
fields: id, name, code, instrumentVersion, instrumentClass, libraryEntryId, status,
and description. Definition JSON, instructions, creator/course relations and
assessment counts are not fetched for this DTO. Default full-list/editor callers
retain their original contract. Pagination, total, filters and incomplete-directory
checks remain; this change does not truncate authorization choices or introduce
server-side search/full-catalog paging semantics. Forty-four backend and twelve
resource-catalog frontend assertions passed on first invocation, with independent
read-only review of source and raw test logs.

Password-reset preflight and post-hash authoritative checks are intentionally not
merged. Full selected authorization sets are preserved to avoid revoking off-page
grants. No schema, dependency, production deployment or GitHub CI change is made
by this administrator follow-up; existing CI bindings remain historical.

The final bounded gap review adds cancellation to the two teacher-directory
consumers: course creator filters and the authorization modal. Optional AbortSignal
propagates to Axios GETs and is checked before/after every directory page. Closing,
changing context or unmounting prevents further pages and late state updates;
failed or malformed modal prerequisites abort the sibling read. Reopening uses a
fresh controller. Cancellation never returns a partial teacher list, changes the
complete selected authorization set, or cancels a mutation. Each prerequisite is
validated once, not again after Promise.all. Twenty-three affected cancellation,
completeness and selection cases passed, with unrelated cases filtered out; changed
file lint passed. No metadata/API response cache was added.

Grant admission now reads only role, teacherApproved, isActive and isFrozen where
those are the sole eligibility inputs; scale admission reads status/instrumentClass,
cognitive admission status, and deletion existence id. Every existing current
check remains in its original order. Full-set differences reuse Set.has rather
than scanning desiredIds for each existing grant. The affected grant suite passed
45 cases on its new input; scale/catalog tests with unchanged inputs were not rerun.
This reduces unused field materialization and collection work, not the number of
mandatory authorization checks. Large-scale server-side directory pagination,
partial-set grant protocols and cross-request permission caching remain excluded.

## Submission-to-report bounded comparison (2026-10-24)

This is an isolated synthetic observation, not production/public-network testing,
load testing, release qualification, or a throughput/p95 claim. Baseline source is
`8af0b44e51ee91edd3d4f25dad3f0c6c1b54bcaa`; optimized source is
`9b7deeb3485f1f5974b550ef1517a9f8ffad1404` (tree
`f7cf2f3817073cb91aebc34e21efbb66563f2768`). Each backend source tree was copied
outside the working tree with a per-file SHA-256 manifest before its run;
unchanged installed dependencies/Prisma client were shared. Local evidence retains
raw requests, SQL events, process samples, storage snapshots, both manifests and
harness scripts. Baseline harness bytes were reconstructed from recorded edits,
not retrospectively presented as an execution-time signed artifact.

### Protocol and limits

Each phase ran one unmeasured warmup per type, then five sequential interleaved
rounds of simple → complex → mixed: 15 measured completions per phase, no
concurrent submissions. Earlier one-off/fixture-debug results are excluded.
Simple = two 20-question scales; complex = six 50-question scales; mixed adds
three five-field text forms and the actual published two-scene V1 assertiveness
SJT (317 responses). Scale answers are binary/all-yes, one sum dimension per
scale; SJT expected metric is 1.5 and retains frozen PILOT maturity/governance2.
There are no media, norms or long/adaptive SJT scenarios in this corpus.

Async/whole-submit remain false. Every unit POST is followed by the real attempt
GET; then status GET and report GET. SJT, when last, finalizes the parent inside
its POST. Main time starts before the first unit HTTP POST and ends on receiving
all report JSON; answering time, initial delivery and fixture preparation are
excluded. Final-unit-to-report time is reported separately. The intended protocol
change is optimized attempt GETs requesting `?view=current-unit`, matching the new
frontend; baseline used the existing full DTO. Initial delivery uses the same
phase-specific option. Payload generation, ordering, scoring and timing/sampling
logic otherwise remain fixed. Later harness changes only add this query and
outside-timer metadata/initial-storage capture, not another optimization flag.

Real HTTP controllers, database durability, scoring and report paths execute.
Synthetic identity injection excludes authentication/CSRF middleware. No browser
rendering/IndexedDB, TLS, nginx or WAN is timed. API runs in a separate process
from the client, TCP byte-meter and sampler; both proxy sockets use TCP_NODELAY.
No evidence files are written inside the measured sequence. Instrumentation
still costs time. Host: x86_64 AMD EPYC 9V74, nine available CPUs, Node24.22.1,
PostgreSQL17.11, 32MiB shared_buffers, fsync/synchronous_commit/full_page_writes on;
this is not a certified 4C4G production allocation.

### Observed timing and resource means

All values below are means of five; brackets are observed min–max, not confidence
intervals. CPU is API-process user+system time, not wall time or a capacity ratio.

| Case | First POST→report ms, before→after | Final POST→report ms, before→after | API CPU ms, before→after |
|---|---|---|---|
| 40 questions | 131.0 [114.5–148.3] →125.7 [118.6–138.1] | 80.0 [67.3–90.3] →76.0 [70.6–80.5] | 84.4 [77.3–93.6] →92.5 [83.6–106.0] |
| 300 questions | 406.2 [330.6–450.9] →395.1 [351.9–453.0] | 110.1 [96.1–129.4] →104.5 [80.3–154.8] | 269.7 [253.0–301.3] →256.8 [236.1–268.5] |
| Mixed317 | 571.1 [519.5–645.2] →604.1 [588.0–639.5] | 109.3 [98.6–117.0] →97.9 [80.0–112.2] | 360.5 [339.0–379.2] →390.0 [367.1–416.1] |

Mixed total latency increased5.8% and API CPU increased8.2%; simple CPU increased
9.6%. These data do **not** establish a general speed/CPU improvement. Ranges
substantially overlap; no extra runs were selected to chase a favorable result.
Report GET itself averaged17.7→14.8 /36.9→36.3 /37.4→29.4ms, with API CPU
11.8→10.2 /29.6→25.0 /29.0→23.6ms (simple/complex/mixed). Mixed attempt reloads
instead totaled208.3→227.6ms and133.5→144.3ms API CPU. Unchanged mixed scale POSTs
also rose173.7→191.2ms. These identify where the observed increase occurred, not
its cause. GC, scheduling, process warmup and growing database state prevent
attributing it solely to the DTO patch.

Mean observed API peak RSS was357.2→388.5 /358.7→390.4 /359.9→393.1MiB; mean
within-case peak increments were1.67→1.34 /1.80→2.69 /1.98→3.06MiB. Absolute peaks
reflect the long-lived instrumented process and order; there is no demonstrated
memory saving. Cluster PSS mean peaks were64.1→69.8 /65.8→70.0 /66.1→70.9MiB.
PostgreSQL CPU observed from scoped per-PID ticks averaged10→14 /52→44 /68→68ms
at10ms resolution, including background processes. One baseline backend exited;
per-PID sampled maxima avoid the erroneous zero from subtracting endpoint sums,
but this remains a coarse observation, not pure query-engine CPU.

### Deterministic payload benefit; no SQL-count reduction

| Case | SQL events before→after | HTTP response JSON bytes before→after | DB→API protocol bytes before→after |
|---|---:|---:|---:|
| 40 questions | 86→86 | 14,076→14,040 | 236,169→195,879 |
| 300 questions | 218→218 | 105,450→105,342 | 1,394,449→1,136,819 |
| Mixed317 | 352→352 | 246,263→169,733 | 1,811,725→1,545,275 |

Mixed JSON falls31.1%; attempt reload JSON alone falls204,461→127,929 bytes.
Report GET database payload falls98,195→58,093 /584,915→327,401 /
641,430→380,149 bytes, with its SQL counts unchanged11/11/12. Scale/form receipts
were already compact and were not altered. Request JSON remains2,920 /20,100 /
22,428 bytes; mean API→DB protocol bytes are38,365→37,737 /189,875→189,630 /
248,122→234,078. Protocol byte counters exclude TCP/IP/TLS headers; there is no
production gzip or bandwidth-rate claim. Per-request SQL attribution may differ
by a late event at a request boundary; whole-case counts are authoritative.

All30 measured reports passed value checks and full normalized structural JSON
comparison. Normalization replaces only synthetic UUIDs/item-code suffixes,
completedAt/totalTime/resultHash and scale method.definitionHash (fixture item IDs
change); it preserves result values, structure, item order, quality, labels,
references, disclaimers and the SJT scientific context/definition hash. This is
semantic equivalence, not equality of independently generated cryptographic
provenance or raw timestamped bytes.

### Persistence and comparison confounders

Stored row-datum increments (`sum(pg_column_size(row))`) are exactly unchanged:
29,522 /166,490 /196,883 bytes, with2 /6 /29 new rows. This read/DTO optimization
makes no persistence-saving claim. Physical relation means before→after are
40,960→34,406 /201,523→203,162 /250,675→249,037 bytes; WAL means are
71,606→44,360 /524,827→207,272 /256,778→382,235 bytes. These are noisy allocation/
maintenance observations, **not** optimization benefits. Baseline complex WAL
reached1,813,184 bytes; after mixed WAL reached884,072. Whole-database deltas even
include a negative sample while durable logical data increased. Relation bytes
include indexes/TOAST/page allocation; WAL and whole-database size are distinct.

Both phases preserve earlier synthetic records in the same isolated database;
there was no prebaseline database snapshot or exact page-state reset. After all
phase fixtures were prepared, row counts were1115→1337 during baseline and
1835→2057 during optimized execution. Autovacuum remains enabled with recorded
server settings. The larger later database, background maintenance, independent
process/module/GC histories and five observations bound causal interpretation.
Deterministic payload reduction and report equivalence are the strongest evidence;
latency/CPU/memory remain observational. Processes were shut down after each phase.
No CI, build/image qualification, push, merge or deployment is established here.
