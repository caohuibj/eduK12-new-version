# PR363 narrow browser consumer — NOTRUN

CI thread 01a17c86 interface. No App build or browser was run on this worker.
The sole real browser execution belongs to the reviewed same-build formal CI.

## Scope

Three real cases: School IMMEDIATE and Teacher IMMEDIATE/SCHEDULED. Each source
contains existing reaction experience-profile Cognitive, freshly authored native
staged SJT (repository self-authored synthetic template), and typed Form. Actual
source/C/R issuance, exact target distribution, prepare/register/independent
review/publication and actual product workflow/Run publication happen in fixture
setup. The fixture asserts ASSIGNED/no runtime binding/no parent attempt. It
never seeds child completion, answers, FINAL or report facts. The fixture's trusted
SYSTEM_ADMIN service proof is synthetic source setup, not browser authentication.

Browser uses official rendered product pages over real trusted HTTPS; no route
fulfill, page.setContent, generated session, TLS bypass, clock mock, no-sandbox or
manual FINAL API payload. Existing Chrome preflight/namespace/seccomp checks are
required. Product authors first complete actual password+TOTP enrollment; separate
participant contexts obtain real Secure/HttpOnly realm cookies and CSRF. Titles
identify tasks, not manually entered UUIDs. Actual UI starts, refreshes/resumes the
same parent, clicks reaction stimuli and native core/probe stages, submits Form,
and displays authorized READY or frozen-future WITHHELD feedback. Post-browser
verification reads encrypted canonical FINAL and compares exact metricKey/value.
No report scorer is invoked by verification.

This is participant runtime/report acceptance, not a claim that the registration
management panel has been browser-tested. Exact source licenses are selected by
actual service-returned identities inside the synthetic producer fixture; no user
is asked to enter bare UUIDs. Management panel/DTO checking stays its own consumer.
The two special Scale marker PG journeys requested by root remain separate work;
this representative browser does not substitute for those.

## Artifacts / fixture transport

Checkout exact GITHUB_SHA. Restore backend artifact into backend/dist and frontend
artifact into SCHOOL_TEACHER_FRONTEND_DIST (default frontend/dist), along with
locked dependencies. Each must have original ci-build-manifest.json with same
SHA/runId/kind/lockDigest and verified treeDigest. Neither script builds or edits
these artifacts. Browser additionally compares actual network HTML/static response
bytes to artifact files. An ingress serving a different page/chunk fails.

Fixture creation and browser consumption must share one ephemeral Actions job and
RUNNER_TEMP private directory. Do not transfer plaintext private fixture, auth,
MFA secrets, DB URLs, observed full report JSON or raw backend logs via artifacts.
Only sanitized PR363_EVIDENCE_DIR/browser.json and control/build identity receipts
are public artifacts. Source template/helpers travel as ordinary reviewed Git
files; private fixture.json/pr363.json/pr363-observed.json remain 0600 locally.
Dispose the disposable PostgreSQL/Redis service volumes after the job. A failed
seed cannot retry on that database; preserve the original sanitized failure.

## Required environment / setup

Reuse school-teacher-fixture.cjs exact guard, not fake CI flags:

- CI=true, GITHUB_ACTIONS=true, NODE_ENV=test, exact GITHUB_SHA/GITHUB_RUN_ID.
- Actual Actions postgres:16.15-bookworm service, POSTGRES_USER=ptool,
  POSTGRES_DB=school_teacher_browser_ci_test, anonymous job-local Docker volume;
  CI_POSTGRES_SERVICE_ID is the actual 64-hex service ID, checked through Docker.
- DATABASE_URL and SCHOOL_TEACHER_TEST_DATABASE_URL are the same loopback owner
  URL for that database; SCHOOL_TEACHER_ISOLATED_DB=1. Apply the candidate's real
  migrations and matching Prisma before seed. No backend/.env.
- RUNNER_TEMP and SCHOOL_TEACHER_PRIVATE_DIR=$RUNNER_TEMP/pr363-private, initially
  absent with an existing nonsymlink parent. Existing seed creates actual restricted
  role with the full table-policy/release-schema checker; only runtime services
  receive its URL. Source/account fixture setup alone uses owner.
- REDIS_URL points to a real loopback isolated Redis. No production endpoint.
- SCHOOL_TEACHER_FRONTEND_DIST points at verified same-candidate frontend files.
- PR363_BACKEND_SCHOOL_PORT and PR363_BACKEND_TEACHER_PORT are distinct loopback
  ports >=1024; serve-backend writes raw logs only to the private directory.
- PR363_SCHOOL_ORIGIN / PR363_TEACHER_ORIGIN are exact trusted HTTPS origins on
  school.eduk12.top / teacher.eduk12.top, optional CI ingress port. Their DNS must
  resolve exclusively to loopback. Default canonical origin has no port.
- CI provides actual TLS ingress/static serving those official files and proxies
  /api to the corresponding product backend. Preserve Host, Origin and separate
  Set-Cookie headers, X-Forwarded-Proto=https, one trusted proxy hop. Do not rewrite
  origins. Certificate trust is normal OS/browser trust, never ignoreHTTPSErrors.
- Existing official nonroot Chrome + Playwright tools satisfy school-teacher-chrome
  preflight; use existing CI preparation, not a bundled fallback or sandbox change.
- PR363_EVIDENCE_DIR outside the private root (default repo/pr363-evidence).

## Commands (from repo root)

```text
node server-version/e2e/pr363-fixture.cjs seed
node server-version/e2e/pr363-fixture.cjs serve-backend SCHOOL
node server-version/e2e/pr363-fixture.cjs serve-backend TEACHER
# Keep both servers running; establish trusted ingress and finite health readiness.
node server-version/e2e/pr363-browser.cjs
```

Browser invokes `pr363-fixture.cjs verify` after real UI completion. That reads
actual stored facts; it cannot create or repair a result. Server child receives
production NODE_ENV, exact single CORS_ORIGIN, Secure cookies, real Redis, actual
restricted runtime URL, Cognitive/Teacher enabled and synchronous report path;
background media/report consumers remain off. No real COS content is required.
The backend startup logs are private. Stop both servers and dispose job services
in CI always-cleanup; do not publish private logs or restore their fixture as a
new independent run.

Only local checks authorized/executed here: node --check on new CJS consumers and
node --test pr363-browser.test.cjs (three direct control cases). They establish
syntax, exact-key mismatch rejection, origin restrictions and artifact traversal
rejection, not seed/production startup/actual UI or browser success. All latter
statuses remain NOTRUN until the designated formal CI consumer executes.
