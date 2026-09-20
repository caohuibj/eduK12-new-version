# Scale onboarding PR-1 baseline

## Fixed implementation base

- Repository: `caohuibj/eduK12-new-version`
- Integration branch: `content/scale-expansion`
- PR-1 base SHA: `0f64fccae34d39bf5f602be0359fe2fea919081d`
- PR-1 work branch: `refactor/scale-onboarding-pr1`
- The integration branch was verified to point exactly at the base SHA before implementation.
- Current `main` has advanced independently; PR-1 intentionally targets `content/scale-expansion` so the review diff contains only this onboarding work.

## Executable package inventory

The legacy executable registry contains exactly six package identities at this baseline:

1. `adexi_v1@2.0.0`
2. `who5@1.0.0`
3. `sdq_parent_zh_cn@1.0.0`
4. `sdq_teacher_zh_cn@1.0.0` (executable content locale is English)
5. `texi_parent_zh_cn@1.0.0` (executable content locale is English)
6. `texi_teacher_zh_cn@1.0.0` (executable content locale is English)

`scale-package.registry.ts` remains the compatibility API for `getScalePackage`, `listScalePackages`, `hasScalePackage`, named package exports and `validateScalePackage` during PR-1.

## Catalog-only inventory

Wave 1 P1 contains four non-executable catalog identities:

1. `dass21_zh_cn@1.0.0`
2. `gse_zh_cn@1.0.0`
3. `mpfi24_zh_cn@1.0.0`
4. `pss10_zh_cn@1.0.0`

PR-1 may enumerate these through the source registry but must not make them executable or startable.

## Snapshot compatibility baseline

- Frozen Scale runtime snapshots are schema version 1 / runtime generation `UNIFIED_V1` and hash the exact unsigned V1 shape.
- Frozen unit admissions are schema version 1 / runtime generation `UNIFIED_V1` and likewise hash the exact unsigned V1 shape.
- PR-1 adds V2 readers/test factories without injecting defaults into V1 before hash validation.
- Production writers remain V1 in PR-1.

## Runtime behavior boundary

PR-1 is contract/compatibility work only. It does **not** change HTTP result projection, deployment authorization, eligibility enforcement, standalone context collection, production backfill, or any DASS executable content.

## Verification status

This baseline is based on the repository at the fixed SHA and the route/call-site audit used by the implementation plan. No production database access or production backfill is performed in PR-1. CI/build/unit/contract/golden verification is recorded in the PR after commits are pushed.