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
- **Medium frontend:** ordinary UI functions without API, shared measurement,
  permission, persistence or database changes. Run frontend lint/types/audit/full
  regression/build, real API browser acceptance, the frontend image/scan and all
  affected UI/media acceptances. Content plus UI retains both sets of checks.
- **Standalone attachment maintenance:** the exact allowlist under
  `server-version/scripts/attachment-backup/` selects Node 24 deduplication,
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

## Recommended speed topology

```mermaid
flowchart LR
  S[Classify and preflight] --> FB[GitHub: parallel production and UI-lab builds]
  FB --> FC[Mac: full frontend checks]
  FC --> UI[Mac: AppShell and reporting component UI]
  S --> BB[Windows: backend build and guarded migrations]
  BB --> IM[Windows: production images and scans]
  BB --> OP[Windows: Ops and performance]
  S --> Q[GitHub: CodeQL]
  S --> R[GitHub: full backend regression, isolated DB]
  FB --> API[GitHub: real API browser]
  BB --> API
  FB --> ME[GitHub: two media groups]
  BB --> ME
  FB --> FF[GitHub: Chromium, Firefox and WebKit in parallel]
  UI --> G[Required aggregate]
  IM --> G
  OP --> G
  Q --> G
  R --> G
  API --> G
  ME --> G
  FF --> G
```

Mac and Windows each retain one job slot. Performance checks run exclusively on
Windows and cannot overlap its image builds. Backend artifact production precedes
other Windows full-gate work so consumers can begin early. Browser consumers wait
for builds, not unrelated lint or frontend regression. The final aggregate waits
for both producers and every required validation.

Profiles are explicit:

| Profile | Hosted heavy work | Local work |
| --- | --- | --- |
| `speed` (recommended) | CodeQL, backend regression, main API browser, two media groups, production/UI-lab builds, three visual engines | Mac frontend/AppShell/component UI; Windows migrations/images/Ops/performance |
| `economy` | CodeQL, backend regression, main API browser | Mac frontend/all visual engines; Windows remaining real-service work |
| `local` (diagnostics) | CodeQL only | Mac frontend/UI, Windows real services |

Light/medium routes do not select heavy hosted acceleration. CodeQL remains on
GitHub when selected. Broad medium UI changes can require all three browser engines
on Mac and take longer than a small medium change. `balanced`/`hybrid` are aliases
for `economy`. Self-hosted outages do not silently activate hosted fallback.

The initial planning target for a warm successful heavy `speed` run is 14–20 minutes
and approximately 48–66 hosted job-minutes. These are estimates, not measured guarantees or job
timeouts. Budget cold starts, isolated rollout probes and retries separately, and
check actual account usage before relying on an old remaining-minute figure.

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

Mac uses the dedicated non-admin `eduk12ci` account and label `eduk12-mac-ci`.
Frontend uses the existing 3072 MiB Node heap and test worker limits. Routing requires
8 GiB disk headroom (5 GiB reserve plus a provisional 3 GiB working allowance), then
the job checks again. Adjust the allowance using measured peaks. UI checks release
preview processes and upload evidence before removing temporary outputs.

Each Mac job removes its frontend/backend/browser `node_modules` and build outputs.
Download caches are bounded: npm 512 MiB, Actions 256 MiB and tools 512 MiB,
with seven-day expiry. Browser installations use the job temporary directory and
are removed after each job; they do not accumulate a persistent browser cache. The existing hourly idle maintenance skips active
Runner.Worker processes, rotates service logs and removes expired CI temporary files.
Interrupted browser installations are covered by the existing idle temporary-file
expiry without modifying the protected maintenance service. Cleanup rejects symlinks and personal
accounts and never globally prunes Docker or retained data volumes.

Windows uses one exclusive `eduk12-win-ci` Linux/WSL runner. Heavy preflight requires
20 GiB free disk and 6 GiB effective memory across every visible cgroup ancestor.
Its validated clock guard remains required before runner startup. Tests use UTC;
host and production business timezones are unchanged. New concurrent heavy slots
require measured memory and separate ports, services and fixtures.

## Failure handling and rollout

Diagnose a failure, fix it, and run the affected component and necessary targeted
regressions with the same implementation/dependencies/parameters/isolation as the
formal gate. Do not use full CI as the first verification or relax timeouts,
assertions, authorization boundaries or scan thresholds to obtain a green result.

The existing CI workflow exposes `step_probe` values for frontend, backend,
backend-regression, targeted reporting, browser, media, UI, hosted Chromium UI, QA component UI, Ops, performance, images and Cognitive checks.
Probes invoke the formal reusable components and only their build prerequisites;
they disable normal classification/full jobs/CodeQL/merge readiness. Different probe
kinds have separate concurrency groups. A successful probe is not a full merge gate.

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

External/untrusted PRs are blocked before any self-hosted checkout. CI accounts must
not read production SSH keys, environment files, encrypted-backup keys or personal
data. Required database suites retain non-skipping report assertions.
