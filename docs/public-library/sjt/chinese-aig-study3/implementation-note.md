# Implementation correction and bounded DRAFT evidence

This note supersedes two static-inspection assumptions in the historical engine-fit-readonly.md without editing the frozen selected material.

1. AUTHOR_KEY_SUM requires the existing V2 scientific contract. V1 ALL definitions are explicitly rejected by validateSituationDefinition for this model. The implemented definition is V2 BRANCH_REACHABLE with40 sequential NEXT scene nodes and one terminal. Every option follows the same fixed path, all40 are required; no random sampling, adaptive selection or item omission.
2. The internal instrument registry contains DRAFT packages. DRAFT exclusion occurs in the real published selector and runtime/release list consumers, not publicationReviewIssues' early return. The bounded test calls selectPublishedSituationPackage with this DRAFT and verifies rejection both for exact version and latest selection.

## Changed scope

- One owned source directory: server-version/backend/src/modules/situational/instruments/chinese-aig-study3/1.0.0/{instrument,publication,scientific}.json.
- Required generated onboarding/instruments.generated.ts, produced by the existing generator.
- One independent single-tool contract probe: server-version/backend/scripts/public-library/chinese-aig-study3-contract.tsx.
- This note and source-implementation-evidence.json only. Original docs/source strings and source hashes remain unchanged.

No shared runtime, permissions, publication safeguards, dependencies or existing tests were changed. No CI, commit or push. Scientific maturity is PILOT, with no human review declaration. Empty scientific.evidence means no new execution-bound platform scientific qualification is claimed; it does not erase the known Study3 human research, which remains explicitly cited in definition.source and the source documentation.

## Verified once against the existing engine

The new probe bundled with existing read-only dependency trees and ran under Node24.21.0. PASS:
- Source schema and actual V2 package semantic/golden validation.
- Exact40 scenario strings and160 option text/key mappings against the frozen selected JSON.
- Actual AUTHOR_KEY_SUM: allA/allB→8 each; allC/allD→0 each; alternatingA/D→4 each. Each metric range0–8.
- Missing one item independently in each of the five facets produces null for that facet, not0 or an imputed score; other complete facets retain8. This conservative guard is platform behavior, not a claimed author missing rule.
- Actual published selector excludes the DRAFT with or without an explicit version.
- Participant projection strips expert keys/contributions.
- Actual SituationalReportCard server render shows five labeled raw0–8 metrics and the limitations, not a0–100 range or correct-answer display. No narrative-only branch, total metric, bands, norms, percentiles or high/low-goodness direction.

The response purpose is BEHAVIOR_TENDENCY and the new platform prompt asks for usual likely action, not what should be done. The source does not convert trait-direction keys into correctness. Human publication/scientific approval is not fabricated. Server rendering is a bounded report contract check, not browser acceptance, deployment or approval to publish.

## Reproduction

Bundle the standalone probe with the existing esbuild using platform=node, format=cjs, jsx=automatic, and the existing backend/frontend dependency roots as nodePaths. Emit into a new temporary location, then run with Node24.21.0. Do not install/copy dependencies or alter the shared runtime. The retained JSON evidence binds exact source/probe/generated-manifest hashes; do not rerun unchanged checks merely for documentation.
