# Wave 1 P1 — Implementation Status

Date: 2026-09-20
Branch: `content/scale-expansion`
Baseline: `main@e10b77af73e3fad6bc62aa941dc883b7bd452c21`

## Implemented

### Existing executable P1 families

- **WHO-5**
  - existing executable Simplified Chinese package retained unchanged;
  - existing scoring/report runtime retained unchanged;
  - mainland-China university validation (Fung et al., 2022; N=1,414) is now surfaced in the expanded Library evidence view;
  - evidence boundary explicitly states that this study does **not** directly validate the current product's 9–18 K-12 entry boundary;
  - no Chinese norm/percentile/diagnostic reference has been activated.

- **SDQ**
  - existing Parent zh-CN and Teacher EN T4–10 packages retained unchanged;
  - electronic-administration authorization gate retained;
  - Du, Kou & Coghill (2008) Shanghai validation evidence is surfaced;
  - evidence boundary records 3–17 parent/teacher and 11–17 self-report coverage plus weaker psychometrics for some subscales;
  - Teacher package explicitly warns that Chinese validation evidence is not exact-form evidence for the current English executable localization;
  - no local cut-off/norm record has been activated automatically.

### Catalog-first P1 instruments

The following are now visible in Scale Library as `REVIEWED + PILOT`, but intentionally have no executable package and are always `NOT_AVAILABLE`:

- **DASS-21 Mainland zh-CN (14+)**
- **GSE zh-CN**
- **MPFI-24 zh-CN**
- **PSS-10 zh-CN**

For each entry the platform now exposes canonical identity, construct/domain, respondent and validation-population boundary, administration burden, localization provenance, evidence, rights status, planned report constraints, and explicit launch blockers.

No protected item text or scoring transforms are exposed through the Library payload.

## DASS-21 product decision (2026-09-20)

The standard DASS-21 line is now explicitly separated from the future youth line.

- Standard DASS-21 product boundary: **age 14+**.
- Under 14: separate **DASS-Y** instrument identity/package; never route under-14 participants into DASS-21 by relaxing the age gate.
- Mainland Chinese evidence now records Gong et al. (2010; university N=1,779), Wen et al. (2012; Mainland adults N=730, age 18–85) and Wang et al. (2016; university N=1,815 plus clinical/control samples).
- The earlier child evidence is no longer used as the primary validation basis of the standard 14+ product; DASS-Y will receive its own evidence review.

### DASS respondent feedback

Authoritative Depression / Anxiety / Stress scoring may be calculated and stored internally, but the student/ordinary respondent view must not expose:

- numeric DASS scores;
- severity bands;
- percentile/norm position;
- a mental-health status label;
- score-conditioned automated individual interpretation.

The student-facing completion experience is non-score-conditioned descriptive/educational feedback only. Generic support guidance is allowed and must not be triggered by a hidden score threshold.

A dedicated policy overlay now exposes these constraints in Scale Library governance. The DASS entry remains non-launchable until the runtime enforces them.

### Mainland zh-CN wording revision

`docs/scale-library/dass21-mainland-zh-cn-v1-draft.md` now contains a complete 21-item Mainland wording draft, respondent instructions, response anchors and scoring-key mapping.

The revision is intentionally marked **NON-EXECUTABLE**. It is a new Mainland localization revision based on the English source plus direct Mainland Simplified-Chinese evidence; it does not claim that the newly written sentences themselves are already an exact validated form.

Before the wording enters a code-owned package it still requires bilingual expert semantic review, Mainland cognitive debriefing (including 14–17-year-olds), and a small bridging psychometric review.

## Other report designs

### GSE

Planned dimension: generalized self-efficacy. The report will describe self-reported coping/agency beliefs only and must not represent the score as intelligence, academic attainment, objective ability or executive-function performance. No norm percentile is planned without a version-matched reference set.

### MPFI-24

Planned primary dimensions: psychological flexibility and psychological inflexibility. They remain related but distinct process dimensions. No diagnosis or treatment-effect claim is allowed. Lower-level process scores may be added only after the exact 24-item Chinese scoring map is frozen and verified.

### PSS-10

Planned dimension: perceived stress. The report describes perceived unpredictability/uncontrollability/overload during the recall period. No clinical cutoff or normative rank is enabled.

## Engineering changes

- `ScaleCatalogRegistry` permits `CANDIDATE`/`REVIEWED` catalog-first entries without packages as warnings; `ACCEPTED` entries still fail closed when the package is missing.
- The original Wave 0 `buildScaleLibraryReadModel()` remains unchanged.
- `scaleLibraryController` serves the expanded read model and applies the DASS-21 product-safety overlay.
- Candidate entries cannot receive a launch route merely because an authorization exists.
- DASS catalog metadata now enforces the intended **14–100** discovery boundary and records DASS-Y as a separate future identity.
- The Scale Library frontend recognizes `SELF_EFFICACY`, describes candidate reports as design previews, and no longer labels the library as Wave-0-only.

## Tests added / updated

`scale-library-wave1-p1.test.ts` covers:

- `REVIEWED + PACKAGE_MISSING` warning semantics;
- six existing entries + four catalog-first entries;
- all four catalog-first entries remain `NOT_AVAILABLE`;
- authorization alone cannot make a candidate launchable;
- existing filtering semantics;
- Chinese validation populations without norm/diagnostic claims;
- WHO-5 and SDQ evidence without activating references;
- DASS-21 `minAge=14`, separate DASS-Y routing decision, and removal from under-14 filters;
- DASS respondent-facing report policy: no numeric score, no score-conditioned interpretation, and explicit API/age runtime blockers.

## Remaining blockers before executable-package promotion

| Instrument | Blocking work |
| --- | --- |
| DASS-21 | (1) implement respondent-safe final-submit/read projection that strips authoritative result from student/respondent/public-session responses while preserving authorized professional access; (2) implement auditable `age >= 14` runtime admission using an authoritative age source; (3) finish expert/cognitive/bridging review of the Mainland wording draft; then freeze the executable package and golden scoring fixtures. |
| GSE | Freeze exact Chinese form and represent the restricted/password-protected online-use condition; do not publish the full scale openly. |
| MPFI-24 | Freeze exact Simplified Chinese item/scoring source and record redistribution/digital-use provenance. |
| PSS-10 | Record MAPI/ePROVIDE permission plus Chinese translation rights before item text enters a code-owned package. |

## DASS runtime finding

The current generic `scaleAssessmentForResponse()` includes the decrypted `result`, and both legacy and Unified final-submit paths return that response-safe assessment to the caller. Therefore simply hiding score UI is insufficient for DASS. A package/policy-aware respondent projection is required before publication so the score cannot be recovered from the normal student final-submit API.

The `User` schema currently has no canonical date-of-birth/age field. Library `minAge=14` therefore cannot by itself provide a hard age gate. The executable design must select an auditable age source and fail closed when age eligibility is required but unknown.

## Verification state

The branch has no pull request and ordinary branch pushes do not trigger the repository's PR CI workflow. There is therefore **no CI result to claim**. The changes have been statically reviewed for schema/gate compatibility, but backend `tsc`, Vitest and frontend build should be run when this content branch is promoted to a PR or otherwise executed in a CI-capable environment.
