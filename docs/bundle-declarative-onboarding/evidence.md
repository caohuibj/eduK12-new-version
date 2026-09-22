# PR3 implementation and validation evidence

Date: 2026-09-23. Base: `ad5aa29b953f1cbec1be3aa1dd7f01b5358900f9` (PR #162). Branch: `feat/bundle-declarative-onboarding`.

## Delivered

- Strict JSON package contract, bounded predicates, field/reference validation, exact dependency/profile/selector/unit resolution and deterministic discovery/generation.
- Scaffold, manifest generate/check, offline onboarding check, preview, idempotent DRAFT install, content-bound signed publication, HOLD and terminal retirement commands.
- Versioned declarative engine with three-valued comparisons, quality gates, explicit states and rule/evidence provenance. No package-name dispatch or cross-unit scoring.
- Additive release table and production freeze schema 2; legacy schema 1 hashes and readers preserved. Database release state controls new admission. Review evidence remains when holding/retiring.
- Integration with the existing Bundle catalog, instance publication, real FINAL facts, audience-safe structured reports and append-only reanalysis. New history admission rechecks release eligibility in the write transaction.
- Generic frontend blocks and JSON download through the existing authorized report API. Unsupported blocks are visible failures; content HTML remains text.
- Four content-owned golden fixture files and an experimental example package. No real Bundle promoted. Runtime still requires generation/build/deployment.
- Full CI retained, new PostgreSQL suite added to mandatory no-skip checks, and Docker/environment configuration documents the creation flag and review key. Content-only CI remains PR4.

## Executed validation

All database work used dedicated `huisurvey_b3` on the isolated local test PostgreSQL service. No production data was modified. Local runtime Node v25.2.1; CI Node 20 remains the remote validation authority.

| Check | Outcome | Local evidence |
| --- | --- | --- |
| Guarded migration and seed | Passed after supplying synthetic seed-admin configuration | `/tmp/b3-migrate.log`, `/tmp/b3-seed.log` |
| Backend complete build | Passed, including all existing content gates and new Bundle checks | `/tmp/b3-backend-build.log` |
| Backend full serial regression | 374 suites / 2,308 tests passed | `/tmp/b3-full-tests.log` |
| Final affected tests after retirement/admission/quality refinements | 7 suites / 46 tests passed; includes one newly added invalid-quality case after the broad run | `/tmp/b3-final-focused.log` |
| Final backend TypeScript | Passed | `/tmp/b3-final-types.log` |
| Frontend full serial regression | 137 suites / 521 tests passed | `/tmp/b3-front-full.log` |
| Final frontend typecheck and build | Passed; existing bundle-size warning only | `/tmp/b3-front-final-types.log`, `/tmp/b3-front-final-build.log` |
| Targeted frontend lint | No errors or warnings | `/tmp/b3-front-lint.log` |
| Manifest check and all package golden/dependency checks | Passed | `/tmp/b3-manifest-final.log`, `/tmp/b3-onboarding-final.log` |
| Existing content workflow/routing contracts | 4 passed | `/tmp/b3-ci-contracts.log` |
| Workflow/Compose YAML, release-script syntax, whitespace | Passed | local validation |

The new PostgreSQL suite creates two unknown names through actual JSON files: Scale+SJT and Cognitive+Scale. It checks DRAFT installation, idempotency, unauthorized installation, immutable version conflict, invalid signed approval, concurrent publication, B2 creation/publication, real canonical FINALs, persistent facts, explicit reanalysis, historical hash stability, retirement refusal and retained review evidence. A seeded WHO-5 row is temporarily marked published only inside that isolated test database and restored afterward; no scientific/license approval is inferred from this fixture.

Pure tests cover UNKNOWN under NOT, ordered comparison boundaries, boolean composition, invalid/limited quality, unknown operators/fields, duplicate IDs, provenance/reference errors, content size/depth, malicious accessors, unit incompatibility, bad signatures/expiry, immutable freeze tampering, symlinks and generated drift. The core-diff guard hashes handwritten modules before and after discovery/generation of unfamiliar names. Renderer tests exercise unknown blocks, explicit rejection and HTML-as-text.

## Validation boundaries

No new local browser run is claimed for PR3. Generic renderer tests were run, and the unchanged full browser acceptance job remains required in remote CI for this PR. Remote gate results are pending at push time and must pass before merge. Existing real Bundle scientific/release approvals remain independent. The CLI is a trusted operator interface; signed reviews are supplied by the independent review process, not created automatically by importing JSON.
