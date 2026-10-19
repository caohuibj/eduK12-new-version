# PR314 CI corrections

## AppShell Cognitive OFF assertion

Run [39183230206](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206), head `c2e329d0535500386016e33b82644ef7e389fe50`, failed in [AppShell viewport input accessibility](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206/job/117840490493): the old test expected the unavailable notice on `/student/cognitive/history`.

C10 explicitly disables new admission and the Cognitive home while keeping authenticated historical deep links available under their original authorization. `App.tsx` applies `CognitiveCapabilityRoute` to `/student/cognitive`, not the history route. The qualified C10 OFF history HTTP evidence also includes `GET /cognitive/history`; see `c10-cognitive-switch.md` and `evidence/c10-history-tested-01.mjs.txt`. The stale browser expectation contradicted that accepted contract.

The correction changes only `server-version/e2e/app-shell-browser-e2e.cjs`: assert the unavailable notice at the gated home; retain hidden navigation; then visit the OFF history deep link, require its real heading and empty-list state, verify its mocked history GET, reject all non-GET requests and page errors, and capture both screenshots. No product capability, authentication, admission gate or test selection changes.

The failed artifact `12157151125` contains twenty earlier viewport screenshots and `preview.log`, but no failed-case DOM or screenshot. Its old assertion failure is retained; visual evidence for the corrected cases is pending the official browser execution. Local verification is limited to Node 24.21.0 syntax and `git diff --check`; no browser run or backend tests are claimed. Exact file binding and commands: `ci-evidence/pr314-app-shell-static-validation.json`.

## Workbench submission label

The same run's visual jobs failed at `qa-round5-workbench-browser-e2e.cjs:55`: [Chromium 117840490453](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206/job/117840490453), [Firefox 117840490553](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206/job/117840490553), and [WebKit 117840490557](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206/job/117840490557). Each captured DOM body shows `已交卷 · 质量受限 · 2026/10/7 09:00:00`, with `pageErrors: []`, while the old assertion waits for `已完成 · 质量受限 ·`.

The fixture status is still `COMPLETED`, quality is `limited`, and submission count is 2. C06 deliberately separates submitted attempts from task satisfaction (`c06-consumer-satisfaction.md`). `AssessmentWorkbench.tsx` maps `COMPLETED` to `已交卷`, separately displaying `SATISFIED` / `NOT_SATISFIED`; its existing `AssessmentWorkbench.satisfaction.test.tsx` verifies those independent counters. The captured DOM also shows submitted 2 and satisfied/unsatisfied 0. This is a stale display expectation, not a changed lifecycle result.

The correction changes only that exact expected label to `已交卷`, without accepting both labels or changing fixture facts, quality, report-href authorization, viewport, mutation, approval, or deferred-feedback checks. Syntax and diff checks passed; official execution of the corrected shared test in all three browser jobs remains pending. Binding: `ci-evidence/pr314-workbench-static-validation.json`. Original failure artifacts: Chromium `12156978663`, Firefox `12156349157`.

## Complete merge-gate input transport

The final [merge-gate job 117843033195](https://github.com/caohuibj/eduK12-new-version/actions/runs/39183230206/job/117843033195) failed before checkout could start Node: `Argument list too long`. The job-wide `NEEDS_JSON` carried the whole 34-job needs object, including a 421,829-byte release-plan string; the reconstructed pretty JSON is 457,626 UTF-8 bytes. This was a separate transport failure, not a successful evaluation of failed required jobs.

Only `ci.yml`, `merge-gate.mjs` and the existing topology tests change. The job environment carries a unique `RUNNER_TEMP` file path. After checkout/setup, a runner-generated Node script writes the complete double-JSON-serialized string literal to an exclusive mode-0600 file. It never evaluates a shell interpolation or JavaScript template string from changed paths. A 4 MiB bound rejects oversized data; the reader rejects missing, malformed, non-object, non-regular or symlink input and does not fall back to an environment payload when a configured file is invalid. Existing callers without a file path retain their existing JSON environment interface. No job result, scope field, plan byte or required check is removed; selected-result evaluation and source-plan recomputation are unchanged. The old frozen Training Python consumer reads its own API evidence and does not consume this environment variable, so it is unchanged.

Actual verification: 78 routing tests passed; YAML, syntax and whitespace checks passed. The first topology run had 12 passes and one failure because the new synthetic platform fixture omitted mandatory flags; completing that test fixture made its targeted rerun pass. This is 13 distinct cases reaching pass across two executions, not a clean single full-suite run. The targeted test executes the actual workflow writer with a >128 KiB payload, hostile quotes/backticks/newlines/shell substitutions, exact-object comparison, short-environment Node/CLI launches, mandatory-failure preservation and exclusive-write/oversize rejection. The other new test rejects invalid file inputs without a success fallback. Receipt: `ci-evidence/pr314-gate-transport-static-validation.json`. Official new-head execution remains pending.

### Pre-push context correction

Root review caught that `runner.temp` is unavailable in job-level `env`. Removed that expression before pushing: the materializer now resolves `RUNNER_TEMP` inside its Node step and exports only the short pathname through `GITHUB_ENV`. The complete payload remains in the exclusive mode-0600 file. The topology regression executes the actual materializer and consumes its exported pathname; all 13 cases passed on Node 24.21.0 (2026-10-19). This is local contract evidence, not a claim of a successful new GitHub run.

### CodeQL bounded execution budget

The original successful run 39183230206 required 11m36s of the 12-minute job budget. Runs 39186199340 and 39187305565 were cancelled at that bound; the former was still progressing through 80/89 queries immediately before cancellation. Increase only this job's deadline to 20 minutes. Keep the same query selection, paths, CodeQL action, two threads, 3500 MiB analysis budget and mandatory success gate. No cancelled run is accepted as a pass. Formal analysis at the new head remains required; no production configuration changes.
