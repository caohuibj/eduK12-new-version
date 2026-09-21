# SJT PR2: scientific governance and runtime decoupling

Status: **Draft, C01 implemented; C02–C05 pending. Not ready to merge.**

## Baseline and compatibility

PR1 #151 supplies data-only sources, explicit publication, immutable released content and frozen execution compatibility. This branch starts from its integration with main `5cf5d8e` (Scale onboarding #152); the PR1 integration commit is `05a96e7`. The final merged main commit is recorded when PR1 completes CI.

Scale and Cognitive now both use scoped evidence adapters. SJT reuses the shared `evaluateScientificQualification` policy without changing either family. The definition's source/license remains a valid provenance fact, but it cannot establish research foundation, empirical support or formal output.

## C01 — instrument-owned scientific authority

- `scientific.json` owns revision, declared PILOT maturity, claim scope, limitations and evidence pointers.
- Each evidence item binds key/version, scorer/scoring version, definition hash, language, population, use and claim. Only exact matches contribute to eligibility.
- The resolver reads generated sources. It no longer uses the SJT mutable maturity override map or shared mutable evidence map. Returned declarations are defensive copies; duplicate identities and evidence IDs fail validation.
- Existing production declarations advance to governance revision 2 and explicitly remain PILOT with empty evidence and a stated limitation. Existing publication receipts and executable definitions are unchanged.
- Technical eligibility and scientific eligibility remain independent. Scoped evidence can qualify a DRAFT as Research Ready/Grade; it never changes the declared tier or release status.
- Advanced declarations remain rejected by schema in this first stage. `reviewReference` is a pointer, **not yet verified approval**. It cannot authorize promotion. This restriction stays until C02 and C04 are complete.
- Existing explicit E2E fixtures fall back to PILOT and do not become production scientific sources.

## Remaining commits and acceptance

| Commit | Deliverable | Acceptance |
|---|---|---|
| C02 | Review identity/authority, evidence digest, target maturity and revision monotonicity; safe withdrawal/downgrade | A13–A15, A19; stale or forged reviews fail, evidence alone never promotes |
| C03 | Remove legacy PILOT-only Composite admission and hardcoded current projections | A16–A17; use publication/technical capability; retired content still cannot start |
| C04 | Freeze separate governance context at the existing start/freeze boundary; legacy missing snapshot semantics | A18; history/report/export/Bundle retain original maturity and revision without live upgrades |
| C05 | Three-tier and withdrawal lifecycle, DB/browser regression, runbook and review workflow | A16–A20; equivalent execution hashes, scoring and canonical FINAL behavior |

Do not remove the PILOT declaration restriction merely to make a promotion fixture pass. First implement verifiable scientific review bindings and frozen historical projections together. No production content is promoted by this PR's platform work.

## C01 validation

Commands run from the repository root:

```sh
npm --prefix server-version/backend run build
npm --prefix server-version/backend run situational:contracts
npm --prefix server-version/backend test -- --run --no-file-parallelism src/__tests__/assessment-governance src/__tests__/situational/onboarding.test.ts src/__tests__/situational/onboarding-baseline.test.ts src/__tests__/situational/onboarding-cli.test.ts src/__tests__/situational/scientific-governance.test.ts
```

The new scientific-governance tests cover exact identity isolation, caller mutation isolation, duplicate rejection, draft eligibility without promotion, all five execution-binding mismatch cases, four scope mismatch cases, and unchanged compiled runtime/publication digests when evidence/revision changes. Existing production baseline and CLI onboarding tests remain the compatibility evidence.

Full A13–A20 certification is **NOT RUN** because C02–C05 are pending. No runtime/DB schema/frontend modifications are part of C01.

C01 local result: backend build PASS; SJT contracts PASS; 57 tests / 11 files PASS. An initial parallel run hit the existing CLI five-second timeout; the complete serial rerun passed without changing any timeout or assertion.

## C03/C04 inspected integration points

- `situational-runtime.service.ts`: `startSituationalAttempt` and `createCompositeSituationalAttemptInTransaction` both freeze immediately before storing the encrypted runtime snapshot. Reuse these existing boundaries; concurrent reuse must retain the winning row's governance context.
- The same service's `instrumentResponse` currently resolves scientific maturity live. C04 must split current catalog projection from historical attempt projection.
- `assessment-runtime/situational-runtime-snapshot.ts`: the envelope is strict and hashes an explicit `unsignedSnapshot` projection. Add optional, separately authenticated governance context with legacy parsing; preserve old snapshots and definition/compiled hashes. Do not silently discard or exclude governance fields from all integrity protection.
- That snapshot module still has `assertPilotCapabilities`; C03 should rename it to reflect technical capabilities without changing its checks.
- `composite.service.ts`: remove the admission `scienceMaturity !== 'PILOT'` condition and replace the current response's literal PILOT in C03. Keep PR1's frozen-attempt publication bypass narrowly scoped.
- `assessment-run/scientificProvenance.ts` already freezes organization-run provenance from the resource policy. C04 must keep that separate contract consistent rather than overwrite it from current SJT metadata.
