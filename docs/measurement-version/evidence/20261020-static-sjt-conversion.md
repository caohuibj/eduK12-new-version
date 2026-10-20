# Static SJT explicit source publication: local implementation evidence

Scope: the installed generated SJT registry, its independent source license,
immutable measurement source mapping, unified admin publication API, and Training
publication/START/FINAL/report consumers. This is not production deployment or
complete V09/V10 acceptance. No historical pointer or author identity is invented.

## Implemented

- `POST /static-sjt/prepare` and `/static-sjt/publish` on the existing admin
  permissions router reuse authentication, trusted origin, rate limits, SYSTEM
  identity and recent security-key verification. The service rechecks current
  user/token/expiry inside its transaction.
- Preparation accepts only an exact installed generated source and records its
  immutable content digest. It creates no license, capability or release. It
  excludes development-only registry fixtures.
- Publication requires an independently issued exact
  `TRAINING / PLATFORM / situational-registry / measurement / [mappingId]`
  `measurement.publish` grant, plus one actual eligible source authorization
  matching grantee, locale, territory, electronic administration, scoring,
  display and commercial use. `EVIDENCE_PENDING` retains the existing approved
  warning semantics; `self_authored` text does not replace a license.
- The real existing SJT validation/scorer adapter produces the immutable shared
  measurement. Source mapping, digest, exact source identity and authorization
  provenance remain outside the scientific fingerprint. No fake User/owner is
  created. Successful retries preserve mapping, deployment and release identity.
- New START rechecks the originally bound authorization lineage, not an unrelated
  replacement license. Source shared/exclusive advisory locks also serialize new
  authorization lineages and amendments/revocations. Publication rechecks license
  validity after content lock waits. Capability and actor checks repeat after
  publication waits. These are implemented contracts, not real race evidence.
- Training publication and START now consume the actual static mapping rather
  than substitute an author row or unconditionally refuse static packages.
  Compact snapshots use `STATIC_SJT_REGISTRY` without `ownerId`. FINAL and report
  reads validate the persisted immutable measurement provenance and do not query
  the live registry/license or re-score. Changed source kind, mapping, identity,
  fabricated owner or cross-scope content are rejected. Existing legacy null/null
  bindings stay legacy. Raw FINAL remains allowed after release withdrawal while
  interpretations retain revocation status.
- The additive mapping migration retains records and rejects deletion, source
  rewriting, pointer/deployment reassignment and mismatched target provenance.
  It has not been applied to a real database in this unit.

## Stable API DTOs

Prepare request: `{ instrumentKey, instrumentVersion }`.
Response: `{ mappingId, instrumentKey, instrumentVersion, contentDigest,
measurementReleaseId }`.

Publish request: `{ mappingId, grantId, deployment: { locale, territory,
commercialNature: "NON_COMMERCIAL" | "COMMERCIAL", grantee } }`.
Response: `{ mappingId, measurementReleaseId, contentHash, status }`.

Both request bodies are strict; actor/session values come from verified claims.
Same exact source preparation and same deployment publication are retryable.
A UI should recover uncertain publication by retrying that same body or preparing
that exact source again, never inventing another identity or deployment.

## Checks and remaining gaps

- Focused tests cover static registry/compiler/license/immutability/expiry,
  system publication service and admin routes, source writer locks, Training
  binding, FINAL and report provenance. Initial seven-file run passed 83 tests;
  additional changed/new contract runs passed 20 and 11 tests; the final impacted
  static/binding/FINAL/report run passed 51 tests. These runs overlap and are not
  additive counts. Unchanged passing evidence was reused.
- Prisma schema validation passed with a synthetic connection string; no database
  connection, generation, migration, production data or privileges were used.
- Backend no-emit type checking found no diagnostics in this unit's source files,
  but the overall run was not successful: separate in-progress aggregate,
  composite and reference work had diagnostics. Integrated type acceptance is
  pending and is not represented as passed here.
- No static-source admin UI, real browser/recovery or HTTP acceptance yet. The
  API is implemented, not a completed user-facing management loop.
- No connected PostgreSQL migration, two-connection lock/rollback/revoke race,
  standalone/non-Training entry cutover, formal CI or production deployment was
  run. These remain separate integration/acceptance work. Old Scale conversion is
  owned by a separate unit. No old source/result data was deleted.
