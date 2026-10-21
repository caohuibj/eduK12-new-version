# GAD-7 Simplified Chinese research materials, version intent 1.0.0

**Unregistered research materials, not an executable or import package.** No
runtime registration, database install, publication, generator, CI, merge or
participant data. New translation permission does not mean developer endorsement.
AI text review is not human review, psychometric validation or medical approval.

## Selected form and contents

This version preserves the NCBI-hosted developer standalone seven-item form:
two-week recall, four explicit 0/1/2/3 response values, original order and identity
sum 0–21. The original article's extra functional-difficulty question is NOT
part of this selected standalone form and is not appended. No attention or
safety-screening item is added. No PHQ-9 item-9 logic is imported into GAD-7.

- `content-draft.json`: exact selected English text and new Chinese working
  translation, independent platform instructions and version intent.
- `source-and-rights.json`: source SHA, URLs, attribution, instrument grant and
  original English adult-study thresholds strictly as review metadata. No
  journal/manual PDF, uncertain Chinese mirror text or artwork redistributed.
- `scoring-contract.json`: strict numeric values, sum of seven, no imputation,
  diagnosis or category. Completeness-for-total is our product draft policy,
  not an attributed official missing-data rule; respondents may skip or leave.
- `golden-fixtures.json`: synthetic zero/max/ones, boundary arithmetic, each
  missing symptom, invalid type/range and duplicate-response cases.
- `report-design.json`: total/21 only, limitations and unconditional support
  notice, layered prose and methods. No imported English category labels.
- `validation.json`: single JSON/provenance/math check, not runtime verification.

## Real runtime and review gates

1. ScaleDefinitionV2 has no independent administration-instructions slot. Keep
   the two-week prompt, draft notice and platform support outside original item
   wording and visible before/during answers, including incomplete attempts.
2. Versioned report QC requires a truthful reviewer, timestamp and basis. The
   schema does not require that reviewer to be human; AI review must identify
   itself honestly. scientificReview is a separate human-reviewed maturity
   claim and is not created here. ADULT_SELF with audience=student is already
   supported: student is the technical respondent/subject report audience, not
   an age restriction. Actual call-site disclosure, adult-facing wording and
   report projection remain unverified; scientific age applicability remains
   unchanged. No fabricated audience or reviewer is needed.
3. Standard instruments already support descriptive raw-score prose through
   report.interpretations with source=score_only. Only the separate self-authored
   rawScoreFeedback feature is prohibited for STANDARD; this does not prevent a
   legitimate descriptive report. Do not relabel GAD-7 to bypass that feature guard.
4. Human/expert translation review, cognitive debrief, local psychometric
   evidence, population suitability and privacy/consent/retention remain open.
   No scientificReview or deployment authorization has been created.
5. The page is unmonitored and promises no automatic contact. Neither low nor
   high scores constitute a suicide-risk assessment or a diagnosis.
6. Runtime media require installed raster asset identities. No fabricated
   StoredAsset ID or third-party figure is supplied; preview asset is pending.

These are independent research JSON schemas, not ScaleInstrumentSourceV1.
There is no instrument.ts. Catalog-only discovery is a separate possible later
scope; this package itself creates no catalog entry or executable registration.

## Minimal verification scope

GAD-7 materials only → JSON structure, frozen English/source binding, synthetic
integer sum/rejection expectations → one local pure-data check → retain output,
no application suite or CI repetition → about one minute. This cannot establish
runner behavior, rendering, human review, clinical safety or validity.
