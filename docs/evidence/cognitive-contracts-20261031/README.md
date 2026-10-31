# Existing cognitive contracts — three small repairs

Base main92e398025fb6fbefe1b051520cf5507295173859 includes445; the cognitive/schema/lock inputs match the delegated baseline. Independent branch, no456or paused360/368/441feature content. Exactly3commits: API test isolation, legacy CLI failure transport, and precise-profile catalog test mock with this evidence.

- API: reset mock implementations between cases, explicitly arrange optional-profile service decisions, retain strict forged-field/time400assertions. Omitted profile is delegated, not mechanically changed from400to403. No controller/schema/service behavior change.
- CLI: when the existing selector rejects a legacy call, emit its schema-v1 fail-closed decision or human projection, then rethrow to the unchanged stderr/exit1 handler. Unknown single task retainsCOG_TASK_NOT_FOUND; invalid base retainsCOG_COMPATIBILITY_BASE_REQUIRED and original diagnostic fields. Batch envelope and atomic rejection are unchanged. No validation runs after rejection.
- Catalog tests: add only the actual top-level directory$queryRawmock, strictly matching its SQL/bindings and real{configId,choices:[{id,metadata,available}]}shape. Default history is[], not an allow result; unknownSQLthrows. Preserve fake-PUBLISHED exclusion and malformed-config errors; malformed precise metadata remains unavailable.

Validation:11API+5CLI+11product cases allPASS once, backendtsc--noEmit exits0. No full failure-baseline replay, install, fullCI, profile lifecycle, production or sessions-directory access. Node24.21.0/Vitest4.1.11 differs from mother DOT baseline Node24.22.1; actual private dependency versions and lock equality are in metadata.json. This is local evidence, not fresh-lock/CI qualification. checks.json.gz contains raw reporters/logs and explicit execution boundaries.

Existing service behavior is unchanged: exact administrator artifact may supply an omitted profile and freezesprofileLocked; legacy authorized omission400, unauthorized403, fixed-profile replacement403. Existing service/HTTP evidence is reused by mother DOT, not claimed newly run here. The two original CLI assertions remain, with nonzero/stderr checks and only direct invalid-base/batch controls added.

Draft review only; no Ready, manual formalCI activation, APPROVE, merge, permissions or deployment.
