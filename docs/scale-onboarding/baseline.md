# Scale onboarding PR-1 baseline

## Fixed implementation base

- Repository: `caohuibj/eduK12-new-version`
- Integration branch: `content/scale-expansion`
- PR-1 base SHA: `0f64fccae34d39bf5f602be0359fe2fea919081d`
- PR-1 work branch: `refactor/scale-onboarding-pr1`
- The integration branch was verified to point exactly at the base SHA before implementation.
- Current `main` has advanced independently; PR-1 intentionally targets `content/scale-expansion` so the review diff contains only this onboarding work.

## Executable package inventory and frozen hashes

The legacy executable registry contains exactly six package identities. PR-1 pins both the definition hash and a canonical digest of every golden scoring output so registry refactoring cannot silently redefine the baseline.

| Identity | definitionHash | golden output digest |
|---|---|---|
| `adexi_v1@2.0.0` | `14722172c7203b8f04f3dc8428e0e125c5c21c2a769f487f532b2945bbe88949` | `8d83951b93783359dfdd86afb2c45d6742f9b959bdb8230cda561992c9f8726b` |
| `who5@1.0.0` | `900dd182737241ffdacd7af9e38939b11e19e409f335a4cdc19f7a26bdd5b321` | `b10d74b03f7e7777c344438e07eb3f8183cc3dce589145261e10c98423dbcf48` |
| `sdq_parent_zh_cn@1.0.0` | `80b7065ad96a4af86292c6907a1de24636a77d0bc5801eecb1920bc698b38e40` | `499b76180ebe369e4da8440873236c84c08cdda4f76b63a7f5e451507aa6f01c` |
| `sdq_teacher_zh_cn@1.0.0` | `9f2f341714a1f90363d1edd65d7ad523adf8bfe0157ce9fd291b6c880e6461db` | `e27bd0e24b6babebe55cc5d8e28a8dec834b779acaceb913b777a5db3b6a5a25` |
| `texi_parent_zh_cn@1.0.0` | `5aa811bf406a9790749b780390d8a067207e8d1e227ce2e4c19d30284e370c5b` | `c8f5bc070f9b470f9f00f4f3198fcdad84fe869d1a89736ba3ba4a213a83596a` |
| `texi_teacher_zh_cn@1.0.0` | `dfb5ac0982b6d39eb7daaf84bf8fbcac0e1cbb43de3622fb4ef69b5ff789a7d6` | `c8f5bc070f9b470f9f00f4f3198fcdad84fe869d1a89736ba3ba4a213a83596a` |

The legacy package API order is also compatibility-sensitive and remains: ADEXI, WHO-5, SDQ parent, SDQ teacher, TEXI parent, TEXI teacher. The convention-driven generated index preserves that order through stable numeric descriptor prefixes; the generator itself contains no package-name list.

## Catalog-only inventory

Wave 1 P1 contains four non-executable catalog identities:

1. `dass21_zh_cn@1.0.0`
2. `gse_zh_cn@1.0.0`
3. `mpfi24_zh_cn@1.0.0`
4. `pss10_zh_cn@1.0.0`

PR-1 may enumerate these through the source registry but must not make them executable or startable.

## Snapshot compatibility baseline

Frozen Scale runtime snapshots and unit admissions at the base are schema version 1 / runtime generation `UNIFIED_V1`. The permanent compatibility test pins historical expected values rather than computing an expected hash with the same function under test:

- fixed ADEXI V1 runtime snapshot at `2026-09-21T00:00:00.000Z`: `5744a7a717dc628a1f8a96216c01342522cbcc10075e31ade6591ec745b8edfc`
- literal ADEXI V1 unit-admission fixture at the same timestamp: `3a3fa92226c6f17b4e6f208afc55812e354c9ec3e48f77a7d8441f570583dc5d`

`pr1-baseline-compatibility.test.ts` parses the literal admission fixture and compares the runtime writer against the pinned value. PR-1 adds V2 readers/test factories without injecting defaults into V1 before hash validation. Production writers remain V1.

The constants were captured during the PR-1 compatibility audit after confirming the original V1 writer/hash modules are not modified by this PR and the executable definitions remain semantically identical to the fixed base. The one-shot capture test was removed after the values were frozen; merge CI now consumes only permanent assertions.

## Runtime behavior boundary

PR-1 is contract/compatibility work only. It does **not** change HTTP result projection, deployment authorization, eligibility enforcement, standalone context collection, production backfill, or any DASS executable content.

## Verification status

No production database access or production backfill is performed in PR-1. Validation uses the repository CI against the PR head, including migrate/build/full backend regression and full frontend checks. The temporary validation PR exists only because the current CI `pull_request.branches` filter does not include `content/scale-expansion`; PR #126 remains the implementation PR.
