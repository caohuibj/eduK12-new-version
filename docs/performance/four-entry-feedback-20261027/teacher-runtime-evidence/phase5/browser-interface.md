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

The prepared browser scope includes participant runtime/report acceptance plus
one read-only shared registration panel summary per product. Source selection,
prepare/register/review authoring are not a browser claim: those actual services
run in synthetic fixture setup. No user is asked to enter bare UUIDs.
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
- REDIS_URL points to a real loopback isolated Redis. No production endpoint. HTTPS ingress binds canonical port443, distinct from the two unprivileged backend ports.
- SCHOOL_TEACHER_FRONTEND_DIST points at verified same-candidate frontend files.
- PR363_BACKEND_SCHOOL_PORT and PR363_BACKEND_TEACHER_PORT are distinct loopback
  ports >=1024; serve-backend writes raw logs only to the private directory.
- PR363_SCHOOL_ORIGIN / PR363_TEACHER_ORIGIN are exact trusted HTTPS origins on
  school.eduk12.top / teacher.eduk12.top on the canonical HTTPS port443. Their DNS must
  resolve exclusively to loopback. Noncanonical ports are refused: the real Teacher origin guard requires its exact host.
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


Final output contract: browser.json schemaVersion=1, runId, source={head,tree},
inputs={backend,frontend} original build manifests, chromePreflight/chromeSandbox,
status RUNNING/PASS/FAILED, stage and sanitized errorDigest, cases containing only
product/mode/complete/resumedSameParent/reportState, and independent managementReads
rows for SCHOOL and TEACHER. PASS requires exactly School
IMMEDIATE, Teacher IMMEDIATE, Teacher SCHEDULED; empty/duplicate/incomplete scope
fails. Network mutation checks require each real Cognitive/native/Form FINAL200
under its product prefix. No Training/global transport fallback is accepted.
Read the same official component receipts/digests; do not promote NOTRUN metadata
or the four direct control assertions into browser acceptance.


## Increment: two actual shared management summary reads (NOTRUN locally)

Reuse each existing privileged manager password/MFA context before closing it.
Navigate the real workspace to “我的工具” (School link / Teacher tab button), open
“共享测评资源登记”, click “读取登记权限与资源”, then select the seeded immediate
case by its exact title/status button. No raw resource UUID is entered. Observe
the actual GET /organizations/:org/assessment-resource-registrations/:resourceId
response, require200/code0/PUBLISHED and exact product/org/runtime/title identity,
then compare its frozen C/P/R pointers with the actual visible “冻结版本摘要”.
Explicit empty P is checked, both selected R pointers are checked,本人披露 must be
“已批准报告的本人摘要” and开放方式 “完成后按权限开放”. The technical JSON details
must have open=false and its pre must be invisible without expanding it.

browser.json adds managementReads: an array of exactly two rows with product
SCHOOL/TEACHER, summaryRead=true, cprVerified=true, technicalJsonCollapsed=true,
disclosure=INDIVIDUAL_SUMMARY, openingMode=IMMEDIATE. PASS requires both rows and
all earlier participant/sandbox/artifact/fact checks. A missing/duplicate product
or unchecked summary cannot PASS. Failure stage is PRODUCT-management-read.
No new env, fixture transfer or CLI is needed. This verifies the new management
mount/read DTO only; it is not browser coverage of source selection, preparation,
registration, independent review or publication authoring. Those prior unit/
producer PG observations retain their original qualification.

Only new management control assertion and browser syntax were run locally.
Two Scale test files also received imports-only/unused-helper cleanup; scoped
ESLint used the existing recommended TS rules plus Node globals and returned0,
zero warnings. Suite/fixture operation+assertion body hashes are unchanged in
phase7/increment.json; PG was not repeated. Browser remains NOTRUN until formal CI.
