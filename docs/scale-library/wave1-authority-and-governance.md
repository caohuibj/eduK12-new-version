# Learning Motivation Wave 1 — authority and version governance

Baseline main: f70078ad (2026-10-01). Supplement 1 is primary, supplement 2 is discussion, the student self-concept example is the report language standard.

PRs #211/#212/#213 are merged. #211 already fixed revoked inbox metadata, Parent inaccessible library link, and /organization-tasks redirect/returnTo. No second authority architecture is introduced. Existing standalone Scale creator/legacy UserRole.ADMIN management/export is explicitly LEGACY_STANDALONE_SCALE policy, restricted to standalone attempts, without Organization Run delivery or governed report privileges. It is preserved as a declared exception; migrating it requires account/capability mapping, not inferred role promotion. SYSTEM_ADMIN and ORG_ADMIN alone confer no personal Organization report access.

Production relational registry is empty. The six wave instruments are student SELF reports; Teacher Subject Liking measures student perception and is not a Teacher→Student product. External Parent longitudinal, observer→subject feedback, raw/trial research disclosure and legacy history conversion remain unsupported.

New versionAxes opt-in keeps measurement hash stable for report/reference updates. Legacy full-definition hashes stay unchanged. Instrument/localization/scoring changes affect measurement identity; reportVersion/referenceVersion/catalogManifestVersion are separate. Existing frozen attempts/results preserve the original report and reference.

DRAFT→ACTIVE→SUPERSEDED→RETIRED. Reviewed reference activation is Serializable, instrument-locked and scope-specific. Published governed payloads are immutable and undeletable at the database layer. Governed hash excludes lifecycle status, so frozen replay works after supersession/retirement; legacy hash semantics remain intact. Theoretical references have null sample N and no empirical statistics. Historical local references are not national norms; empirical bands require 3–5 supported intervals and auditable allocation/provenance. No recalibration occurs on FINAL.

Report publication/QC binds respondent, audience, locale and reportVersion. Required: overview, understandable explanation, situated reflection, concrete action, limitations. Student language addresses middle-school experience; Parent language addresses family support; Teacher language addresses classroom practice. An absent audience version must fail closed, never reuse student copy for an adult audience. Existing restricted-report policies remain effective.

Notion principle updated and verified in Scale Library, Scientific Maturity Governance and Bundle Report Design on 2026-10-01.

## Report publication gate
New governed packages require a respondent/audience/locale contract and recorded editorial review. CI checks explanation coverage, reflection, actionable steps and boundaries for every score and band. Student copy is blocked from teacher/researcher interpretations unless a matching authored audience version is supplied. Automatic structural checks complement editorial review; length and keyword checks do not establish readability alone.

Canonical Scale metrics carry the exact original reference hash, measurement identity, subject, stage, locale, direction and range. Individual longitudinal generation defaults to the later reference attached to selected measurements. It freezes the resolution decision and references into the artifact; normal reads never look up a newer version. Explicit regeneration may select the latest compatible ACTIVE reference. Cross-stage or incompatible measurements use time-matched positions without claiming numeric equivalence.

## Independent axis revisions
Installation records append-only `scale_axis_snapshots` with instrument/scoring/report/reference/localization/catalog versions and the exact source hash. Report-only changes must increase reportVersion and retain the exact measurement hash. Reference-only changes require new reference identities. A changed current definition returns to DRAFT until the normal publication gate passes; old completed reports and frozen unified runtimes retain their content. An existing axis identity cannot acquire different source bytes. Measurement or localization changes require a new exact instrument identity; the installer deliberately refuses in-place measurement replacement.

References now bind the exact measurement hash, not only an author-declared version number. Calibration statistics and display projections use eight decimal places before JSONB persistence to keep hashes stable across database round trips. Exact encrypted canonical scoring bytes and canonicalResultHash remain the audit source. This is display/snapshot precision, not a change to scoring.
