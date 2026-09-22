# Assessment content CI

CI always publishes `merge gate / ready PR`. The changed-file classifier uses a
complete local Git diff (including both sides of renames), rather than workflow
`paths-ignore` filters. Missing/failed classification cannot authorize a fast path.

| Change | Required work |
| --- | --- |
| Scale instrument version directories, generated instrument registry, owned tests/docs | Scale boundary, registry, scientific qualification, non-Postgres Scale regression, backend types |
| Existing Cognitive task seeds, participant presentation, governance/scientific declarations | Declaration-only AST check, manifests/dependency graph, onboarding decisions, Cognitive backend/frontend tests and types |
| SJT instrument/publication/scientific JSON, generated instrument registry | SJT manifests, scientific contracts, immutable publication/review check, non-Postgres SJT regression, backend types |
| Several of the above content domains together | Union of their targeted checks, one backend dependency install |
| Any other file, including new Cognitive engines/task descriptors/runners, shared tests, workflows, schema or dependencies | Existing draft light checks / ready full checks |

The reusable content workflow runs on an isolated hosted runner and does not
start PostgreSQL, browser acceptance, Docker image builds or CodeQL. Production
code changes retain these checks. Main pushes with content changes use the same
targeted checks; other main pushes retain compile smoke. Manual dispatch always
runs full CI. Dedicated Cognitive video and SJT video/branching workflows
exclude the same owned declarations so they cannot silently reintroduce heavy
checks for pure content. Their platform and workflow changes still trigger them.
Review events only rerun the publication workflow, which avoids
installing dependencies if no publication-related paths changed.

## Failures investigated on 2026-09-22

- Run 35698954155: Scale encryption tests lacked deterministic keys. PR 158's
  existing latest commit fixed this; the reusable gate preserves those keys.
- Run 35696339895: shared Scale test maintenance was incorrectly checked as
  content-only unless a label was present. Structural routing now selects the
  full gate for shared maintenance, without requiring a label.
- Run 35696295783: legacy six-package tests compared the entire expanding
  registry. Historical fixtures now retain exact identities/hashes while
  excluding later content additions from historical-only expectations.
- Run 35696339860: full repository graph/CLI checks and cold database setup
  exceeded unit-test defaults. Only affected test/hook budgets were adjusted.
- Run 35700430559: the managed Scale lifecycle timed out at five seconds,
  leaving later cases without a published fixture. That suite now has a
  30-second lifecycle budget. Its assertions and publication policy are intact.
- Runs also showed aggregate completion conflicts and occasional SJT transaction
  acquisition failures. The isolated SJT 10/30/60 concurrency regression passes.
  The aggregate failure reproduced against a fresh database. Refreshing planner
  statistics after bulk fixture insertion (before timing) avoids stale
  empty-table plans and excessive SSI conflicts. The 200 completions, 20 workers,
  default admission policy, durability and `<10s` assertion are unchanged.

No production scoring, admission, publication or transaction code was changed.
Runtime retry/admission experimentation was discarded after it failed validation.

- Follow-up run 35703437883: backend, frontend, CodeQL and publication checks
  passed. Browser login navigation exceeded 30 seconds on the Vite development
  server. Browser CI now downloads the exact frontend build from the same run
  and serves it with Vite preview (which inherits the existing API proxy),
  avoiding cold development transforms and another build. The session login
  helper also forwards its supplied timeout to navigation.

- Production-preview follow-up: branching business flows passed, but the final
  missing-token assertion counted `/assets/*.js` bundles as protected media.
  Both branching and Bundle browser checks now count only GET requests to
  `/api/.../assets/...`, retaining the zero-protected-request assertion.

## Latest backend failure analysis (head 0107cdd)

- CI run 35707705599 passed 2,202 of 2,203 tests. The public-composite-start
  query-budget case hit Vitest's default five-second test timeout. Its inline
  cleanup was bypassed, leaving an access token whose creator foreign key then
  failed the suite's user deletion. This is a second teardown error from the
  same interrupted test, not a separate application migration failure.
- Query-budget cases now have an explicit 30-second fixture/operation envelope;
  all logical query-count assertions are unchanged. Suite teardown removes all
  composites owned by its unique fixture user (including attempts and cascading
  tokens) before deleting that user. The public-start case leaves its graph for
  teardown so the normal database regression exercises this path.
- MEDIA-7 run 35707705257 failed during the instrument-FINAL suite's cold module
  imports at the default ten-second hook timeout, skipping its 12 cases. This
  setup loads Scale, Cognitive, Questionnaire and Composite runtimes. It now has
  a separate 90-second initialization budget and the focused backend command
  runs files serially to avoid redundant concurrent transforms on the runner.
  Business assertions and transaction/performance limits remain unchanged.
- Targeted verification: six files / 40 tests passed against isolated PostgreSQL;
  public composite start took 308ms. A temporary fault-injection copy throws
  after the public attempt and token exist: only that intentional assertion
  fails, teardown succeeds, and zero suite fixture users remain. The temporary
  test was removed after this check. Backend typechecking passes.
- A subsequent full local run hit transient PostgreSQL reachability failures
  through the VM's forwarded port while the same machine was running remote
  video CI. The container remained running without OOM/restart. This run was
  interrupted to remove competing load; it is not counted as a passing full run.
  The updated head still needs the remote full backend gate.

## Local verification

- Full backend regression with isolated PostgreSQL/Redis and `CI=true`: 357 files / 2,203 tests passed (177.84 seconds locally).
- Backend targeted regression: 148 files / 1,042 tests passed.
- Cognitive frontend regression: 45 files / 214 tests passed; frontend types pass.
- Backend types and all three domain contracts pass.
- Actionlint validates all three changed workflows.
- Classifier, aggregate fail-closed and Cognitive data-only AST tests pass.
- Isolated database tests cover managed installation, query budgets, reporting,
  SJT concurrent FINALs and the aggregate completion burst. The corrected burst
  completed in approximately 1.06 seconds locally; this is a test-host result,
  not a production performance guarantee.

PR 158 changes CI itself, so its next push intentionally takes the full route.
