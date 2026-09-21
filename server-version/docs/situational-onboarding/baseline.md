# SJT onboarding baseline and main compatibility

Base: `a3098d845c0b3b30cea747f26d7491d11d0489c0` (2026-09-22 JST).
Cognitive #147/#148 are integrated into main by #149; Scale data-only migration #144 is merged.
The baseline JSON was captured from the unmodified main registry, compiler, runner and scorer before implementation.

## Verified findings / amendments to the proposed execution plan

- Production registry still imports three handwritten packages and promotes their DRAFT sources to PUBLISHED.
- Existing registry advertises V1 while casting V2 fixtures. The onboarding boundary must use the actual V1/V2 union.
- `validateSituationPackage` deliberately uses `forPublish: false`: source/license research qualification is independent of product publication. `product-publication-boundaries.test.ts` protects this policy. PR1 preserves it, including media textual fallback and executable validation; it does NOT reinstate the proposed forPublish provenance gate.
- Compiler hashes definition/execution metadata, not release status or scientific maturity. No compiler/hash changes are necessary.
- Standalone start resolves the published package; resume/FINAL use frozen snapshots. Operational holds and existing optional-version catalog selection remain unchanged. Explicit version resolution never falls back.
- Composite still checks the legacy PILOT marker and hardcodes its projection. This remains PR2 scope.
- Cognitive onboarding now has deterministic CLI decisions, generated manifests, scoped evidence and real PostgreSQL unknown-task lifecycle tests. SJT follows those principles without importing Cognitive task machinery or changing its contracts.
- Legacy publication migration records refer to this baseline, not fabricated human review timestamps. New publication needs a content-bound GitHub approval verified in CI. A source claim alone is insufficient.

The plan is compatible after these amendments. PR1 is an executable onboarding change; scientific promotion and historical governance projection remain PR2.
