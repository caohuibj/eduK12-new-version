# CI scenarios, topology and validation

GitHub Actions coordinates all jobs. `merge gate / ready PR` is the stable required
check. Every selected check must succeed; missing, skipped, failed or cancelled
selected jobs never grant merge readiness. CI does not deploy production.

## Scenarios

Classification uses the complete Git diff against the PR base, including deletions,
moves and file modes. Titles and labels cannot weaken coverage. Mixed changes select
the union of applicable checks; unknown, schema, algorithm, authorization, dependency
and unscoped CI changes select the full platform route. Malformed classification fails closed.

- **Light content:** existing declarative instruments, norms and report content.
  Retain immutable/scientific/publication rules, declaration AST boundaries,
  all-Bundle closure, actual isolated-database import/scoring/report/FINAL and
  historical/revocation lifecycle checks. JS/TS declarations also select CodeQL.
  Executable behavior in a declaration must fail validation. Content compiled into
  a deployment unit still requires that unit's normal build and security scan.
- **Frontend test-only:** changes exclusively to existing ordinary UI `.test.ts(x)`
  or `.spec.ts(x)` modules use the full frontend lint/typecheck/audit/Vitest
  component but do not start production builds, Docker/Trivy, backend regression,
  browser acceptance, mini-program checks or CodeQL. This never admits runtime
  modules, sensitive Cognitive/assessment modules, fixtures/harness changes,
  altered file modes, deletions, other file types, or mixed changes. A malformed
  scope result or missing frontend success fails the stable Merge Gate.
- **Medium frontend:** ordinary UI functions without API, shared measurement,
  permission, persistence or database changes. Run frontend lint/types/audit/full
  regression/build, real API browser acceptance, the frontend image/scan and all
  affected UI/media acceptances. Content plus UI retains both sets of checks.
- **Standalone maintenance:** the exact allowlists under
  `server-version/scripts/attachment-backup/` and `server-version/scripts/host-ops/` select Node 24 deduplication,
  authenticated-index and cleanup-guard tests, host launcher/restore-volume guards,
  shell/systemd validation, and an isolated Docker launcher/failure-cleanup smoke.
  No backend dependency installation, database services, application build, visual
  browser or whole-platform CI is needed. Its coordinated routing tests and policy
  files may accompany these component changes; CI-only changes are not admitted by
  this shortcut. Draft and ready PRs both require actual maintenance job success.
  Unknown scripts, deletions/symlinks, dependency/application/DB/Compose changes and
  the existing restore workflow remain outside this allowlist. Forced-full still
  strengthens the route when explicitly selected.
- **Heavy platform:** full frontend/backend/mini, production images, all media,
  all three visual browser engines, performance, recovery and CodeQL checks.
- Ordinary engineering documentation has a narrow allowlist; scientific,
  publication and deployment documents retain their content/platform checks.

Management-UI content publication without a Git change uses application publication
validation. A server release is separate from WeChat mini-program publication.

## Current CI routing: GitHub-hosted only (public repository)

The repository is public. All automatic PR CI, post-merge smoke, manual component probes,
full acceptance, standalone visual/media/browser checks, scientific content gates, CodeQL,
Docker image scans, performance and Ops recovery workflows execute exclusively on
**standard GitHub-hosted `ubuntu-24.04` runners**. No workflow schedules the
former Mac or Windows/WSL runner labels, and reusable workflow jobs themselves are
pinned to `ubuntu-24.04` so stale callers cannot reactivate local execution.

The old repository variables `CI_RUNNER_PROFILE=local` and `CI_MAC_LIGHT_ENABLED`
no longer influence routing. The main manual CI dispatch offers only `hosted`;
`runnerPlan` accepts legacy `speed`, `economy`, `local`, `balanced` and
`hybrid` arguments solely for compatibility and normalizes them to `hosted`.
Remove obsolete repository variables when convenient; no Settings change is required
to make the new committed workflows use Hosted runners.

Standard hosted runner *compute minutes* are free for public repositories under
GitHub's published Actions billing rules. Standard resource limits, concurrency
quotas and artifact/cache storage limits still apply; larger hosted runners are
not selected. Re-check the policy if repository visibility or GitHub terms change.

Jobs retain the existing conditional scope/classification rules: light content,
medium frontend, maintenance and full platform tests remain distinct. A ready heavy
platform PR still requires the original backend/frontend regressions, real-API
browser, all three visual engines, grouped media, Docker scans, CodeQL, performance,
recovery, mini-program and merge gate. No checks are waived because jobs are hosted.

Fork PR admission is **unchanged**: the main CI still requires same-repository PR
source until an independent trust-model review approves safely testing forks.
Production secrets and production database access are never exposed to public CI.

The full acceptance graph now permits independent hosted jobs to run concurrently.
Full real-API browser acceptance is partitioned into **foundation**, **products** and
**security** groups. Each checks the same immutable backend/frontend build
artifacts in isolated GitHub-hosted VMs with disposable PostgreSQL/Redis;
all three are mandatory for a successful aggregated browser job. Matrix inputs
are validated against an exact list; missing or duplicated groups fail closed.
Browser evidence artifact names include the group to prevent collisions.

Only proven-unaffected checks are skipped; no cross-commit CI evidence is reused.
The exact-run artifact contract and isolation checks below remain authoritative.

### Hosted critical-path and dependency-download policy (2026-10-09)

Frontend lint/typecheck/audit/full regression, Docker production builds and HIGH/CRITICAL
scans, performance fresh-accounting and Ops recovery can start after deterministic scope
classification; none consumes an unrelated backend/front-end job's build artifact.
Each is still independently required by the fail-closed merge gate. Real-API browser,
grouped media acceptance and visual consumers continue to wait for exact-current-run
backend/frontend artifacts and verify their provenance. This reduces the critical path
without reusing a previous commit's result.

The two media groups retain complete scenario assertions and independent fresh
PostgreSQL/Redis service state. Lockfile-keyed npm/Chromium *download* caches are
allowed; node_modules, databases, built products and cross-SHA artifacts are not.
Break external media dependency setup into individually named, bounded steps. On
registry/apt/browser install timeout, fail the job and diagnose the individual step;
never skip media scenarios, loosen scoring/security checks or label timed-out steps
as passed. Scope-based skips remain limited to proven unaffected surfaces; mixed
permissions, DB, runtime and CI edits still select full-platform validation.


## Build and scenario isolation

Build artifacts belong to this run and exact checked-out SHA. The manifest verifies
SHA, run ID, lockfile, build kind and content digest. Consumers fail closed on a
missing or mismatched artifact. No latest-success or cross-run fallback exists.
Ordinary production and UI-lab builds have distinct names and manifests. In heavy
`speed` runs, both production and UI-lab builds run in parallel on GitHub,
so compilation does not delay Mac checks or hosted browser consumers. Light and
medium builds remain local. The initial producer probe measured 44 seconds for
the hosted UI-lab job while the Mac production build took several minutes; final
run measurements remain authoritative. Native
`node_modules` are never transferred between Mac ARM and Linux x64.

Production images retain complete Dockerfile builds and HIGH/CRITICAL scans. Buildx
pulls base images and bypasses runtime-stage caches so OS security updates are not
hidden by a persistent application build cache.

Media scenarios share dependency/browser installation and compiled artifacts inside
two groups. Each scenario receives a freshly created `ptool` database and empty Redis
state inside the current Actions job's pinned disposable service containers. Reset
requires actual matching job service IDs, exact synthetic loopback URLs, test mode,
expected images and anonymous volumes. Foreign containers, bind mounts and named
persistent volumes are rejected. Ports must be free between scenarios. Existing
fixture guards, test assertions and individual evidence remain mandatory. Standalone
media workflows invoke the same composite scenario actions as grouped validation.

Pure UI uses a minimal lockfile-pinned Playwright runtime, without backend packages,
PostgreSQL, Redis or Docker on Mac. Hosted Chromium retains canonical/staff/classroom
screenshots, interaction and legacy-dialog checks; Firefox and WebKit retain their
complete interaction and legacy-dialog suites. AppShell remains explicitly gated on Mac. In speed mode all three visual engines run
on GitHub; economy and medium routes keep visual acceptance on Mac. The QA round 3 component browser flow runs on Mac
with its synthetic local APIs; real authorization and scoring remain covered by
the independent backend/database gates.

## Resource and cleanup policy

Every active CI job uses an ephemeral standard GitHub-hosted Ubuntu VM. The existing
runner preflight observes disk/memory but its special self-managed-host constraints
are not needed on these ephemeral machines. Heavy Docker CI keeps its 3 GiB
minimum-free-space guard and may reclaim only regenerable *local build cache*
in that CI VM. Never prune production data or persistent host services.

Isolated PostgreSQL/Redis containers, temporary credentials, bounded browser
artifacts, SHA-scoped build manifests and job-specific cleanup remain mandatory.
`npm ci`, pinned images, vulnerability scan thresholds, signature checks and
`PERF_CAPACITY_QUALIFIED=0` for Phase 0 evidence are unchanged.

Legacy Mac cleanup utilities and old self-managed runner references in historical
records may remain in the repository as inert code/evidence; no Actions job runs
on those machines after this change.

### Beijing production host: download and maintenance notes

The production server is in Beijing. Server maintenance, release builds and local
runner downloads must default to verified mainland mirrors or the existing
controlled acceleration path. Use the configured Tencent container registry
accelerator, `https://registry.npmmirror.com` for npm/native binaries, Tsinghua
`debian`/`debian-security` for Debian, and the verified
`https://mirrors.aliyun.com/alpine` source for Alpine security updates. The official
Alpine CDN was slow inside the release builder; the Tsinghua Alpine endpoint
returned HTTP 403 in that same container, while Aliyun served the signed index.

Keep package/base-image versions, lockfile integrity, official package signing
keys, TLS verification and HIGH/CRITICAL scan thresholds. Continue runtime security
updates before scanning the actual production image. A mirror change must not
skip upgrades or audits; use the official audit endpoint if a package mirror does
not implement auditing. If a mirror is unavailable or stale, record that evidence
before using a trusted official fallback. Verify the affected download/build and
original security scan before release; no unrelated full CI is needed for an
operator download setting. Preserve the immutable source checkout and record
operator recipe hashes, mirror URLs and actual image IDs in the release proof.


## Failure handling and rollout

Diagnose a failure, fix it, and run the affected component and necessary targeted
regressions with the same implementation/dependencies/parameters/isolation as the
formal gate. Do not use full CI as the first verification or relax timeouts,
assertions, authorization boundaries or scan thresholds to obtain a green result.

The hosted-only CI workflow exposes `step_probe` values for frontend, backend,
backend-regression, targeted reporting, browser, media, UI, hosted Chromium UI, QA component UI, Ops, performance, images and Cognitive checks.
The `assessment-repair` probe runs the shared R5 regression selector, including
task-controller admission and collection snapshot completion fixtures, so the
focused gate catches filter-export and draft-before-publication contract drift.
It requires
non-skipping Questionnaire, Bundle, onboarding, SJT and anonymous-study PostgreSQL
evidence. All backend regression, browser, media, visual and maintenance probes use standard
GitHub-hosted Ubuntu 24.04 runners, regardless of legacy profile inputs.
Probes invoke the formal reusable components and only their build prerequisites;
they disable normal classification/full jobs/CodeQL/merge readiness. Different probe
kinds have separate concurrency groups. A successful probe is not a full merge gate.

Regression jobs clear their exact temporary report paths before setup, so a
previous or interrupted job cannot upload stale test evidence.
Self-hosted regression uses its existing local npm download cache; remote npm
cache restore/save is limited to GitHub-hosted jobs. Lockfile installation, actual
tests, non-skipping assertions, artifacts and service cleanup are unchanged.

Keep integration work Draft during repair and probes. Freeze the combined functional
and CI head, verify every affected component, then run one final complete gate.
Same-source failed-job retries may preserve already successful jobs; changed source
or validation inputs require renewed relevant verification. Two independent PR green
results cannot prove their combined source. Main performs the normal post-merge
integrity smoke without duplicating an already validated complete source tree.

Standalone attachment timers can be enabled after the exact component head passes
maintenance CI and a bounded production check. This is separate from deploying the
application or database. Preserve `plan_only`, prior backup dependencies and
resource limits; automatic deletion is not part of the current component. A failed
unrelated application dependency audit does not redefine this host-only gate.
When the user pauses full CI, continue independent component validation without
starting full CI or presenting local results as a whole-platform pass.

The exact host-ops backup wrapper/config/installer/transport files additionally
select real encrypted DB backup/restore against a labelled disposable PostgreSQL
16 database and checksum-failure anonymous-volume cleanup. These wrappers reuse
the deployed backup/restore source unchanged and cannot restore production, write
the media bucket or delete cloud backups. They retain the maintenance route; old
backup/restore source edits, new unknown executors and application changes still
escalate. Local retention needs two verified cloud-backed restored copies; cloud
retention remains plan_only. Host backup installation is independent of deploying
the application and requires exact-head maintenance success plus bounded COS and
production verification.

External/untrusted PRs are blocked by the existing source-admission policy. CI jobs must
not read production SSH keys, environment files, encrypted-backup keys or personal
data. Required database suites retain non-skipping report assertions.

The explicit `server-version/scripts/cos-cleanup/` file allowlist adds the protected
version deletion component to maintenance. Unknown executors and mixed business,
database, dependencies or Compose paths remain outside this route. It adds historical
authenticated index scanning, retained DB/attachment reference closure, bounded
version deletion protocol, real encrypted filesystem transaction/checkpoint recovery,
host dual-writer locks and failed-task isolation checks. CI has no production COS
credentials; SDK tests are not evidence of live cloud deletion. A separately bounded
unique-prefix synthetic COS probe validates the same adapter's actual version deletion.
Production is plan-only until real joint recovery acceptance, independent deletion
identity and guarded backup writers are deployed; this is independent of application
deployment. Never trigger full acceptance to verify this component.

## CI trigger audit (2026-10-06)

Manual runs default to `full_acceptance=false`. Select a `step_probe` such as
`maintenance`, `cognitive`, `frontend` or `backend` for independent validation.
A manual request with no probe and no explicit full acceptance fails at the router,
before any platform jobs start. Automatic PR classification still uses the complete
Git diff. The router logs `platformReasons`, including each excluded path and file
mode/deletion escalation. The repository currently has no `CI_FORCE_FULL` override.

| Change | Selected checks | Escalation examples |
| --- | --- | --- |
| Versioned Scale instruments; existing Cognitive seeds/presentation/governance/scientific declarations; SJT instrument/publication/scientific JSON; exact Bundle content | Domain contracts, immutable/publication reviews, declaration boundaries, affected regression; all-Bundle dependency closure and isolated import/report/FINAL; TS declarations also select CodeQL on ready PRs | Scorers, task runners, authorization, shared contracts, Prisma, dependencies |
| Known attachment backup and observe-only host monitoring files/config/timers | Maintenance tests, Python guards, shell/systemd syntax, isolated Docker launch/failure cleanup, aggregate gate | New unknown maintenance executors, deletes/symlinks, business code/Compose/DB/dependencies |
| Existing database backup/restore scripts | Currently platform classification, with recovery rehearsal | These are outside the attachment component; a future dedicated recovery route needs equivalent isolated restore evidence before replacing this gate |

Additional causes of platform selection are a content/maintenance change mixed with
an unlisted file (including CI-only changes), content deletions/renames/mode changes,
and an explicit full request. For example Cognitive `task-package.json`,
`definitions.ts`, `semantics.ts` and `package.ts` currently stay outside the
declarative shortcut: they can change task admission, timing or runtime behavior.
The existing `scale/instruments/learning-motivation-wave1-data.json` is an exact
Scale exception: its existing instrument test validates reference data and report
behavior in the Scale lane. Other unlisted root-level data stays outside the
versioned instrument allowlist. A pure metadata exception must be verified against
its consumer and added with boundary tests, rather than widening a directory prefix.

Independent visual/media/Ops/performance workflows are reusable or manual; they do
not separately launch full CI for every PR. Situational publication has a separate
PR/review trigger, but checks its own relevant paths first and retains scientific
publication authority checks. It is a focused integrity check, not platform CI.

An unchanged architecture does not by itself prove a change has a small impact:
shared scoring, permissions, persistence and dependencies can affect many modules.
Use the actual impact and tested file boundaries to choose the gate. Ordinary
content and isolated maintenance do not need platform full acceptance.

## Dependency upgrade route

Version-only changes to existing npm dependencies, development dependency additions
and installed transitive overrides, paired with consistent npm v3 root locks, may
select dependencies CI. Existing backend/frontend test compatibility changes and
coordinated routing policy may accompany a dependency change. scripts, engines,
exports, build configuration, new production dependencies, removals, business code,
DB, Compose, Dockerfiles, unknown files and type/mode/deletion changes stay outside
this route. Unchanged manifests may accompany transitive lock refreshes.

Both draft and ready dependency PRs require maintenance routing/guard tests, backend
build/guarded migration/existing performance checks, isolated full backend regression,
frontend build/lint/typecheck/audit/full regression, production API/worker/frontend
image builds and the existing HIGH/CRITICAL scan, plus CodeQL. Every selected job
must succeed; missing/skipped/cancelled/failed jobs cannot authorize merge. No browser,
visual, media, mini-program or separate Ops acceptance is selected. Existing reusable
components, audit thresholds and image assertions are unchanged. Full requests still
strengthen selection. Main retains post-merge integrity smoke without repeating
component regression. Repeated ready events are unnecessary: publish the frozen head
and make it ready before the initial classification starts when local scoped checks
have already passed.

Production image CI passes the existing `DEBIAN_MIRROR` build argument for API and
worker to `mirrors.tuna.tsinghua.edu.cn`; Debian archive signatures and the existing
runtime refresh/security scans remain required. Frontend/npm sources are unchanged.
The exact two mirror argument/verification insertions in `ci-image-plan.mjs` and its
existing tests may accompany dependencies CI. The router compares the complete
executable file against the PR base after removing only those exact insertions;
other image-plan edits still select platform checks. Validate image-only first.
