# DOT O09: course-scoped Composite discovery

Base: `f5fa29314eb731f0479b90ae962b731da8e08d34` (actual #433 main).
Product: `ffe2c30ed28619ca3b81affd469a4f2e645f7c15`.

## Scope and reason

Four production files only: the Training course loader passes `courseId` to the existing available endpoint; the endpoint and existing student-task feed both pass it to `listAvailableForStudent(userId, now, courseId?)`. The second `now` argument is unchanged. The original student membership query intersects the optional course; all existing publication/archive, library exclusion, multi-course QUESTIONNAIRE delivery, attempts and return mapping remain unchanged. No new cache, entitlement layer, table, index, CI route or report engine.

The frontend still uses its existing paged task feed to confirm multi-course delivery and retains the existing incomplete-page and page-limit behavior. This change reduces materialized rows per call, not the number of page calls. No claim of removing all repeated reads.

## Selected local verification

- Backend baseline, before implementation: one default-catalog/history case passed; four target-scope cases failed as expected (the service had no course parameter). Original JSON and real exit preserved.
- Backend candidate: reran only those four cases, all passed. Includes real service, real available controller, real task feed, mocked Prisma query predicates/returned rows; multi-course delivery and archived continuing work remain included.
- Existing task-default case: one pass after updating its expected optional argument to `undefined`.
- Frontend baseline: selected course loader case failed on the new scope-argument assertion. A subsequent invocation accidentally occurred before the edit because its edit command used a wrong working-directory-relative path: the same case still failed and the existing archived multi-course case passed. Both invocations preserved as baseline and before-edit; not relabeled successful candidate runs.
- Frontend candidate: only the failed course loader case rerun, passed. The unchanged archived multi-course behavior reuses the before-edit pass. A duplicate new assertion in an unrelated test was removed; that unselected case is not claimed executed.
- Current backend `tsc --noEmit` and frontend app `tsc -p tsconfig.app.json --noEmit`: once each, exit 0. No cognitive compiler rerun, full test suite, build, database, browser or CI run.

Eight distinct successful cases are covered across these invocations (six backend, two frontend). Skipped cases remain skipped in reporters. Original failures remain in the evidence.

## Synthetic measured read reduction

One service call: 12 Composite records and 24 own attempts -> 4 and 8.
Two scoped task pages together: 24 Composite records and 48 own attempts -> 8 and 16.
The new multi-course QUESTIONNAIRE attached to both c1 and c0 remains in c0. The scoped result equals the original complete result filtered by the synthetic delivery identities. Task total, state counts, deterministic ordering and two-page concatenation remain unchanged.

These are mocked Prisma row counts using the real service/controller, not measured SQL time, real database load, network latency, CPU/RSS, throughput or concurrency. The fixture computed JSON/gzip bytes but JSON-only reporter did not retain its console output; no byte-reduction claim is made and no successful check was rerun solely to recover a number.

## Environment and setup history

Node 24.22.1. Backend dependencies independently installed with the exact current lock using `npm ci --ignore-scripts`, official npm registry, then current Prisma generation. 445 installed package versions matched the lock (platform-omitted optional packages not counted); follow-redirects is 1.16.2. Frontend uses read-only existing dependencies, whose package/lock inputs are unchanged.

An initial copy/softlink command used incorrect relative paths and made no changes. Its following initial npm attempt failed because default `/home/agent/.npm` cache could not be created. The retry used a writable isolated cache; `npm install --package-lock=false` was found to have resolved additional versions, so before any backend test it was replaced by the recorded exact-lock `npm ci`. No package or lock changes were retained; no test result uses that exploratory dependency resolution. A candidate test command was initially issued from the repository root with backend-relative output paths; redirection failed before the test launched. The corrected recorded invocation is the actual candidate check.

## Integration and handoff

This branch is independently based on main before #435/#436. Its single course-loader edit only adds Composite scope; when integrating, retain #435's Scale `{ params: { courseId } }` and #436's Cognitive `getMyAssignments(courseId)` as well. Never replace the entire loader with one branch's file. No main modification, publication, Ready transition, merge or deployment was performed by this task. The parent owns sequencing and final qualification. Original Group/Long changes in the shared Composite service are preserved in full from f5fa.
