# PR3: Bundle declarative onboarding

## Scope and release boundary

New packages contain JSON and deterministic generated JSON, with no package-owned executable code. Supported capabilities are exact Scale/Cognitive/Situational/Form identities, scalar evidence, bounded comparison/boolean rules, and evidence/conclusion/limitation blocks. There is no arbitrary arithmetic, unit conversion, new scorer, norm generation, diagnosis, safety-trigger activation or live-upload/hot-loading facility. Generation, build and deployment are still required. PR4 owns content-only CI routing; PR3 runs the full platform gate.

`example_descriptive_v1` is an EXPERIMENTAL DRAFT example, not a release-approved instrument. Existing real Bundles remain at their existing lifecycle/scientific status. Synthetic test approval is not real content approval.

## Author and validate

From `server-version/backend`:

```sh
npm run bundle:scaffold -- my_bundle src/modules/assessment-bundle/packages/my_bundle/1.0.0
npm run bundle:onboarding:check -- src/modules/assessment-bundle/packages/my_bundle/1.0.0
npm run bundle:package:preview -- src/modules/assessment-bundle/packages/my_bundle/1.0.0
npm run bundle:manifest:generate
npm run bundle:manifest:check
npm run bundle:onboarding:check
npm run build
```

Edit manifest.json, evidence-map.json, rules.json, report.json, scientific.json and publication.json. Optional context.json must be declared by the manifest. Required rule fixtures live in `fixtures/{valid,missing,invalid,not-applicable}.json`; each declares evidence states, expected rule IDs and expected engine kind. These are rule golden tests, not proof of scientific validity. Actual canonical FINAL and persisted-report tests remain necessary.

Only fixed file names and JSON are accepted. Executable/extra files, symlinks, traversal references, directory/identity mismatch, version aliases/ranges, duplicate identities, invalid references, unknown blocks/operators and excessive nesting are rejected. Generate sorts packages by key/version. `bundle:manifest:check` regenerates in memory and compares without writing. Runtime imports generated JSON rather than scanning arbitrary directories.

Content roots for PR4: `src/modules/assessment-bundle/packages/<key>/<version>/`. Mechanical output: `src/modules/assessment-bundle/generated/packages.json`. Exact dependency indexes are manifest slots and cognitiveDependencies. These paths do not yet bypass any full CI checks.

## Evidence, rules and reports

Each evidence row binds slot, selector, scalar type, native unit, construct, role, direction and quality policy. Cognitive dependencies additionally bind config/engine/scoring/profile; those fields are checked against both registry/seed identities and the selected assignment. Selectors and units are validated against execution catalogs. Scale and SJT use native score `points`, Cognitive uses the registered metric unit, and Form uses `context`; no conversion is implicit. Direction is descriptive metadata, not a transformation.

Rules support eq/ne/lt/lte/gt/gte, all/any/not, and present/missing/invalid/not_applicable. Comparisons on missing/invalid evidence yield UNKNOWN; NOT UNKNOWN remains UNKNOWN. ALL and ANY use three-valued logic. Only true rules emit conclusions, and interpretations require every referenced evidence item to satisfy quality policy. Limitation rules may describe absence. Cross-source/joint rules require at least two source slots. Joint conclusions require declared supporting references and independently approved claim scope.

Rule IDs are unique and output order is stable by ID. All eligible matching rules are emitted; there is no implicit priority or overwriting. Authors must resolve contradictory prose through reviewed predicates and a new content version. Provenance includes rule ID/version, evidence keys and support references. Limits: 1 MiB normalized package, 64 slots, 128 evidence rows, 64 rules, 256 condition nodes, condition depth 8, JSON depth 24 and 128 blocks.

The server enforces report audience allowlists and existing Scale disclosure policy. Context values remain redacted and derived conclusions cannot expose redacted/context evidence. The frontend renders plain text rather than executing supplied HTML; unsupported blocks produce a visible error. JSON downloads use the same authorized projection as the report API.

## Install and explicitly publish

Deploy generated catalog and incremental migration using the existing guarded migration process. Configure a dedicated `BUNDLE_REVIEW_SIGNING_KEY` of at least 32 characters in the trusted review/publishing environment. Keep it out of source, content and logs. CLI commands require trusted database operator access; supplied operator IDs are checked against actual ADMIN roles. They are not public impersonation endpoints.

```sh
npm run bundle:package:install -- src/modules/assessment-bundle/packages/my_bundle/1.0.0 ADMIN_USER_ID
npm run bundle:package:publish -- my_bundle 1.0.0 ADMIN_USER_ID /secure/path/signed-review.json
npm run bundle:package:hold -- my_bundle 1.0.0 ADMIN_USER_ID
npm run bundle:package:retire -- my_bundle 1.0.0 ADMIN_USER_ID
```

Install creates DRAFT only. Identical key/version/hash is idempotent; different content at the same identity is rejected, including drafts. Legacy code identities cannot be replaced. `publication.json.requestedStatus` expresses intent only, is excluded from immutable execution content identity, and does not authorize any state transition. The database release record is the admission authority.

A review object has exactly these fields: contentHash, reviewerId, expiresAt (UTC ISO timestamp), claims (independent_summary/cross_source_condition/joint_conclusion), scientific=true, rights=true, language=true, report=true, and signature. Signature is lowercase SHA-256 HMAC over `canonicalJsonString` of all preceding fields, with the configured review key. The repository helper is `src/modules/assessment-runtime/canonical.ts`. Signing is done by the trusted review process after reviewing the exact preview hash; the importer deliberately does not offer a sign-and-publish shortcut. A reviewer must be an existing ADMIN distinct from the publishing ADMIN.

Publication validates signature, expiry, content binding, independent reviewer, claim scope and available exact dependencies. EXPERIMENTAL/PILOT descriptive packages require review appropriate to their limited claims; the system does not automatically raise scientific maturity. Review renewal binds the same immutable content; content changes require a new version.

Installation/publication/state transitions serialize on identity. Admission checks the database state and valid review on creation, instance publication and new attempts. HOLD and RETIRED stop new admission; RETIRED is terminal. Review expiry, reviewer losing ADMIN status, or key rotation also prevents subsequent admission. Historical reports and already-started attempts retain frozen execution/read access. The signed review is retained when holding/retiring for audit. Do not delete historical packages to retire them.

Existing teacher material grants, ownership, course membership, assessment availability and public token boundaries remain active. `BUNDLE_PRODUCTS_ENABLED=true` opens instance creation/publication, not historical access. Package installation alone does not grant teachers permission.

## Versioning and compatibility

| Change | Action |
| --- | --- |
| Rule, report, evidence, context, dependency, scientific support or fixture | New package version and approved content hash |
| Lifecycle intent only | Explicit database transition; no execution identity change |
| New operator/scorer/renderer capability | Platform implementation and appropriate new version; full CI |
| Legacy migration | Keep legacy identity unless exact equivalence is demonstrated; otherwise create a new version |

Legacy production freezes retain schemaVersion 1 and original hashes. Declarative content uses production freeze schemaVersion 2, embedding the complete package/rules. The underlying V3 Bundle snapshot stays exact and report facts remain persisted. Reanalysis appends records without rescoring units or replacing old FINALs/reports. Roll back by closing new creation/admission, not by deploying a reader that cannot read schemaVersion 2.

## Validation

Use dedicated PostgreSQL and existing test crypto/Redis settings; DATABASE_URL and BUNDLE_PRODUCT_TEST_DATABASE_URL must identify the isolated test service. Never run these suites against production.

```sh
npm test -- --no-file-parallelism
npm run bundle:manifest:check
npm run bundle:onboarding:check
```

The full backend gate requires the new lifecycle suite to run, not skip. Two random names exercise Scale+SJT and Cognitive+Scale installation, signed publication, real FINALs, persisted reports, reanalysis and retirement. The test temporarily publishes a seeded WHO-5 row only in the isolated database and restores its status. It does not approve a real WHO-5 release. Core-diff tests compare handwritten module bytes before/after unknown-package generation. Generic renderer tests exercise unfamiliar blocks and HTML-as-text; the existing browser gate still checks the shared product workflow.

## Content-only CI (C4)

New package versions also need a synthetic JSON runtime sample in
`assessment-bundle/ci-fixtures/<key>/<version>.json`. See the
[C4 runbook](../bundle-content-ci/runbook.md) for its schema and checks. Keep merged
package and CI sample bytes immutable, regenerate the registry, and use new exact
versions for revisions. Passing CI never replaces the independent signed release
approval or database publication operation.
