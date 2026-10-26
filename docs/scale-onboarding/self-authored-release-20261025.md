# Registered self-authored tools: formal release

Scope: reviewed, compiled Scale sources. A request body saying `self_authored` does not establish authorship. The registered source identity, source/provenance declaration and measurement hash form the exact `selfAuthoredSourceHash`. A current active SYSTEM_ADMIN is required for authored installation and the existing explicit publication/approval checks remain in force. External tools retain InstrumentAuthorization checks, including revocation and scope. No authorization rows or new grants are fabricated.

The 36 Learning Motivation sources record the author's 2026-10-25 confirmation, retain original authors and citations, increment catalogManifestVersion, and remain REVIEWED/PILOT. Authorship does not establish new empirical validity. Report/parameter editorial revisions are separate from unchanged items/scoring/numeric references.

## Execution sequence (operator-owned)

Use the candidate source tree and the already authorized target database environment. Do not run these against a different database. Start with one instrument and retain every plan, response and generated identity. There is no direct database status update in this procedure.

1. Run the existing installer in default dry-run mode, then review its exact source/deployment plan:

`node --import tsx src/scripts/install-scale-instrument.ts --instrument-key <key> --instrument-version 1.0.0 --locale zh-CN --localization-version 1.0.0 --revision 1 --modes STANDALONE,QUESTIONNAIRE,COMPOSITE --actor-user-id <existing-system-actor>`

The reviewed registered authored source selects the provenance branch automatically. No `--authorization`, copyright `--territory` or `--commercial` declaration is required. The default territory comes from the trusted source scientificReview.territory when present; otherwise it is `ZZ`. This records existing scientific applicability, not a copyright restriction. `UNSPECIFIED` records the absence of a copyright commercial-scope declaration. Explicit scientific publication-scope checks remain active. Language, applicability, deployment modes and runtime policy remain validated. Add `--apply` only after a successful reviewed dry run. Installation creates a DRAFT/HIDDEN scale and an active versioned deployment; it does not publish or grant use.

2. Create publication JSON with only instrumentKey, instrumentVersion, actorUserId and `visibility: "HIDDEN"`. Run:

`node --import tsx src/scripts/publish-scale-instrument.ts --input <publication.json>`

Review allowPublish and proofHash. Add returned expectedProofHash to that input, then repeat with `--apply`. The service checks current proof inside a serializable transaction, publishes the measurement release, retains media and records the publication audit. HIDDEN is intentional: PUBLIC standard scales permit broad student access; COURSE enables course-membership access. Public catalog inclusion is not public participation.

3. Using the existing SYSTEM session and recent administrator proof, read `/api/platform/survey-standard/candidate/:key/:version`, select the exact CONTENT/PARAMETERS/REPORT hashes, POST `/preview`, then explicitly POST `/approve` with stable requestId, expectedCombinationHash and the operator's reason. Do not create an external authorization as a prerequisite for a genuinely authored tool. These are the existing HTTP endpoints, not a raw SQL mutation. Keep response/recovery state; do not blindly retry an uncertain approval.

Approval owns its genuine low/middle/high synthetic scoring/report trial, persisted trial records and separate database readback. Only successful completion makes the exact combination ONLINE. It creates no researcher grants. Confirm history/ONLINE, exact hashes and three trial cases by reading candidate detail. If trial fails, inspect blockers instead of setting ONLINE manually.

4. Read the two management catalogs. Survey has an ONLINE-aware exact-combination assignment layer; Training's existing standard catalog is a source-owned projection, not a second copy of Survey's three-axis workflow. HIDDEN publication supports normal governed source parsing but grants no recipient access. Actual assignment, course/project binding and user use grants remain separate authorized operations.

## Boundaries

- Git commit, target-environment installation, explicit publication/system approval and entry/user availability are separate outcomes.
- Never use PUBLIC to bypass a missing entry/use-grant path. Do not relabel these registered STANDARD tools as private CUSTOM_DESCRIPTIVE copies.
- Existing definitions/source-axis snapshots are still immutable. A prior installed definition with different source metadata fails closed. This change does not implement historical in-place migration.
- Authored receipts carry the exact source hash, not invented license dates. Training and legacy Survey source consumption revalidate that receipt; external license expiry checks remain intact.
- Catalog REVIEWED/PILOT is preserved. For an actually PUBLISHED authored deployment, the read model no longer falsely reports that no formal release occurred. HIDDEN still says that deployment and user access require separate verification.
- Emergency stop, withdrawn/retired states, publication proof, source identity, scientific/score/report validation and existing frozen history remain intact.
- Survey three-axis ONLINE does not automatically establish an identical Training three-axis grant workflow. That management asymmetry is a separate product issue, not a reason to broaden this patch.

## Local validation

Focused tests cover source spoofing, cross-identity hash reuse, non-whitelisted authored identities, external authorization preservation, current system actor, immutable old definitions, explicit publication proof, start/locale/lifecycle gates, source receipts and catalog/user-grant separation. Cold starts are checked in both policy-first and registry-first import order. No live database apply or publication was performed as part of this local code validation.

## 2026-10-25 default-territory correction

The initial authored default incorrectly used ZZ for every tool. Actual isolated deployment showed that 10 RESEARCH_READY tools already have reviewed CN scientific applicability: installation succeeded, but formal publication correctly rejected SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH. This is a new authored-default bug, not a PR355 regression. The fix preserves the scientific check and derives the default from the reviewed source. Existing revision1/ZZ deployments require an explicit formal revision2/CN installation, retaining the old revision/history. Do not edit status or scientific evidence to make publication pass. The 25 other ready tools can continue against their original exact reviewed publication proofs.
