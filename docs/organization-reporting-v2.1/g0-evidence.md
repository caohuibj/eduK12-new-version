# Organization / Reporting V2.1 — G0 Evidence

Status: **G0 complete** — G0-C1, G0-C2, and G0-C3 verified against effective GitHub configuration.
Repository: `caohuibj/eduK12-new-version`
Bootstrap PR: #116
Bootstrap merge commit: `32d03e514ef4fb01bbce8bd9cb64d8122a4f8557`

## G0-C1 — baseline and exact merge-check inventory

Implementation commit: `bd2dbc068b3029ef5aa1af045f5ea0d9431f0ff4`
Baseline main: `b273915e36b8773448e1b168dcfe18e1e974a531`
Reference Ready PR: #112
Reference Ready head: `6acc01e8ac8a0e5778ef43a0143a0a98c6f20e29`
Reference workflow run: `35168541171` (`CI #993`)

The authoritative inventory is recorded in `baseline.md`. It distinguishes Draft PR light checks, Ready-PR Full Gate, manual Full Gate, and `push main` post-merge smoke. The post-merge smoke is explicitly not accepted as a substitute for Full Gate.

## G0-C2 — fail-closed aggregate merge gate

Implementation commit: `47074fd2f0bc3c1a279a95570dd9af379f47f90e`
Initial validation workflow run: `35358014401` (`CI #1182`)
Final bootstrap candidate head: `46e7eb5ed88ae6d9d3b319ee95f1b2a1ff90bebc`
Final bootstrap validation workflow run: `35359113394` (`CI #1183`)
Final validation URL: `https://github.com/caohuibj/eduK12-new-version/actions/runs/35359113394`

Observed Full Gate results on the final bootstrap candidate:

- `backend (ci + migrate + build + full regression)` — success
- `frontend (lint + typecheck + full tests + build)` — success
- `browser (seeded Situational Bundle + static visual acceptance)` — success
- `docker (compose config + production builds)` — success
- `codeql (javascript/typescript SAST)` — success
- `merge gate / ready PR` — success

The aggregate uses `needs: [backend, frontend, browser, docker, codeql]` plus `always()` and rejects every dependency result other than exact `success`.

### G-01 fail-closed policy evidence

The aggregate's `verify fail-closed decision table` step passed on both bootstrap validation runs. The deterministic policy cases are:

| Case | Dependency vector | Expected aggregate decision |
|---|---|---|
| all success | success / success / success / success / success | success |
| backend failure | failure / success / success / success / success | failure |
| CodeQL failure | success / success / success / success / failure | failure |
| dependency skipped | success / success / skipped / success / success | failure |
| dependency cancelled | success / cancelled / success / success / success | failure |
| dependency missing-like value | success / success / success / missing / success | failure |

This self-test verifies the decision function without deliberately breaking expensive CI lanes. The same aggregate job consumes the real five dependency results for the candidate and succeeds only when every real dependency is `success`.

### G-02 candidate freshness evidence

Run `35358014401` validated candidate `47074fd2f0bc3c1a279a95570dd9af379f47f90e` against base `b273915e36b8773448e1b168dcfe18e1e974a531`.

The subsequent evidence commit changed the PR head to `46e7eb5ed88ae6d9d3b319ee95f1b2a1ff90bebc`. GitHub then triggered a fresh `pull_request:synchronize` Full Gate, run `35359113394` (`CI #1183`), and the old green result was not reused. The final head passed the complete Full Gate and `merge gate / ready PR` before PR #116 was merged.

## G0-C3 — protected-main enforcement

Effective repository ruleset verification performed after bootstrap PR #116 merged.

Repository ruleset:

- ruleset id: `23665026`
- name: `PR`
- target: branch
- source: `caohuibj/eduK12-new-version`
- enforcement: `active`
- condition: `~DEFAULT_BRANCH` (current default branch: `main`)
- `bypass_actors`: `[]`
- `current_user_can_bypass`: `never`

Effective rules:

- `pull_request` — changes to the protected default branch must go through a pull request;
- `required_status_checks` — exact required context: `merge gate / ready PR`;
- `strict_required_status_checks_policy: true` — candidate branch must be up to date with the target branch before merge;
- `non_fast_forward` — force/non-fast-forward updates are blocked;
- `deletion` — protected branch deletion is blocked;
- no merge queue rule is enabled by this G0 configuration.

The branch readback reports `main` as `protected: true`. Its nested legacy branch-protection summary can still show legacy enforcement fields as off because enforcement is supplied by the active repository ruleset above; the effective repository ruleset is the governance authority for this G0 configuration.

No bypass actor is configured, and the connected current user reports `current_user_can_bypass: never`, so ordinary direct or force updates cannot bypass the ruleset.

## G0 exit

G0 exit criteria are satisfied:

- baseline and exact merge-check inventory recorded;
- fail-closed aggregate merge gate implemented and validated;
- final candidate freshness validated on a new head;
- bootstrap PR #116 merged only after the final Full Gate was green;
- protected-main enforcement is active on `main`;
- `merge gate / ready PR` is the required aggregate context;
- pull-request-only change flow, strict up-to-date policy, force-push prevention, and zero bypass actors are effective.

**G0 is complete. Product PR1 may start from the protected `main` baseline after this evidence-only closeout PR is merged.**
