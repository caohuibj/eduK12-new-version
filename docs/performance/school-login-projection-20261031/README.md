# School ordinary login: one fewer identity round trip

Base: f5fa29314eb731f0479b90ae962b731da8e08d34. DOT-local isolated worktree only. No push, CI, merge, deployment, database or real account operation.

## Scope and result

Two production files: campus auth routes use the same explicit public projection for password-only login and me, including mustChangePassword; SchoolApp consumes that complete login identity rather than immediately requesting me. The mount-time me, page-refresh restoration, MFA completion me and older-server login payload fallback remain. No sensitive User fields are serialized. Teacher is unchanged.

Removing the me request exposed a real existing gap: a newly issued cookie might not be accepted, while existing initial reads previously swallowed 401 as empty data. Only the School component now handles a 401 from its existing initial reads by clearing current user and selected data, returning to login. 403, 503 and network errors do not log out; a 401 before login is not mislabeled an expired session. Initial async reads stop applying after their effect is disposed. There is no extra request, handshake, global authentication layer or cache.

A real SchoolApp with synthetic fetch responses records mount-time me once. Ordinary login formerly generated a second me; the candidate retains only the mount request. Forced-password login also avoids the second request while issuing no organizations/report read. MFA remains two me calls across mount and completion, older responses missing mustChangePassword deliberately retain two. This is a request-count observation, not real cookie storage/browser E2E, CPU, latency or throughput measurement. Backend routes execute their real handler bodies with explicit identity/security dependencies mocked; no new password/MFA/authentication proof is claimed.

## Executions and retained failures

- Frontend first baseline had eight failures, including fixture selectors referring to an obsolete welcome heading and MFA button. Its original reporter is retained and no success is inferred from it.
- Corrected baseline, unchanged production: four FAIL (redundant me / absent session recovery), four PASS (503,403,network and successful MFA). Product candidate first retested the four failed assertions: four PASS.
- Before finalization, the recovery function was limited to an already-current user, and legacy response fallback preserved; two dedicated cases were added. Final selected frontend invocation: nine PASS, MFA case filtered. The three non-session error cases were affected by newly added catch handlers, so their earlier baseline passes were not substituted for candidate checks.
- The three non-session cases then gained an explicit microtask flush before the final signed-in assertion; only those three were rerun, three PASS. Other selected final frontend results remain from the preceding invocation. This last change is test-only; frontend full types preceded that assertion-strengthening (act import and await), so that receipt is not represented as an exact final test-file compilation. The changed test executes successfully under Vitest; product sources and type declarations did not change after types.
- Backend baseline: two projection FAIL, one MFA challenge PASS. Candidate reran only the two failed projection assertions: two PASS. MFA response/cookie branch unchanged; its baseline pass is reused.
- Distinct selected behavior cases: frontend 10 and backend 3, assembled from original invocations, not one all-green run. Reporters retain skips and failures.
- Full affected frontend app types and backend types both exit 0. No build or unrelated suite ran. Cognitive tsc project is unrelated and not run.

## Commands and environment

Vitest: `node node_modules/vitest/vitest.mjs run <named test file> --maxWorkers=1 --reporter=json --outputFile=<report>`. Baselines use no name filter. Candidate frontend filter `uses ordinary|keeps forced|returns to login`; final filter `^(?!.*retains MFA)`; strengthened non-session filter `does not log out`; backend candidate filter `returns the same public`.

Types: frontend `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`; backend `node node_modules/typescript/bin/tsc --noEmit`.

Dependencies were copied into this worktree, not symlinked or modified in another worktree. Frontend lock matched the source dependency copy. Backend copied lock differed only in follow-redirects 1.16.1 versus current 1.16.2: mocked route tests do not import that package. Before backend types, official npm 1.16.2 archive was downloaded, verified against current lock SHA-512 and extracted only here. The initial npm pack attempt failed because the default cache directory was absent; retry with a workspace-scoped /tmp cache succeeded. Prisma client was generated locally from current schema, exit 0; no database connection or migration ran. No lock/package file changed. This is locally observed evidence, not a signed or CI-admitted qualification.

## Review and reuse

Review the complete two-file final patch plus callers, especially initial-read-only 401 handling, legacy payload fallback, explicit projection and strong password flow. Reuse existing product/membership/MFA contracts for unchanged paths. If future main changes these callers, reassess that delta rather than replaying all application journeys. Runtime cookie acceptance remains a declared synthetic-test coverage limit, not a claim of browser authentication qualification.

## Independent review correction (supersedes operation-recovery claims above)

Review of e041610d found that HTTP 401 also means a wrong current password or a
wrong/reused MFA step-up code. Blanket recovery in `run` incorrectly logged out
valid sessions. An old operation's captured user could also clear a newer login.
The correction removes only `recoverSession(e)` from `run`, preserving original
operation error semantics and all existing initial-read live/cleanup guards.
No API status/code changes, generation mechanism or additional request was added.
For forced-password users there is deliberately no initial business request; a
cookie/session rejection on password submission remains an inline operation error,
not an automatic logout. Initial non-forced login cookie rejection still returns
to login through existing reads. Full session recovery is outside this small patch.

The original synthetic operation-401-must-log-out test was an incorrect contract;
its previous pass is not acceptance evidence. All old reports remain unchanged.
Two replacements model wrong-password and wrong-step-up-code 401 and require the
same form/account page to remain available. Initial review baseline had two fixture
failures (deferred input not awaited and incorrect navigation selector). Corrected
baseline against unchanged e041610d had two real failures: recovery replaced the
operation error with expired-session login. After the one-line fix both pass.
Only these affected cases reran; untouched initial-read, login, projection and MFA
completion evidence is retained with its original input scope. The former 10-case
count includes the discarded operation assertion; final file contains 11 cases,
not a single all-green 11-case execution. Backend unchanged by this review.
`review-execution-record.json` binds the revised frontend files and new raw reports;
`execution-record.json` remains the immutable original candidate record.

Revised frontend app types: exit 0 against the final revised frontend files,
including the awaited deferred form input and new step-up case. No backend, build
or unrelated suite rerun. Name filter: `wrong-password|wrong step-up`.
