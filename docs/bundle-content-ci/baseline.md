# PR4 — Bundle content CI implementation baseline

Status: implementation started; Bundle fast path is NOT enabled by this baseline.

## Verified prerequisites

- Base: `199662df3304f29b0fee74e316a2f10a1a8faa9a` (PR #163, B3).
- Existing content CI: PR #158, `82dfb4d9922dbf519dd4031fd68e4f69fbbf876b`.
- Branch: `ci/bundle-content-validation`.
- GitHub main ruleset 23665026 requires exactly `merge gate / ready PR`
  (GitHub Actions integration 15368), strict up-to-date checks. Keep this name.
- Extend `.github/scripts/content-scope.mjs`, `merge-gate.mjs` and the existing
  reusable `scale-onboarding-boundary.yml`; do not create a competing classifier.

## Exact candidate content surface

Under `server-version/backend/src/modules/assessment-bundle/packages/<key>/<version>/`:

- `manifest.json`, `evidence-map.json`, `rules.json`, `report.json`,
  `scientific.json`, `publication.json`;
- optional `context.json`, when declared by the manifest;
- `fixtures/valid.json`, `fixtures/missing.json`, `fixtures/invalid.json`,
  `fixtures/not-applicable.json`.

The only generated candidate is
`server-version/backend/src/modules/assessment-bundle/generated/packages.json`.
Its bytes must equal B3 deterministic regeneration, even if it is the only change.
Directory identity must match the parsed manifest. Unknown files/extensions,
extra nesting, path traversal, backslashes, symlinks, executable modes, deletion
and type changes cannot authorize content routing. Rename detection stays off,
so the deleted source of a move remains visible. Complete raw Git diff supplies
status and modes; no paginated provider file list or path-only trust.

Engine, loader, contract, schema, shared renderer, lockfiles, workflows,
classifier, shared tests/docs and all mixed core changes retain the platform route.

## Route and event matrix

| Change / event | Required route once C4 is complete |
| --- | --- |
| Pure Bundle addition or regular-file modification | Existing content job plus Bundle validators and isolated PostgreSQL smoke |
| Generated-only edit | Content job; regeneration drift must fail |
| Bundle with Scale/SJT/Cognitive declarations | Union of content checks, one backend install; dependent Bundles included |
| Assessment content without Bundle paths | Conservatively validate all Bundles until a proven exact dependency index exists |
| Bundle + engine/schema/workflow/lock/shared renderer | Platform route: draft light, ready full |
| Deletion, mode/type change, unknown paths | Platform route; Bundle immutability/deletion validation must also run there |
| Missing base, malformed diff, classifier exception | Scope failure; aggregate cannot pass |
| Missing or malformed routing output | Aggregate failure, even if unrelated jobs succeeded |
| Main pure content push | Same content checks |
| Main platform push | Existing post-merge compile smoke |
| Review event | Existing publication authority checks; no full CI rerun |
| Manual dispatch | Full CI; must not weaken checks |

## Required validation before enabling Bundle routing

1. Reuse B3 manifest regeneration, schema, dependency selectors/types/units,
   context, scientific/claim and four fixture validators. Record exact base/head,
   package identities/hashes and results in uploaded evidence.
2. Compare base and head package histories, reject old-version mutation/deletion;
   JSON publication intent is not signed production release approval. Preserve
   B3 administrator/reviewer, hash-bound signature and database admission rules.
3. Validate actual canonical-source mapping through engine/facts and audience
   report projection. Projected-evidence-only fixtures are insufficient alone.
4. Run actual affected-package installation, instance and final-report smoke in
   isolated PostgreSQL for every new version/dependency change. B3's synthetic
   two-package lifecycle suite supplements this, but cannot replace it.
5. Keep selected checks fail-closed for skipped/cancelled/missing/failure. Retain
   publication checks. Prove pure Bundle files do not trigger independent media,
   video, branching or AppShell browser workflows; mixed runtime files still do.
6. C4 itself changes CI and must pass the full gate. After that, record real
   successful and intentionally failing content canaries. Local route tests alone
   do not count as remote canary acceptance.

## Commit milestones

- C4-01: this verified baseline, exact allowlist and check matrix.
- C4-02: raw diff metadata, strict routing/gate validation, Bundle classification
  integrated only alongside its mandatory validators.
- C4-03: targeted semantic/history/dependency/canonical/report checks and real DB smoke.
- C4-04: reusable workflow integration, stable aggregate and independent trigger tests.
- C4-05: full local/remote verification, canaries, evidence and authoring runbook.

## Measured before state

PR #163 head `7641595f2fb1e4f17aaab2135f9724837bd02dd8`:
[CI run 35794071947](https://github.com/caohuibj/eduK12-new-version/actions/runs/35794071947).
Three workflows ran: CI, Situational publication integrity, MEDIA-2.
CI had seven successful jobs and four intentionally skipped jobs. Five heavy
platform jobs were backend, frontend, browser, CodeQL and Docker. Timing below
is observed job execution (not queue time, and not an estimate of future savings).

| Successful CI job | Duration |
| --- | --- |
| classify changed content | 13 s |
| backend (ci + migrate + build + full regression) | 296 s |
| frontend (lint + typecheck + full tests + build) | 244 s |
| codeql (javascript/typescript SAST) | 354 s |
| browser (seeded Situational Bundle + static visual acceptance) | 332 s |
| docker (compose config + production builds) | 188 s |
| merge gate / ready PR | 11 s |


No after/canary result exists yet. Do not claim reduced CI costs until measured.
