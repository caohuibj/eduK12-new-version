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
