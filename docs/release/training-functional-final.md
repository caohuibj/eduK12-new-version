# Training functional final integration

## Scope and provenance

This candidate starts from main `167478dda6d30df212cb141494c75dd106f04d45` and integrates the net C21–C25 Training product, schema, functional tests and release documentation from the preserved `6d33a8c08dca84dc53786b626e8acba6a078e635` line. Integration checkpoint: `665de9d203bc5221f99cd8d0e6663beeaed43249`. The earlier integration progress facts remain recorded. The experimental recovery/performance harness and abandoned short-load drafts remain outside this candidate.

The product changes are limited to twelve existing modules:

- Scale FINAL uses the timing ciphertext already produced by its preparation step for persistence and its returned record.
- Shared-control bindings derive SHA and byte length from one canonical byte encoding, retaining decrypt/binding verification.
- Completed Cognitive owner/public reads reuse the decoded config from the same payload construction; no private config enters the DTO.
- Report and Training source readers share invocation-local loaded fact rows and decoded bodies. The context is bound to the exact child object, row identity and database client. It is LOADED evidence only; committed write authority and full/canonical reconstruction remain separate.
- Training source authority is read from the actor/course rows acquired by the existing transaction lock. Current account policy, course ownership, assignment visibility and authority fingerprints still use complete database facts. Independently called loaders still authorize themselves.
- Analysis statistics and each export table are built only if consumed. Manifest/source/scientific-identity validation remains eager. Manifest-only consumers no longer fail because an unused descriptive statistic would overflow; actual analysis requests still compute and validate that statistic.
- Training export preparation and post-serialization revalidation each use their complete source authority check instead of first repeating a principal query. Cross-time revalidation remains required.
- Artifact-by-ID HTTP requests authorize and return metadata from one selected artifact row. Existing filename consumers keep their public behavior.

This is not the reverted request-wide analysis prepare-bundle experiment. No performance benefit is claimed or required, and no pressure test or A/B experiment is part of this release.

## Verification and reuse

Run one concentrated affected functional set covering owner/other-actor/current-account authorization, loaded versus committed fact identity, canonical/full output equivalence, private config exclusion, scientific identity and small-N behavior, CSV/manifest lifecycle and direct shared Cognitive/persistence consumers. Record raw command results for this candidate. New changes do not inherit passing status from older input identities.

Local concentrated results: 378 backend assertions passed across the 24 affected files. The initial batch lacked the existing CI Cognitive capability flag and retained nine failures in the session file; with the same product bytes and the explicit CI flag, that file passed all 27 assertions. Frontend shared/Training checks passed 130 assertions in 19 files, with three native IndexedDB transaction cases explicitly skipped by the existing jsdom guard. Both TypeScript checks and all 78 CI-route assertions passed. The skipped native cases remain unqualified locally; the existing foundation browser CI now requires their exact three native Chromium equivalents from training-draft-transactions-browser.cjs (no memory fallback), and must actually pass before that gap is closed; no browser, database, build, load or performance service was started for these checks.

Historical evidence is useful only within its unchanged scope: C21–C25 exercised actual native four-tool FINAL/report/export/permission paths. A07 completed its business chain but kept overall=false after cleanup removed two expired synthetic export files; a separate exact two-file repair preserved that original result. ABBA02 preserved full response equivalence and database/material protection but kept an unresolved outer-monitor AssertionError. The proposed analysis prepare-bundle showed no measured benefit and was reverted at 6d33. These are not new candidate acceptance results.

Training-specific browser/media and real database behavior still require actual selected functional CI outcomes. Survey tests cannot substitute for Training. Shared Cognitive/persistence consumers affected by the main integration are included in the affected regression scope. Application local-to-CI signed result admission is not implemented, so private local receipts are not presented as official GitHub gate success.

## CI route

The one-time explicit `.github/config/training-functional-ci.json` declaration, exact base and reviewed path boundary select this Training functional integration. It retains existing functional/security/build/migration/recovery gates. Only the canceled 200-completion performance case and phase-0 performance workflow are omitted. The two aggregate encryption/readability and terminal-idempotency cases must actually pass; the named performance case remains visibly unexecuted. Ordinary later PRs retain their existing defaults. Unknown changes or a moved base require explicit scope reconciliation.

Merge requires real success of the selected official checks and independent review. Build outputs and old A/B artifacts remain distinct. This document authorizes neither production deployment nor deletion of any historical answer, evidence or backup.
