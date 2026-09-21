# Scale onboarding closeout

## Completion boundary

An instrument using existing Scale runtime capabilities can be introduced in
`server-version/backend/src/modules/scale/instruments/<key>/<version>/` plus the
generated index, without editing handwritten shared registries, runners, scorers,
report projectors or admission guards. Authoring may be manual or AI-assisted;
acceptance is schema validation, deterministic checks, golden scoring cases and
explicit human publication. The platform verifies declarations and evidence scope;
it does not establish the scientific truth of submitted studies.

A genuinely new scorer or runtime primitive is a platform capability change. The
`scale-platform-capability` PR label makes that classification explicit. Content
PRs may change their instrument directory, generated index, instrument tests under
`src/__tests__/scale/instruments/`, and documentation under `docs/scale-instruments/`.
The boundary workflow rejects other paths. All classes still pass dependency,
immutable scorer, registry generation and scientific claim checks. This is a
review/CI boundary for trusted source contributions, not an arbitrary-code sandbox.
The six existing legacy package imports are exact-file exemptions, not permission
for new instrument packages to import shared implementation modules.

## Install, review, publish

Run commands from `server-version/backend` using the intended environment's DB
credentials. Apply migrations before publication; the closeout adds an audit table.

1. Author an instrument source and golden cases. Run
   `npm run scale:instruments:generate`, `npm run build` and the relevant tests.
2. Establish the reviewed authorization records and deployment policy. Run the
   existing `scale:instrument:install` dry-run, then its explicit apply operation.
   Installation creates a `DRAFT` / `HIDDEN` Scale and active deployment binding;
   it is not publication. A source executable's `releaseStatus: PUBLISHED` means
   released package content, not a publicly available database Scale.
3. Write a publication input, with an existing active `SYSTEM_ADMIN` user as actor:

   ```json
   {
     "instrumentKey": "example_scale",
     "instrumentVersion": "1.0.0",
     "actorUserId": "<system-admin-user-id>",
     "visibility": "PUBLIC"
   }
   ```

4. Run `npm run scale:instrument:publish -- --input publication.json`. Review
   `allowPublish`, `blockers` and `proof`. This is read-only. The proof binds the
   source, exact definition, active deployment revision, authorization state,
   scientific qualification, requested visibility and prior publication state.
5. Add the returned `proofHash` as `expectedProofHash` in the input and run
   `npm run scale:instrument:publish -- --input publication.json --apply`.
   A serializable transaction rechecks current permissions, grants, definitions,
   localization and qualification, retains media, publishes and appends the
   actor/proof audit record atomically. Changed authorization or publication state
   requires a fresh preview. Never publish by directly editing database status.

`HIDDEN`, `COURSE` and `PUBLIC` are explicit choices. Publication does not override
normal access control, deployment modes or participant applicability. The CLI is
an operator tool with DB credentials; the actor ID is an auditable system-admin
attribution and validation, not an interactive login or a cryptographic signature.
Production operators must protect those credentials. Existing web publication
for custom descriptive scales is separate.

## Scientific promotion without runtime reimplementation

`evaluateScaleSourceScientificQualification` is shared by source build checks,
admin preview, Library qualification and the publisher. PILOT requires product
readiness. RESEARCH_READY additionally requires approved localization and an
explicit `scientificReview` naming reviewer, review time, approved maturity,
territory, supported intended uses and selected evidence IDs. Evidence must have
citations and match the executable locale and reviewed territory. Every use marked
SUPPORTED must be reviewed; unsupported uses are not promoted implicitly.

Store the literal `scopeHash` computed by `scaleScientificReviewScopeHash(source)`
after preparing the review. Do not compute it dynamically inside the content
module. It binds identity, definition, localization, applicability, population,
reviewed uses/territory and selected evidence. Changes to these invalidate the
review. A reviewer must approve the new scope before replacing the hash.
RESEARCH_GRADE additionally requires the existing use-specific research readiness
rules to pass with sufficient evidence. Norms are required only by uses that need
them; adding an arbitrary reference or citation does not grant research grade.
Qualifications remain scoped to the recorded locale, territory, population and
uses; they are not universal validation claims.

Changing evidence, review or maturity does not change definition/runtime hashes
or scoring. It also does not invalidate frozen in-flight attempts. New executable
behavior belongs to a new reviewed runtime capability/version, not a maturity
promotion. The scientific review is repository-reviewed evidence metadata, not an
automated substitute for scientific review or a signed external credential.

## Evidence and remaining rollout work

`unknown-scale.postgres.integration.test.ts` writes two previously unseen real
source directories in an isolated workspace, regenerates the production registry,
checks content boundaries, installs with real PostgreSQL grants, uses the actual
publication CLI, and exercises real HTTP admission, FINAL, report and replay.
Only authentication identity is supplied by the fixture; the registry and runtime
are not mocked. Different age and disclosure policies prove policy-driven behavior.
It also verifies stale publication proofs and revocation blocking. Neither source
changes shared handwritten code or bypasses publication with direct DB updates.

This test exposed and fixed existing report defects: encrypted runtime
snapshots must be unwrapped with the unified runtime decoder, and the FINAL
transaction's selected record must carry its frozen snapshot for response projection.
Completed replay admission reads also need the persisted result and completion metadata.
Missing/corrupt snapshots still fail closed.

The scorer manifest pins the existing custom scorer's source bytes and exported
function to its key/version. Changing an existing pin relative to the base is
rejected. A new implementation needs a new registration/version and platform
review. This does not freeze all transitive shared runtime code; broad runtime
artifact digest/version management remains separate work.

The database still has one installed Scale row per key; same-key multiversion
coexistence is not part of this closeout. No production grants, maturity promotions
or backfills are invented or executed. Apply the existing audit/backfill runbook
with actual reviewed grants before enabling production deployments. Merge this
closeout into `content/scale-expansion`, then refresh against current `main` and
run the full integration gate on that combined candidate before a separate main PR.
