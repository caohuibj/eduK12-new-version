# Cognitive intake CI contract

This control change adds selected Cognitive validation to the existing
`ci.yml` → `scale-onboarding-boundary.yml` content workflow. It does not install,
publish, assign, save reports, archive raw data or deploy a Cognitive task.
The workflow/skill version is 0.1.2. Project copies must pin their source commit;
the Git version is authoritative. The six workflow/template documents originate
from `d84fa27319142674ca916d6b336c9d9c4c846b75`; no pilot source or content branch
is merged by this control change.

## Scope and execution

The dependency-free `cognitive-intake-scope.mjs` reads the complete raw Git diff,
ordinary modes, exact HEAD and clean tracked worktree/index. It reads actual
base/head task-package declarations. Untracked work is preserved. Existing
acceptance suites cannot disappear or be replaced; newly declared suites must
belong to that task. Existing identities cannot disappear.

| Actual changed input | Selected behavior |
| --- | --- |
| Existing task `seeds.ts`, `participant-presentation.ts`, `governance.ts`, `scientific.ts` | `data`: reuse the existing `isDataModule` TypeScript AST guard, then validate real selected consumers |
| Existing task backend top-level `.ts`, exact package JSON, fixtures JSON or task notes | `task`: real selected behavior plus affected type roots; never described as declaration-only |
| The six fixed backend generated files, alongside selected task input | Real manifest `--check`; TypeScript generation inputs remain in applicable CodeQL scope |
| Frontend runner/UI/stimulus, new task/engine/frontend binding or generated runners | `UNSUPPORTED_SELECTED_BROWSER`; no generic selected real-browser contract currently exists |
| Native `content-candidates` or native runners without registered task-package support | `UNSUPPORTED_NATIVE_CANDIDATE`; no fabricated package admission |
| Selected-task input mixed with shared/schema/permissions/DB/dependencies/control or other domains, deletion, link or executable mode | Explicit refusal; no automatic whole-platform fallback |

Pure shared changes outside an intake candidate retain their original route;
they receive no task-prefix exemption. The existing Scale lane is retained.
The three content jobs are mutually exclusive; mixed light inputs are refused.
Selected Cognitive runs start no PostgreSQL, Redis, Docker, whole Cognitive
regression or whole frontend typecheck. Rights/scientific maturity remain
annotations and existing separate decisions, not new automatic gates.

The selected workflow recomputes scope before dependency installation, installs
the unchanged backend/frontend lockfiles once without hooks, then runs:

```sh
env -u DATABASE_URL node .github/scripts/cognitive-intake-check.mjs
```

It uses `NODE_ENV=test`, `COGNITIVE_MODULE_ENABLED=true`,
`VITE_COGNITIVE_MODULE_ENABLED=true`, `BACKGROUND_WORKERS_ENABLED=false`, `TZ=UTC`
and exact `COGNITIVE_INTAKE_BASE_SHA` / `COGNITIVE_INTAKE_HEAD_SHA`.
`COGNITIVE_INTAKE_REPORT_DIR` contains the command/input/exit, original child
JSON and Vitest reporter, type roots/import trace and all compiler diagnostics.
No diagnostic filtering converts a failing compiler run into success.

The CLI retains `<task>`, `--all`, `--json`, `--content-only --base` and adds:

```sh
cd server-version/backend
npm run cognitive:onboarding-check -- --tasks reaction --json
npm run cognitive:onboarding-check -- --tasks-json '{"tasks":["reaction"]}' --json
```

These commands execute tests and scorers. `--content-only` does not disable
execution. Selection flags are caller intent, not Git scope evidence. Empty,
unknown, duplicate or mixed selections reject the whole batch. Legacy JSON
remains one decision per line. Batch JSON has kind `cognitive-onboarding-batch`,
exact selected tasks/identities, global checks, identity results and decisions,
`selectionIsScopeEvidence=false` and a truthful exit code. Global manifest and
dependency checks run once; shared frontend suites are deduplicated once. Each
identity retains contract, readiness, presentation and executable scorer/fixture/
report validation; one identity's exception does not erase another's result.

The root executor requires nonempty exact identity coverage and actual PASS
for every mandatory stage and exact frontend suite set. Exit zero, empty JSON,
partial output or legacy NDJSON cannot qualify. DOM acceptance is deterministic
component evidence and does not establish a real-browser/visual/timing result.
The existing dependency parser identifies runtime consumers, and TypeScript
resolves their full forward type closure. Data roots are actual changed
declarations; task roots cover selected backend task sources.

## Formal gate and control PR

The stable `merge gate / ready PR` recomputes actual Git scope even if both
emitted Cognitive flags are missing/false. It requires current content and
applicable CodeQL success for selected intake. Missing, failed, cancelled or
skipped checks cannot qualify. Unsupported browser/native scope stays blocked.
An old/focused PASS is never substituted for the current required candidate.

This control PR itself is exact `release-tooling`: only named control/document
paths qualify, and only the exact Cognitive CLI is excluded from backend
application fingerprints. Unknown backend files do not qualify. Release-tools
dependency preparation and selected recipes share `cognitiveIntakeToolingInputs`;
input binding includes the Cognitive helper directory. CodeQL retains its
existing required gate and also scans the non-`.github` checker TS and Cognitive
CJS helpers/tests. Selected task CodeQL includes actual changed generated TS.

## Recorded local development validation

The isolated executor probe was `490179e0737a3b46c65517d61093a8d6662ee934` →
`27a65fc9a404aad9b7004073ce8dbee175091047`. Its only application difference was
a comment in existing reaction seeds; the probe commit is not merged or pushed.
Node 24.21.0 executed the real root once: reaction engine 1.0.0 with scorers
1.0.0 / 1.1.0, fixed existing fixtures, all four identity stages, one manifest
check, one dependency guard and the two declared DOM suites (17 assertions).
Types rooted at reaction seeds and its generated direct consumer had 72 files,
no backend source outside Cognitive, and no diagnostics. The changed CLI's own
single-root compiler check also passed with all diagnostics retained. Existing
installed package versions matched their unchanged lockfile versions; this is
local development evidence, not a signed environment or formal CI result.

Control tests cover complete real Git diffs, hostile/missing flags, native and
browser refusal, task-prefix disguises, exact batch stages and VM execution of
the real CLI orchestration. Original local syntax/test-fixture failures remain
recorded separately; affected failures were repaired and rerun specifically.
The three workflow files passed actionlint 1.7.12. Formal run/head/outcome is
recorded in the PR; this document does not grant merge eligibility by itself.

DRAFT installation, PUBLISHED configuration, PUBLIC visibility, allocation,
report persistence and COS archival remain separate facts. Cognitive publish
does not take a `proofHash` and does not turn GRANT into PUBLIC. No production
DB, permission/schema, content release or deployment change is authorized here.
