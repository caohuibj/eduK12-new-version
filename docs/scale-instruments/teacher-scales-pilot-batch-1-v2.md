# Teacher Scales PILOT Batch 1 v2

Baseline: `main@8ad8071ad9a1019c38be319865e4409e90021d82`  
Branch: `content/teacher-scales-pilot-batch-1-v2`

## Purpose

This batch uses the post-#158 assessment-content fast path and the post-#160
four-type Questionnaire/reporting product baseline.

The target is **PILOT-ready content**, not RESEARCH_READY. No
`scientificReview` is created. Package-level `releaseStatus=PUBLISHED` means the
deterministic content package is executable/product-ready; it does not install or
publish a database Scale.

Every new score must provide a complete descriptive result contract:

- score identity and direction;
- deterministic scoring and golden cases;
- respondent-facing headline and interpretation;
- at least two actionable guidance items;
- limitations;
- disclaimer;
- no invented norms, cutoffs, diagnostic labels, or causal claims.

## Batch scope

| Identity | Domain | Exact form | Teacher / China relevance | Rights posture |
| --- | --- | --- | --- | --- |
| `tswq_en@1.0.0` | teacher subjective wellbeing | canonical 8-item English TSWQ | teacher-specific; Chinese teacher revision evidence recorded, but no Chinese item wording imported | CC BY 4.0 source / attribution |
| `cbi_en@1.0.0` | personal, work and client-related burnout | canonical 19-item English CBI | large teacher validation; Chinese validation evidence recorded | NFA/free-exchange/public-domain treatment in source literature |
| `hse_msit_en@1.0.0` | psychosocial work environment / JD-R-adjacent work factors | official 35-item UK-English HSE Indicator Tool | applicable to school staff; no teacher-specific norm claimed | Crown copyright / Open Government Licence |
| `copsoq3_job_satisfaction_en@1.0.0` | job satisfaction | COPSOQ III International Middle JS1/JS4/JS5 | Chinese COPSOQ III long-version evidence recorded as contextual evidence, not exact-form Chinese equivalence | COPSOQ Network CC BY-NC-ND 4.0 + Network guidelines |
| `jcq_en@1.0.0` | job crafting / proactive work behaviour | canonical 15-item English JCQ | education-sector relevance and Chinese teacher contextual evidence; exact 1–6 English form preserved | research use explicitly granted with credit; commercial/redistribution remains restricted |

Existing `who5`, `dass21_zh_cn`, and `pss10_zh_cn` are not duplicated.

## Construct boundaries

### TSWQ

TSWQ measures positive teacher functioning at work through **School Connectedness**
and **Teaching Efficacy**, plus the published composite. It is not a general symptom
measure and not an objective teaching-performance score.

### CBI

CBI measures fatigue/exhaustion attributed to personal, work, and client contexts.
The canonical English word **client** is preserved. Teacher studies sometimes adapt
that referent to students, but that is a separately governed adaptation.

No overall burnout total is invented.

### HSE-MSIT

HSE-MSIT describes work-related psychosocial conditions:

- demands;
- control;
- managerial support;
- peer support;
- relationships;
- role;
- change.

It is not called a “JD-R scale”. The constructs overlap with demands/resources
research, but the package preserves the HSE identity and seven official scoring
dimensions. No total score is invented.

### COPSOQ III Job Satisfaction

This package intentionally imports only the International Middle Job Satisfaction
scale:

- JS1 — work prospects;
- JS4 — job as a whole;
- JS5 — salary.

The three items use the official 0/25/50/75/100 satisfaction mapping and are
averaged. It is a brief global occupational appraisal rather than a full facet
inventory.

### JCQ

JCQ measures **job crafting**, a proactive process of shaping tasks, cognitions and
work relationships.

It must not be relabeled as:

- Taking Charge;
- employee voice;
- proactive personality;
- organizational citizenship behaviour;
- innovative work behaviour.

All JCQ scores use `higher_is_more`, not `higher_is_better`. More frequent
crafting is not assumed to be universally adaptive.

## Report safety

All five instruments use score-only descriptive interpretation with no population
reference sets in this batch.

Reports explicitly avoid:

- diagnosis;
- severity labels not defined by the source;
- teacher accountability;
- employment selection;
- school ranking;
- causal claims;
- unsupported group comparison;
- invented Chinese norms.

The batch-specific report test builds a real `ScaleResultV2` from an interpretable
golden case for every instrument and requires complete interpretations, guidance,
limitations and disclaimers.

## Rights and deployment boundary

Instrument source metadata is not a durable production authorization.

The existing `InstrumentAuthorization` and deployment policy remain authoritative.
In particular:

- JCQ is restricted to non-commercial use in this source package until additional
  rights review closes commercial/redistribution scope.
- COPSOQ use must follow Network attribution/guidelines and national-version
  coordination rules.
- No instrument in this PR is installed or database-published.

## Deferred candidates

### Morrison & Phelps Taking Charge

Scientifically close to the requested “主动担责行为”, but deferred because the
canonical rater identity and publication permissions are not sufficiently closed for
a clean executable package. JCQ is included as a related **job-crafting/proactive
work behaviour** construct, not as a substitute identity.

### MOAQ Job Satisfaction

Useful three-item global job-satisfaction measure, but source/redistribution rights
are less clean than COPSOQ III. COPSOQ III Job Satisfaction is used for this first
PILOT batch because exact wording, scoring and licence guidance are clearer.

### JSS / BIAJS / full COPSOQ III

Retained for later source/authorization review. They are not needed to make this
first teacher battery scientifically useful.

## Deterministic validation

The #158 content fast path is authoritative for this PR. It runs:

- Scale onboarding/content boundary;
- generated registry drift;
- scientific qualification;
- targeted non-Postgres Scale regression;
- assessment product-readiness inventory;
- backend TypeScript compile.

It intentionally does not run unrelated frontend, SJT browser, Docker, CodeQL or
full PostgreSQL regression for this pure instrument-owned content change.
