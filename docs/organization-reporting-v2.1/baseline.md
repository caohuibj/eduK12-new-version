# Organization / Reporting V2.1 — G0 Baseline

Status: G0-C1 evidence baseline
Verified at: 2026-09-18T23:39:39+09:00
Repository: `caohuibj/eduK12-new-version`

## Repository baseline

- `main`: `b273915e36b8773448e1b168dcfe18e1e974a531`
- `main` currently reports `protected=false`.
- Required status checks enforcement is off; configured contexts/checks are empty.
- Repository rulesets endpoint returns `[]`.
- The current main commit is the merge of PR #115 (`RA-02: relational product integration`).
- A successful `push main` CI run is only the post-merge compile smoke; it is not a substitute for a Ready-PR Full Gate.

## Real Ready-PR inventory

Reference Ready PR: #112, `chore(release): define V1 Pilot baseline and closeout policy`.

- PR state: OPEN, ready (`draft=false`)
- PR head: `6acc01e8ac8a0e5778ef43a0143a0a98c6f20e29`
- PR recorded base: `d8a04af3211c9fe9092bd948ad9043cd7b591b50`
- Candidate test merge SHA reported by GitHub: `4d9020f4b5bf2c40c0cdfbbd51b3f2f3c9aca364`
- Full-Gate reference workflow run: `CI #993`, run id `35168541171`
- Workflow/application source: GitHub Actions / workflow `.github/workflows/ci.yml` (`name: CI`)

Observed Ready-PR job/check names on the reference head:

1. `backend (ci + migrate + build + full regression)` — success
2. `frontend (lint + typecheck + full tests + build)` — success
3. `browser (seeded Situational Bundle + static visual acceptance)` — success
4. `docker (compose config + production builds)` — success
5. `codeql (javascript/typescript SAST)` — success

Expected-but-not-applicable jobs on a Ready PR are present as skipped checks:

- `PR light / backend compile`
- `PR light / frontend lint + typecheck`
- `main / post-merge compile smoke`

There are no legacy commit-status contexts on the reference head (`statuses=[]`); the merge inventory is represented by GitHub Actions check runs.

## Event matrix before G0-C2

| Event | Draft state | Current behavior | Merge-readiness meaning |
|---|---:|---|---|
| `pull_request: opened` | draft | PR-light backend/frontend only | not merge-ready |
| `pull_request: synchronize` | draft | PR-light backend/frontend only | not merge-ready |
| `pull_request: reopened` | draft | PR-light backend/frontend only | not merge-ready |
| `pull_request: ready_for_review` | ready | Full backend/frontend/browser/docker/CodeQL | candidate Full Gate |
| `pull_request: opened/synchronize/reopened` | ready | Full backend/frontend/browser/docker/CodeQL | candidate Full Gate |
| `workflow_dispatch` | n/a | Full backend/frontend/browser/docker/CodeQL | explicit verification/debug only |
| `push: main` | n/a | `main / post-merge compile smoke` only | post-merge integrity smoke, not Full Gate |

## G0-C1 conclusion

The repository has a real, reproducible Ready-PR Full Gate, but there is no single fail-closed aggregate context and no protected-main enforcement. G0-C2 must add one lightweight aggregate that treats every required dependency as successful only when its conclusion is exactly `success`. G0-C3 must then require that aggregate on `main` and enforce pull-request-only integration without ordinary direct/force pushes.
