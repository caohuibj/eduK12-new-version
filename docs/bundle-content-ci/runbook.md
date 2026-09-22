# Bundle content CI runbook

## Adding a Bundle without changing code

Use B3's scaffold and authoring contract. Add an exact new package directory under
`server-version/backend/src/modules/assessment-bundle/packages/<key>/<version>/`,
and regenerate `generated/packages.json` with `npm run bundle:manifest:generate`
from `server-version/backend`. The B3 loader remains the runtime authority.

Also add one **synthetic** runtime sample under
`server-version/backend/src/modules/assessment-bundle/ci-fixtures/<key>/<version>.json`.
This is a CI sidecar, not runtime content, a student record or release approval.
The example sidecar is a copyable starting point. Its strict contract is:

- `schemaVersion: 1`, `synthetic: true`;
- `randomSeed`: optional 32-character lowercase hexadecimal seed (defaults to
  `0123456789abcdef0123456789abcdef`); author Cognitive trials for this seed;
- `context`: values keyed by the declared context field keys;
- `slots`: exactly one entry per non-FORM slot, keyed by slotKey. Each entry has
  `type` and the existing FINAL payload: SCALE `answers`, SITUATIONAL `responses`,
  or COGNITIVE `trials` (full trial envelopes, not fabricated aggregate scores);
- `expectedKind`: COMPUTED or UNAVAILABLE;
- `expectedRuleIds`: exact expected conclusions from the persisted canonical facts.

FORM values use `context`; they do not add a measurement slot entry. Cognitive
config, engine, scoring and profile versions come from the package and registered
seeds. The driver supplies only deterministic admission entropy; production FINAL
validation, scoring, provenance, report calculation and persistence are unchanged.

The driver installs the **actual package bytes**, signs an approval with temporary
synthetic administrator/reviewer identities in an isolated database, creates and
publishes an instance, submits every unit, verifies completion and the report hash,
compares expected conclusions, reads student/parent/teacher/admin views, and checks
historical reading after retirement. A separate synthetic four-type case exercises
all driver branches. Existing B2/B3 tests cover approval denial, concurrent release,
reanalysis and legacy compatibility. None of these operations publish a real package.

Existing delivery limitations still apply (for example observer packages require a
dedicated product). A smoke failure for an unsupported runtime is not grounds to
skip the suite or relax scientific/publication rules.

## Local checks

From repository root:

```sh
node --test .github/scripts/content-scope.test.mjs .github/scripts/content-workflows.test.mjs .github/scripts/cognitive-content.test.mjs
```

From `server-version/backend`, after installing locked dependencies and generating
Prisma, supply `BUNDLE_CONTENT_BASE_SHA` as the full base commit SHA:

```sh
npx tsx scripts/bundle-content-check.ts
npx tsc --noEmit
```

This checks deterministic registry bytes, all B3 schemas/goldens/dependencies,
strict smoke sidecars and base-versus-head history. All previously merged package
and sidecar bytes are immutable, including formatting and publication intent;
make a new version instead of overwriting/deleting old content. Runtime HOLD,
RETIRED and signed publication are database operations described in the B3 runbook.

For database smoke, use a dedicated disposable PostgreSQL database and Redis;
set `DATABASE_URL` and `BUNDLE_PRODUCT_TEST_DATABASE_URL` to that database,
`REDIS_URL`, the standard test encryption/pseudonym/JWT keys,
`COGNITIVE_MODULE_ENABLED=true` and `CI=true`. Never use production credentials.
No general database seed is needed for the targeted job:

```sh
npm run db:migrate:guarded
npx vitest run src/__tests__/assessment-bundle src/__tests__/assessment-reanalysis src/__tests__/bundle-onboarding src/__tests__/bundle-product --no-file-parallelism --reporter=default --reporter=json --outputFile=/tmp/bundle-content-tests.json
node scripts/assert-release-test-report.mjs /tmp/bundle-content-tests.json src/__tests__/bundle-onboarding/content.postgres.integration.test.ts src/__tests__/bundle-onboarding/lifecycle.postgres.integration.test.ts src/__tests__/bundle-product/product.postgres.integration.test.ts
```

Use a separate newly migrated and seeded database for the all-repository regression:
legacy test fixtures can leave test-specific Cognitive config rows that intentionally
cannot be overwritten by production seeds. Do not weaken the seed immutability guard.

## Routing and recovery

Only the exact package filenames, four golden fixtures, exact sidecars and generated
registry qualify. Unknown files, executable bits, symlinks, moves/deletions, core,
workflow and lockfile changes retain platform checks. Invalid base/diff/output fails
closed. Mixed content domains run their union in one hosted job. Every content job
also checks **all** Bundles: this conservative reverse-dependency closure avoids
missing a Bundle affected by an Assessment change. It costs one isolated PostgreSQL
and Redis startup, but no full browser matrix, image build or CodeQL.

The stable required check is `merge gate / ready PR`; selected missing, skipped,
cancelled or failed jobs block it. Review events preserve the existing SJT publication
check without rerunning CI. Bundle production publication remains independently
signed and hash-bound; merging a content PR does not grant publication authority.

Manual `CI` workflow dispatch always runs full CI; branch runs compare package
history against their merge base with `origin/main`, never against their own head. Repository variable
`CI_FORCE_FULL=true` also forces full jobs and the full aggregate on PR/main events,
including drafts; remove it to restore structural routing. This variable only
strengthens validation and is not required for normal operation.

## Evidence and remaining remote acceptance

Content runs upload `bundle-content-evidence` with base/head, package hashes, dependency
closure and a machine-readable test report. Rules/golden/dependency/history/drift
fault injections are in `content-check.test.ts`; routing and selected-job failure
injections are in the existing script tests. C4 itself modifies CI and must run full.

After C4's full gate succeeds, use a controlled content PR based on C4 (or merged
main) for remote route acceptance: add a new exact version and matching sidecar,
regenerate, and verify only scope/content/aggregate plus the lightweight publication
workflow run. Record workflow URLs, head SHA, executed/skipped jobs and duration.
Then deliberately corrupt generated bytes in the canary, verify content and aggregate
fail, restore correct bytes and rerun. Never merge intentionally broken canaries.
The user requested stopping after triggering C4 CI: remote canary runs and timing
comparisons therefore remain explicitly pending, not claimed as complete.
