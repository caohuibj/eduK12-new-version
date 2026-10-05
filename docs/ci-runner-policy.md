# CI runner and scenario policy

CI is orchestrated by GitHub Actions. The stable required check remains **merge gate / ready PR**.
It must require exact success for every selected route and acceptance; missing, skipped,
failed or cancelled selected jobs never mean merge-ready.

## Scenarios

- Content: established declaration-only content plus immutable release/scientific rules,
  content regression and the existing all-Bundle dependency closure with a real isolated
  database and actual-package FINAL/lifecycle tests. An executable content boundary
  failure blocks the route; it is not permission to publish.
- Presentation: narrow existing CSS/design-doc allowance with frontend lint/types/build,
  plus any selected visual/accessibility acceptance.
- Frontend: UI source changes without measurement runtimes/scorers, persistence engines,
  backend/API/schema, dependencies, shared configuration or CI changes. Keep lint/types,
  full frontend regression, production build, unchanged backend build for real API
  acceptance, full existing main browser scenarios, frontend image/security/CSP checks,
  CodeQL, and selected media/visual acceptance. Do not run unrelated backend full
  regression or backend image builds.
- Content + frontend: union of both selected routes.
- Platform/migration/unknown: existing full backend regression, guarded isolated database,
  independent performance SLA, frontend, browser, Docker and CodeQL. Schema/runtime/ops
  changes also select recovery/upgrade acceptance. CI changes and non-regular Git changes
  conservatively use this route.
- Draft PRs: compile/types/mini contracts as appropriate; no full browser/visual/ops
  acceptance until Ready, unless force-full or an explicit manual run is requested.

The complete NUL-delimited Git diff includes deletions and both sides of moves. Scope
comes from reviewed code and versioned acceptance scopes, never a PR title/label.
Unrecognized classification or flags fail closed. force-full can only strengthen checks.
Tests enforce classification and aggregate failure behavior.

## Execution capacity

The default hybrid profile uses one Linux X64 runner with the dedicated
**eduk12-win-ci** label. Do not place that label on multiple active runners sharing a
Docker daemon, ports or temporary paths. Other historical runner labels do not select
heavy work. Use a dedicated CI Linux VM/WSL environment and account without production
credentials or personal mounts.

Heavy jobs are serialized by that single runner, including manual performance jobs.
Retain real PostgreSQL/Redis job-local services and guarded migrations. Before starting
applications, capacity preflight reads visible cgroup ancestor limits (not only WSL total RAM) and rejects insufficient resources or occupied API/preview
ports; it does not kill unrelated processes or prune data. Retain each workflow's cleanup,
and inspect interrupted jobs for leftovers before retrying. Parallel runners require
separate disposable environments and measured memory capacity.

The optional Mac light runner uses labels self-hosted/macOS/eduk12-mac-ci. Enable only
after validation with CI_MAC_LIGHT_ENABLED=true. It handles lightweight frontend
lint/types/presentation builds and mini contracts; default heavy fallback is intentional
until this runner exists. Full frontend tests and browser matrices remain on Linux.

Hosted Ubuntu runs scope, aggregate, publication review checks and platform CodeQL.
Frontend CodeQL uses the heavy runner to conserve allowance. CodeQL coverage is retained.
Runner resource measurements, not core count alone, determine future parallelism.

CI_RUNNER_PROFILE=hosted or an explicit manual runner_profile=hosted selects hosted
Linux for a controlled diagnostic run. Hybrid does not automatically fall back when
a local runner is offline. Unknown profiles are rejected by routing.
Never rerun a historical workflow revision to validate the new runner policy.

External PRs are not admitted to the self-hosted route. Public/untrusted contribution
support requires a separate reviewed isolated workflow; do not expose a personal runner
by removing the admission guard.

## Acceptance and artifacts

Versioned acceptance-scopes.json selects reusable browser/media/visual/PERF/ops gates.
They are called by the same main run, so their outcomes are aggregated. Standalone manual
debugging remains supported. Full independent visual acceptance is skipped for all Drafts.

Backend/frontend consumers download only this run's exact github.sha artifacts.
No cross-run/latest-success fallback, database state, node_modules or native binaries
are shared. Each consumer installs its own dependencies and Prisma client and keeps
independent services/fixtures. Missing artifacts fail closed.

Visual UI-lab acceptance has different build flags and deliberately builds its own
frontend. Native video acceptance uses production preview rather than relying on dev
transforms. Manual consumers can build locally at their exact checked-out revision.

CI verifies source; CD deploys verified artifacts under DEPLOYMENT-CHECKLIST.md.
No workflow here deploys production. Content edited through the application without
a Git change needs business publication validation, not an unrelated source build.
Content compiled into the backend still requires that deployment unit to be built and
scanned; do not invent hot publication to bypass immutable releases.

## Budget and rollout

Plan hosted budget at about 3 minutes for content/UI controls and reserve about 14 minutes for
platform controls plus CodeQL, not an exact billing guarantee. Account usage, publication
verification, shared repositories, artifacts and caches are measured separately.
Keep evidence short-lived and retain release evidence under its existing policy.

Validate the new routing tests and all workflow syntax first, then one exact-commit
hybrid full run. Compare test counts/critical non-skipping assertions, source/build
identity and permissions rather than weakening SLA thresholds. Verify the optional Mac
runner before enabling it. Do not merge with a required gate still pending/failed.

## Initial environment verification (2026-10-05)

The first Windows audit found one runner with the dedicated label (runner 25), a 10 GiB
WSL allocation but a 5 GiB systemd service limit. The heavy preflight requires at least
6 GiB effective memory; this service is not ready until its limit is deliberately adjusted.
Other runner services and local application containers have subsequently been stopped
under the user's separate authorization; images and data volumes were retained.
Recheck runtime state before a full run. Do not treat this dated note as current inventory.
The Mac runner remains disabled; its personal developer account and production SSH key
must not be used as an automatic CI account.

MEDIA-7's isolated fixture repair is reused from the existing local QA commit fe3bf7eb.
It creates its own explicitly selected test configuration rather than expecting or
publishing a DRAFT scientific seed. The seed remains DRAFT; production is not touched.

Billing baseline was checked against
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions):
self-hosted execution does not consume hosted compute minutes; artifacts and caches
retain their separate storage accounting. Budget estimates exclude local execution time.

A 500-minute remaining allowance can provisionally allocate 180 minutes to 60 content/UI
or Draft runs, 210 minutes to 15 platform validations, 50 minutes to post-merge/manual
diagnostics and 60 minutes to failures and release contingency. This is a planning mix,
not a limit on actual runtime; check usage after the first measured runs. Job timeouts
are emergency ceilings, not expected or promised billing durations.

The execution topology is:
GitHub scope → optional Mac light checks (otherwise Windows) → Windows serial build,
regression, database/browser/image and selected acceptance jobs → GitHub aggregate.
Platform CodeQL can overlap on GitHub; UI CodeQL queues on Windows. Different database
jobs recreate their own PostgreSQL/Redis services and never share mutable test state.
