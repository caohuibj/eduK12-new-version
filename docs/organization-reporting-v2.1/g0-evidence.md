# Organization / Reporting V2.1 — G0 Evidence

Status: G0-C1 / G0-C2 verified; G0-C3 enforcement is performed only after the bootstrap PR is merged.
Repository: `caohuibj/eduK12-new-version`
Bootstrap PR: #116

## G0-C1 — baseline and exact merge-check inventory

Implementation commit: `bd2dbc068b3029ef5aa1af045f5ea0d9431f0ff4`
Baseline main: `b273915e36b8773448e1b168dcfe18e1e974a531`
Reference Ready PR: #112
Reference Ready head: `6acc01e8ac8a0e5778ef43a0143a0a98c6f20e29`
Reference workflow run: `35168541171` (`CI #993`)

The authoritative inventory is recorded in `baseline.md`. It distinguishes Draft PR light checks, Ready-PR Full Gate, manual Full Gate, and `push main` post-merge smoke. The post-merge smoke is explicitly not accepted as a substitute for Full Gate.

## G0-C2 — fail-closed aggregate merge gate

Implementation commit: `47074fd2f0bc3c1a279a95570dd9af379f47f90e`
Candidate base: `b273915e36b8773448e1b168dcfe18e1e974a531`
Validation workflow run: `35358014401` (`CI #1182`)
Validation URL: `https://github.com/caohuibj/eduK12-new-version/actions/runs/35358014401`

Observed Full Gate results on that exact candidate:

- `backend (ci + migrate + build + full regression)` — success
- `frontend (lint + typecheck + full tests + build)` — success
- `browser (seeded Situational Bundle + static visual acceptance)` — success
- `docker (compose config + production builds)` — success
- `codeql (javascript/typescript SAST)` — success
- `merge gate / ready PR` — success

The aggregate uses `needs: [backend, frontend, browser, docker, codeql]` plus `always()` and rejects every dependency result other than exact `success`.

### G-01 fail-closed policy evidence

The aggregate's `verify fail-closed decision table` step passed on run `35358014401`. The deterministic policy cases are:

| Case | Dependency vector | Expected aggregate decision |
|---|---|---|
| all success | success / success / success / success / success | success |
| backend failure | failure / success / success / success / success | failure |
| CodeQL failure | success / success / success / success / failure | failure |
| dependency skipped | success / success / skipped / success / success | failure |
| dependency cancelled | success / cancelled / success / success / success | failure |
| dependency missing-like value | success / success / success / missing / success | failure |

This self-test verifies the decision function without deliberately breaking expensive CI lanes. The same job then consumed the real five dependency results for the candidate and succeeded only because every real dependency was `success`.

### G-02 candidate freshness evidence

Run `35358014401` proves only candidate `47074fd2f0bc3c1a279a95570dd9af379f47f90e` against base `b273915e36b8773448e1b168dcfe18e1e974a531`.

This evidence-manifest commit changes the PR head. Therefore run `35358014401` is intentionally no longer sufficient for the final PR candidate: the `pull_request:synchronize` event must trigger a new Full Gate and a new `merge gate / ready PR` result for the new head before merge. This is the G-02 acceptance proof that an old green candidate is not treated as validation of a changed head.

## G0-C3 — protected-main enforcement

Required post-bootstrap configuration:

- require pull requests for `main`;
- require status check `merge gate / ready PR`;
- require the branch to be up to date before merging (no merge queue is assumed or enabled by this G0 change);
- block ordinary direct pushes;
- block force pushes;
- record any bypass actor and its permitted use condition;
- read the effective branch/ruleset configuration back and verify it applies to `main`.

The bootstrap PR must pass Full Gate on its final head before merge. Only after the bootstrap PR is merged can the new aggregate context be made the protected required check. G0 is not considered complete until the effective GitHub configuration is read back and recorded as enforced.
