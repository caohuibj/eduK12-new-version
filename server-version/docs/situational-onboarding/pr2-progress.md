# SJT PR2 execution and acceptance record

Status: implementation complete; local validation passed; full remote CI required before merge. PR: #153.

## Baseline and commits

Base: PR1 #151 merged at `8b916eba6d76bfad1911e10189e7258be122a15c`, including Scale onboarding #152 and previously merged Cognitive onboarding. No shared scientific qualification policy or scoring algorithm was changed.

| Planned stage | Implementation | Acceptance |
|---|---|---|
| C01 | `fea1eff` instrument-owned declarations, scoped evidence, immutable lookup copies | Exact identity/scope isolation; no central mutable SJT maturity/evidence authority |
| C02–C04 | `31869eb` bound human review, revision rules, maturity-independent Composite admission, authenticated frozen governance and UI/export projections | Advanced claims and historical readers land atomically; no intermediate rollout with live historical grades |
| C05 | CI/build enforcement, review-triggered required Full Gate, author/reviewer workflow and this evidence record | Final candidate must pass full CI; no skipped required gate counts as success |

C02–C04 were intentionally one atomic implementation commit because accepting an advanced declaration before historical projections are frozen would violate the compatibility contract. Intermediate C01 progress is preserved in Git history.

## Delivered behavior

Each instrument's scientific.json declares maturity, revision, limitations, scoped evidence and, for advanced claims, a bound GitHub approval. Offline evaluation rejects overclaim, mismatched evidence, stale reviews, and revision/reason violations against a base. Online verification checks the human reviewer, repository permission, approval state and exact content at the approved commit. Evidence eligibility never promotes or publishes content automatically.

Production packages remain PILOT at governance revision 2 with no invented scientific approvals. Existing content digests and definition/compiled-runtime hashes remain unchanged. Legacy package scienceMaturity is optional and ignored by executable validation/admission. Composite admission uses publication and runtime capabilities.

New standalone and Bundle attempts freeze scientific context inside the authenticated encrypted snapshot envelope. Scientific changes affect that governance context/envelope hash, not execution hashes or canonical FINAL core. Current directory/teacher metadata reads current governance; old attempts, history, results, Bundle reports and exports read frozen metadata. Legacy snapshots retain their original hash and use PILOT/LEGACY_MISSING/null revision when context is absent.

No DB migration, historic rewrite, new scorer, runtime capability, or production promotion is introduced. Existing organization-run provenance remains independently frozen from its resource policy.

## Acceptance evidence

| ID | Local evidence | Result |
|---|---|---|
| A13 | `scientific-governance.test.ts`: overclaim, missing foundation/provenance/empirical/output and missing human review | PASS |
| A14 | Explicit three-tier declarations; DRAFT evidence eligibility with PILOT declaration and no publication mutation | PASS |
| A15 | Five execution binding mismatches, four scope mismatches, changed evidence, reviewer identity/time/permission, dismissed/superseded reviews, changed approved content | PASS |
| A16 | Same definition/compiled runtime/runner/report and complete canonical FINAL core across PILOT → READY → GRADE → PILOT | PASS |
| A17 | `scientific-promotion.postgres.integration.test.ts`: V1/V2 real standalone and authenticated Bundle start/resume/FINAL/replay/report under each tier | PASS |
| A18 | Completed and active attempts across promotion retain prior maturity/revision; old Bundle reports stay frozen; legacy snapshot parsing/hash/tamper tests; UI and JSON/CSV tests | PASS |
| A19 | Withdrawal with revision/reason; unchanged publication; mismatched versions never borrow evidence; retirement still blocks new admission and preserves frozen completion | PASS |
| A20 | Shared governance, original production baseline, mixed Scale/Cognitive/SJT Bundle, Cognitive manifest/dependency guard, Scale build checks, frontend reporting regression | PASS |

Backend full targeted run: **192 tests / 33 files passed**, including real PostgreSQL lifecycle/concurrency tests. Subsequent targeted reruns passed after strengthening full canonical-core and active-attempt/old-Bundle assertions; scientific unit suite now has 24 tests. No assertion, transaction/concurrency threshold or timeout was weakened.

Frontend: **46 tests / 12 files passed**, typecheck passed, lint passed with 91 existing warnings and zero errors. Backend build (including Scale checks) and SJT source/publication/scientific contracts passed. Cognitive dependency guard passed for 228 modules. Offline contracts also passed with invalid GIT_DIR, verifying builds do not require Git metadata.

Real Chrome: standalone text flow (directory, draft recovery, FINAL, result refresh, JSON export, history, mobile) **ALL PASS**; seeded authenticated/public Bundle flow, frozen identity and one authoritative terminal write **ALL PASS**. Initial attempts hit local database connectivity / incomplete fixture setup; fresh isolated fixtures passed after connectivity recovered. No browser assertion was removed.

Commands from repository root:

```sh
npm --prefix server-version/backend run build
npm --prefix server-version/backend run situational:onboarding-check -- --all --base 8b916eba6d76bfad1911e10189e7258be122a15c
npm --prefix server-version/backend run cognitive:contracts
# Use an isolated migrated database; never a developer or production database.
COGNITIVE_MODULE_ENABLED=true V32_3_INTEGRATION_DATABASE_URL=<isolated-db> DATABASE_URL=<isolated-db> npm --prefix server-version/backend test -- --no-file-parallelism src/__tests__/situational src/__tests__/assessment-bundle/situational-bundle.test.ts src/__tests__/assessment-governance src/__tests__/composite/situational-bundle.postgres.integration.test.ts
npm --prefix server-version/frontend run typecheck
npm --prefix server-version/frontend run lint
npm --prefix server-version/frontend test -- src/modules/situational src/modules/composite/__tests__/CompositeSituationalReport.test.tsx
```

Browser fixtures/scripts: `e2e/situational-bundle-browser-fixture.ts`, `e2e/situational-text-pilot-browser-e2e.cjs`, `e2e/situational-bundle-browser-e2e.cjs`. Disposable test users and database only; test reviews never enter production sources. Browser screenshots were generated under `/tmp/sjt-pr2-browser-text-final` on the validation host.

## Merge and rollout

Full remote backend/frontend/browser/CodeQL/Docker and aggregate checks remain the final merge authority. Review submission/dismissal retriggers the existing required Full Gate, including online scientific verification. No ruleset or required status was weakened. Future evidence changes remain ordinary reviewed source PRs; the platform's acceptance does not confer scientific grade on any production content.

See [scientific review workflow](scientific-review-runbook.md) for authoring, approval, downgrade and rollback. Once new snapshots exist, retain the new reader in any rollback/forward fix; an older strict parser cannot read the additive governance field.
