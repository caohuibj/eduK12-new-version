# Teacher Scale Batch 1 — Source and Review Record

Baseline: `main@46d0efb6c6a44d83f350b9277ad6660e0d50efca`  
Content branch: `content/teacher-scale-batch-1`

## Governance boundary

This batch is an instrument-content onboarding change. It does not change the shared
Scale scorer, handwritten registry, runtime, FINAL, report core, admission core, or
generic Scale infrastructure.

All three new exact identities remain:

- `catalogStatus=CANDIDATE`
- `scientificMaturity=PILOT`
- `executable.releaseStatus=PUBLISHED`
- no `scientificReview`
- no production authorization record
- no install/apply or publication action

AI-assisted source research and authoring are not human scientific approval.
Publication remains subject to reviewed authorization, scientific review, installation
preview/apply, publication preview and proofHash apply.

## Batch identities

| Identity | Construct | Exact content | Rights basis | Runtime |
|---|---|---|---|---|
| `tswq_en@1.0.0` | teacher subjective wellbeing | canonical English TSWQ, 8 items | CC BY 4.0 | existing generic scorer |
| `cbi_en@1.0.0` | personal/work/client burnout | canonical English CBI, 19 items | freely distributed / public-domain treatment in source literature | existing generic scorer |
| `hse_msit_en@1.0.0` | psychosocial work environment | official UK-English HSE 35-item Indicator Tool | Crown copyright under Open Government Licence | existing generic scorer |

No new scorer or runtime primitive is required.

---

## TSWQ — Teacher Subjective Wellbeing Questionnaire

### Why this instrument

TSWQ adds a teacher-specific positive occupational-wellbeing construct that is not
duplicated by the existing WHO-5, DASS-21, or PSS-10 identities. Its published
structure separates school connectedness and teaching efficacy and also permits the
eight-item composite.

### Source identity

- Renshaw TL, Long ACJ, Cook CR. (2015). *Assessing teachers' positive
  psychological functioning at work: Development and validation of the Teacher
  Subjective Wellbeing Questionnaire.* School Psychology Quarterly, 30(2), 289–306.
  DOI: https://doi.org/10.1037/spq0000112
- Measure/user-guide source: https://osf.io/6548v
- The reviewed user guide specifies:
  - 8 items
  - past-month frame
  - four response anchors, 1–4
  - no reverse-scored items
  - school connectedness = items 1,3,5,7
  - teaching efficacy = items 2,4,6,8
  - composite = all 8 items
- The source also permits average-anchor presentation by dividing sums by the
  number of contributing items. This package freezes the canonical integer sums;
  it does not create a second redundant mean score.

### Rights

The measure materials state CC BY 4.0 and permit use, sharing, and adaptation with
attribution and indication of changes. A 2022 permission letter from Tyler L.
Renshaw also describes the TSWQ and related measures as freely available under
CC BY 4.0.

This source therefore records redistribution as allowed. Production authorization
must still record the rights basis; source metadata is not a durable grant.

### Evidence

- Original 2015 development: two-factor structure and initial psychometric evidence.
- Mankin et al. (2018), DOI https://doi.org/10.1177/0734282917707142:
  CFA/measurement-invariance work in 1,883 teachers.
- Xie et al. (2024), DOI
  https://doi.org/10.16128/j.cnki.1005-3611.2024.04.030:
  Chinese revision in 1,463 teachers from 56 middle schools in nine mainland
  provinces, with CFA, reliability, one-month retest and invariance analyses.

The Chinese study is evidence metadata only. This batch **does not reconstruct or
translate the Chinese items** and makes no zh-CN exact-form claim.

### Scoring and golden cases

Scores:

1. `school_connectedness` — sum, range 4–16
2. `teaching_efficacy` — sum, range 4–16
3. `teacher_subjective_wellbeing` — sum, range 8–32

Golden cases cover minimum, maximum, midpoint, subscale separation and missing
response. Invalid response values are tested separately. Missing responses fail
closed because the canonical guide does not specify a partial-score rule used here.

### Proposed maturity

`PILOT`.

No human scientific review has been inserted. A later RESEARCH_READY decision
should define exact population, territory and use scope and select reviewed evidence
under the current Huisurvey scientific qualification contract.

---

## CBI — Copenhagen Burnout Inventory

### Why this instrument

CBI complements general distress instruments by explicitly separating fatigue/
exhaustion into personal, work-related and client-related attribution. A large
teacher validation exists, while the canonical package remains the original generic
occupational English form.

### Source identity

- Kristensen TS, Borritz M, Villadsen E, Christensen KB. (2005).
  *The Copenhagen Burnout Inventory: A new tool for the assessment of burnout.*
  Work & Stress, 19(3), 192–207.
  DOI: https://doi.org/10.1080/02678370500297720
- Official NFA questionnaire/materials:
  https://nfa.dk/vaerktoejer/spoergeskemaer/spoergeskema-til-maaling-af-udbraendthed-cbi/copenhagen-burnout-inventory-cbi

Canonical structure:

- Personal burnout: 6 items
- Work-related burnout: 7 items
- Client-related burnout: 6 items
- response scoring: 100 / 75 / 50 / 25 / 0
- work-related final energy item: reverse-scored
- each subscale score: arithmetic mean
- minimum answered:
  - personal: 3 of 6
  - work-related: 4 of 7
  - client-related: 3 of 6

No overall CBI total has been invented.

The PUMA source notes that CBI content was mixed with other questionnaire items to
reduce stereotyped response patterns. This standalone package preserves wording,
response mappings and scoring, but does not claim to reproduce the broader PUMA
questionnaire layout.

### Rights

The original development program describes a policy of exchanging the questionnaire
and information free of charge because it was developed with public resources.
Teacher validation literature explicitly describes CBI as a public-domain
questionnaire, and NFA continues to distribute the source materials.

The exact rights provenance is retained in source metadata, but production deployment
still requires a reviewed `InstrumentAuthorization`; the repository declaration is
not itself the durable authorization grant.

### Evidence

- Kristensen et al. (2005): original development and psychometric evidence.
- Fiorilli et al. (2015), DOI https://doi.org/10.4473/TPM22.4.7:
  validation in 1,497 teachers, supporting three correlated factors. The study
  contextualized the client-related domain as student-related burnout.
- Fong, Ho & Ng (2014), DOI
  https://doi.org/10.1080/00223980.2013.781498:
  Chinese CBI validation in 312 Hong Kong human-service workers with follow-up
  reliability evidence.

The present executable deliberately retains the canonical term **client**.
Replacing it with **student** is an adaptation and must be separately governed.
No Chinese wording is included.

### Scoring and golden cases

Golden cases cover:

- all minimum
- all maximum
- all midpoint
- the reverse-scored work-energy item
- one missing personal item while above the source minimum
- personal subscale below the minimum answered threshold
- invalid response value in instrument-specific tests

The current generic scorer's `prorate_if_min_answered` behaviour is appropriate
for the source rule because CBI scores are means: when the source minimum is met,
the mean of available items is retained and marked limited; below minimum it becomes
not calculable.

### Proposed maturity

`PILOT`.

No diagnostic cutoffs, severity labels, population norms or teacher-performance
interpretations are included.

---

## HSE Management Standards Indicator Tool

### Why this instrument

The HSE Indicator Tool operationalizes psychosocial work conditions relevant to a
JD-R-style teacher research programme without pretending that a single universal
"JD-R Scale" exists. It measures concrete work factors and can be used alongside
wellbeing, burnout, satisfaction and proactive-behaviour measures.

### Source identity

- Official questionnaire:
  https://www.hse.gov.uk/stress/assets/docs/indicatortool.pdf
- HSE Management Standards resources:
  https://www.hse.gov.uk/stress/standards/
- Validation:
  Edwards JA, Webster S, Van Laar D, Easton S. (2008).
  *Psychometric analysis of the UK Health and Safety Executive's Management
  Standards work-related stress Indicator Tool.*
  DOI: https://doi.org/10.1080/02678370802166599

The official tool has 35 items and seven scored dimensions:

1. demands
2. control
3. managerial support
4. peer support
5. relationships
6. role
7. change

HSE often describes six Management Standards conceptually because Support is one
standard; the questionnaire scoring separates managerial support and peer support,
which yields seven score dimensions.

The package uses the source item direction, including reverse scoring for items
3, 5, 6, 9, 12, 14, 16, 18, 20, 21, 22 and 34. Each dimension is the mean of its
source-defined items on a 1–5 scale, with higher scores indicating a more favourable
reported psychosocial work environment.

No overall total score has been invented.

### Missing responses

The reviewed public source material did not establish an exact digital partial-score
rule suitable for deterministic implementation. The released executable package therefore uses
`complete_required` within each dimension.

This is deliberately conservative. It can be relaxed only after a traceable source
for the intended missing-data rule is reviewed; the package does not infer or invent
imputation.

### Rights

HSE website Crown material is reusable under the Open Government Licence. The
source record requires attribution and excludes the HSE logo/branding.

The questionnaire is also distinct from separately licensed hosted survey services.
This package reuses the official questionnaire content; it does not bundle or claim
rights to an HSE-hosted SaaS service and must not imply HSE endorsement.

### Evidence

Edwards et al. (2008) evaluated the 35-item tool in 26,382 employees across 39 UK
organisations and tested the multidimensional factor structure.

This batch does not claim a teacher-specific norm or mainland-Chinese validated
exact form. An official HSE Chinese questionnaire exists, but it requires a separate
locale/provenance/evidence decision before creating a Chinese executable identity.

### Proposed maturity

`PILOT`.

The instrument should be used as one source in psychosocial risk/research assessment,
not as an individual diagnosis or a standalone teacher-accountability measure.

---

## Existing measures reused rather than duplicated

Teacher Batch 1 intentionally does not create new copies of:

- `who5@1.0.0`
- `dass21_zh_cn@1.0.0`
- `pss10_zh_cn@1.0.0`

Teacher-population evidence can be added to those existing identities when source
scope justifies it. PSS-10 remains authorization-sensitive in the existing source.

---

## Authorization-pending candidates retained for subsequent batches

The following remain research/source records rather than production executables:

- BIAJS — brief global affective job satisfaction; strong fit for longitudinal
  teacher measurement, but rights require permission closure.
- Morrison & Phelps Taking Charge — closest construct to “主动担责行为”; authorization
  and exact rater identity (coworker/observer vs self-report adaptation) must be
  resolved before package authoring.
- JSS legacy — exact form and scoring are available; deployment conditions,
  especially commercial SaaS scope and translation rights, need authorization review.
- COPSOQ III — strong broad psychosocial-work candidate; exact international version,
  national-language adaptation rules and deployment licence scope need final freeze.

---

## Deterministic validation target

From `server-version/backend`:

```bash
npm run scale:instruments:generate
npm run scale:instruments:check
npm run scale:onboarding:check
npm run scale:qualification:check
npm run build
npm test -- src/__tests__/scale/instruments
```

No install or publication command belongs in this content PR.

## Regression-test prerequisite resolved

PR #156 (`test(scale): keep onboarding regression checks extensible`) was merged to
`main` before this content branch was refreshed. It replaced the two stale Wave-0
exact-count assertions with the intended compatibility contract:

- the historical six executable identities remain the ordered compatibility prefix;
- the four Wave-1 catalog fixtures remain explicitly testable;
- later executable identities may be added without rewriting shared runtime code.

Teacher Scale Batch 1 has now merged that `main` prerequisite. No shared scorer,
runtime, registry, FINAL, report or admission change is required by these instruments.
