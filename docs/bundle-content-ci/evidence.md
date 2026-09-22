# PR4 implementation and validation evidence

Base: `199662df3304f29b0fee74e316a2f10a1a8faa9a` (merged PR #163).
Implementation checkpoint: `1bafcf07ed1c6b474b8ac00381bb0ce8fc317316`;
subsequent changes add manual-dispatch history protection and documentation.
The final PR head is the authoritative remote CI input.

## Delivered

- Exact Bundle package/fixture/generated/CI-sidecar allowlist extends #158's
  classifier. Raw Git diff retains status, modes and both move sides; malformed
  input/output cannot authorize content checks.
- Existing reusable content job includes all Bundles for every content domain,
  deterministic regeneration, B3 contracts/goldens/exact dependency validation,
  strict runtime sidecars, and byte-immutable base/head package history.
- Isolated PostgreSQL/Redis smoke installs each actual package, verifies signed
  release governance, creates an instance, commits real FINALs, checks canonical
  persisted report hash/expected rules, audience blocks and historical reading.
  A synthetic four-type case exercises Scale/Cognitive/SJT/Form driver paths and
  checks Context redaction for every audience. Cognitive samples use deterministic
  test admission entropy; authoritative seed-sequence validation is unchanged.
- Backend draft/full/main paths also enforce history, so deletions cannot bypass
  immutable checks by selecting the full route. Manual branch runs use merge-base
  against origin/main; a real Git fault-injection test proves old-version edits fail.
- Stable aggregate name retained; selected failures/skips/cancellations/missing
  jobs fail. Independent browser trigger tests prove Bundle content is excluded
  while mixed workflow/runtime triggers remain. Publication review checks remain.
- Manual dispatch and CI_FORCE_FULL preserve full verification. Required no-skip
  test lists include actual-package smoke in CI and local release verification.

## Local evidence (2026-09-23, macOS, Node v25.2.1, PostgreSQL 14)

| Check | Result | Local evidence |
| --- | --- | --- |
| CI classifier, gate, trigger and Cognitive AST scripts | 18 tests passed | /tmp/c4-final-script-tests.log |
| Fresh, unseeded isolated database targeted Bundle regression | 25 files / 155 tests passed at initial driver checkpoint | /tmp/c4-fresh-tests.json |
| Final backend full regression, migrated and seeded isolated database | 376 files / 2316 tests passed; zero pending | /tmp/c4-backend-final.json |
| Final manual-history fault injection and content checker regression | 5 tests passed (one added after full regression) | /tmp/c4-manual-test.log |
| Actual-package, B3 lifecycle and B2 suite no-skip assertion | All three present, no skipped tests | assert-release-test-report.mjs output |
| Backend build | Pass | /tmp/c4-build.log |
| Final backend TypeScript | Pass | /tmp/c4-final-types-2.log |
| Actual content schema/history/hash check | Pass; all-bundles closure | /tmp/c4-final-content-evidence.json |
| Manual branch CLI comparison | Uses main merge-base, passes current content | /tmp/c4-manual-history.log |
| Invalid-base CLI failure injection | Nonzero exit with failure evidence | /tmp/c4-rejected-base.json |
| Actionlint on both changed workflows | Pass with existing Mac/Windows custom labels configured | /tmp/c4-actionlint.log |
| Release shell syntax, git diff whitespace | Pass | local command output |

Full regression used `huisurvey_c4_full`; the earlier content-only acceptance used
fresh `huisurvey_c4`. Both were isolated local databases, separate from production.
The targeted workflow deliberately does not seed the whole application. A full-suite
seed attempt on the already used targeted database correctly rejected a legacy
fixture's divergent Cognitive config; a separate fresh database was migrated and
seeded for full regression. No immutability guard was weakened.

During driver development, FORM selectors and mismatched Cognitive seed samples
failed as intended. The fixed fixture follows the FORM contract and controls test
admission entropy. The final full run includes the corrected four-type case.

No frontend code changed; frontend/browser/CodeQL/Docker acceptance is delegated
to the existing full remote gate, without claiming a new local browser run.

## Remote acceptance still pending

The user requested pushing and stopping as soon as CI is triggered. C4 changes CI
and therefore intentionally selects the full platform route. Its remote result is
not yet known. Subsequent successful/failing content-only canary PR runs and measured
before/after timings remain pending. This document does not claim C4-05 remote
acceptance or reduced CI time based on local checks. The runbook describes those
remaining checks and the force-full recovery mechanism.
