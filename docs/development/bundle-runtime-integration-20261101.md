# Shared Bundle runtime integration

This candidate aligns the existing shared adapters with main `d7d43535c8eac445918ae113a43b1cc04032d310`. Original core `ae20aab4`, adapter `f827b65b`, admission-context `d5f10b96`, and Cognitive disclosure `5957fd5f` commits remain ancestors. Only the reviewed ADEXI and age deltas were copied from the separate development work; its cumulative local history was not merged.

## Behavior and scope

- Preserve main's cross-respondent reader, delivery restrictions, existing course/permission checks, and V1/V2 report paths when resolving the adapter conflicts. Schema3 renders through the shared frozen numerical DTO without frontend rescoring.
- Retain the explicitly selected original ADEXI SELF report; do not invent a new R, widen selection, or change leaf scoring.
- Bind source-owned `admissionContext`, recognize the complete required SELF/SCALE DOB contract, and use the existing frozen `ageMonthsAtFreeze` at Scale START. Survey uses actual mapped DOB with persisted `Attempt.startedAt` before scoring/child admission; saved single, joint and longitudinal feedback use the accepted private FINAL facts. Study Attempt creation has no DOB; ordinary Survey Scale has no separate measurement START API.
- The saved feedback function now declares the common optional `derivedView` DTO explicitly. Its previous inferred return type omitted that field from consumers; this changes no stored values or release permissions.
- No production package, generated package index, Scale source, C/P/R, dependency/lock, database schema, or CI workflow is changed. This is shared runtime work, not content-only qualification.

## Standalone test inputs

The two JSON files under `__tests__/bundle-onboarding/fixtures` contain public Bundle declarations without third-party item text. B10 comes from public candidate `e24552514a8d59e51db8fef0e52b5960c3b36bd1`; B15 comes from `db1cb366637d5f257d12c16f2b6b430fb4b9d81b`. The four unused content-regression scenario values are replaced by empty test envelopes; these tests supply their own recorded score facts and do not claim to verify the original content fixtures.

The B15 reader positive case explicitly adds a synthetic DOB-complete contract in the test helper. This retains the original successful report, numerical and permission assertions instead of changing them to expect rejection. It does not modify/register the real B15 package or claim its missing DOB has been repaired.

## Current checks

Node24.21.0. The five age/feedback cases passed against the standalone public declaration. Three fixed-DOB START/provider cases and one ADEXI reader positive case passed. The three existing generic report rendering/export cases passed after conflict resolution: 12 distinct targeted cases in total. Original leaf scorers/goldens and unchanged core/adapter suites were not rerun.

The first ADEXI attempt retained the already identified missing production-package-directory failure; after supplying the explicit test declaration, only that case and the newly added DOB checks ran. Backend selected type closure: 50 roots /2542 files /0 diagnostics; frontend: 12 roots /851 files /0 diagnostics. The initial backend probe exposed nine DTO inference diagnostics, fixed with the explicit saved-feedback type. The initial frontend harness omitted default Node type discovery by starting outside the app directory; rerunning the corrected app-directory harness, with installed types and the unchanged schema's isolated Prisma client, passed. Initial results remain available locally and are not represented as successful CI.

The real existing `manifest-check` passed for all 12 production package declarations. It did not regenerate or add content. Formal CI, an installed authorized FINAL/outlet check, production import, merge and deployment have not run for this candidate.

## Remaining dependencies

- Real B09 `parenting_burden_efficacy_zh_cn@0.1.0` and B15 `working_memory_everyday_adult_zh_cn@0.1.0` still lack DOB mappings. Content owners must supply the real required context/measurement linkage; typed age is not substituted.
- Main's existing CHEXI declarations reference `chexi_zh_hans@1.0.0`, which is intentionally absent from the public executable registry. Its private factory is not an installed identity. Both content dependency checking and `package-release.ts` require the actual executable; merely possessing a private import package does not satisfy them. The strict checks remain unchanged, and no restricted item text or fabricated public executable is added.
- Six existing child Bundle declarations also lack their required smoke files. No placeholder smoke is claimed as real runtime qualification. The historical failing CI run is `41283656524`; it is not a result for this candidate. Feature inventory and release-tool dependency fixes are owned separately.

Use the existing PR503 rather than opening another runtime PR. Retarget its base to main so the already merged main history is not presented as part of its diff against the older core branch. Core/reader original commits remain visible; the coordinating owner chooses the actual merge order. Keep Draft until the applicable real CI and remaining dependencies are resolved. No APPROVE or merge is performed here.


## Isolated schema3 installed/authorized FINAL checkpoint

The single `schema3-native-final.postgres.integration.test.ts` chain subsequently passed on disposable loopback PostgreSQL16.15 with the current migrations. It installs a test-only schema3 declaration based on the public source score/DOB contract, obtains normal exact WHOLE grants, commits a real Survey FINAL, and reads the same frozen single/joint feedback. Wrong-owner import, wrong credential and participant withdrawal are denied. Saved reads and replay explicitly prohibit rescoring, reanalysis and rebuilding age facts; the final history/hash remains intact after withdrawal.

This test declaration uses string/boolean context only, not enum authoring or a real B10 release. Source item definitions are unchanged. The original public four installation scenarios are separate test inputs; no private item text or live answer data is used. Synthetic reviews/accounts are DB fixtures, not GitHub reviews or professional source approval.

The chain exposed and repaired two concrete product omissions: native-source preview still rejected schema3, and publication JSON object serialization changed fractional source facts before its first read. The publication writer now binds the already serialized JSON to JSONB using parameters, matching the existing Bundle installer; the original digest, numeric values and immutable-history check are unchanged. The failed frozen row was retained, and a new synthetic wave was used after repair.

Only the new test/preview/publication type roots were checked (4 roots /2535 files /0 diagnostics); the earlier12 cases and50/12-root checks were not rerun. Sanitized local evidence and retained first failures are in `docs/evidence/bundle-derived-adapters/schema3-native-final.json`. Formal CI is still pending at this evidence checkpoint.
