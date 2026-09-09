# Cognitive Reaction｜Rutter 2020 Open-Data Derivation Gate

Date: 2026-09-09

Scope: COG-P4 §4.2.2 scientific/offline derivation only. This document does **not** activate a reference, create a database row, bind a reference to `TaskDefinition.references`, alter the Reaction scorer, or change FINAL runtime behavior.

## 1. Source identity

Primary source:

- Rutter LA, Vahia IV, Forester BP, Ressler KJ, Germine L. *Heterogeneous Indicators of Cognitive Performance and Performance Variability Across the Lifespan.* Front Aging Neurosci. 2020;12:62.
- DOI: `10.3389/fnagi.2020.00062`
- PMID: `32210793`
- PMCID: `PMC7068851`
- Article: <https://www.frontiersin.org/journals/aging-neuroscience/articles/10.3389/fnagi.2020.00062/full>
- OSF project declared by the paper: <https://osf.io/w5nge/>

The paper reports a final analytic sample of `N=10,060` after exclusions. Participants were web volunteers, ages 10–96 overall; age-specific visualization was restricted to ages with at least 25 participants, yielding an effective plotted range of 10–70 years.

## 2. Source Simple RT protocol

Verified from the primary paper:

- 3 practice trials;
- 30 scored Simple RT trials;
- response window: 2000 ms;
- variable interval: 700–1500 ms;
- response by space bar or touch screen;
- Simple RT values `<200 ms` trimmed;
- participants with more than six trimmed trials on each task, or chance/below-chance Choice RT, were excluded from the final analytic sample;
- participant metrics include mean RT, median RT, SD RT and ICV (`SD RT / mean RT`).

Paper Table 1 overall Simple RT summaries used as the reproduction gate:

| metric | paper overall mean | paper SD |
|---|---:|---:|
| median RT | 301 ms | 60 ms |
| ICV | 0.33 | 0.17 |

These values are **reproduction checks**, not Huisurvey reference values.

## 3. Current Huisurvey Reaction identity

Published exact identity:

```text
reaction / engineVersion 1.0.0 / scoringVersion 1.1.0
```

Current profiles:

```text
experience = 8 scored trials
standard   = 20 scored trials
research   = 60 scored trials
```

Current scorer facts relevant to comparability:

- valid RT floor is 100 ms, not the source study's 200 ms trim;
- valid RT upper boundary is the configured timeout;
- `medianRtMs` is the median of valid RTs;
- `rtICV` is current scorer SD(valid RT) / mean(valid RT);
- current scorer implementation uses its own deterministic SD implementation and must not be changed to imitate a literature source inside COG-P4.

Therefore `medianRtMs` and `rtICV` must be judged separately. Matching construct names are not sufficient for numerical reference admission.

## 4. Chat-prepared offline harness

Repository tooling:

```text
server-version/backend/src/scripts/research/reaction-rutter-2020-derivation.ts
```

Synthetic regression:

```text
server-version/backend/src/__tests__/cognitive/reaction-rutter-2020-derivation.test.ts
```

The harness deliberately:

- performs no network requests;
- accepts a local CSV supplied explicitly by the researcher;
- requires explicit column mapping for age, participant median RT and participant ICV;
- supports explicit equality filters for selecting the paper's final analytic sample;
- records the source filename and SHA-256;
- aggregates participant metrics overall and by integer source age;
- checks the overall source aggregates against the paper's reported `301 (60)` and `0.33 (0.17)` values;
- never interpolates age;
- never computes percentiles, z or T scores;
- only creates a `DRAFT + descriptive_sample + literature_beta + literature_derived_estimate` candidate when the reproduction gate passes and candidate metrics are explicitly selected;
- never writes to the application database.

Example command shape after the OSF columns are inspected:

```bash
cd server-version/backend
npx tsx src/scripts/research/reaction-rutter-2020-derivation.ts \
  --input=/absolute/path/to/source.csv \
  --age-column=<SOURCE_AGE_COLUMN> \
  --median-column=<SOURCE_SIMPLE_RT_MEDIAN_COLUMN> \
  --icv-column=<SOURCE_SIMPLE_RT_ICV_COLUMN> \
  --filter=<OPTIONAL_ANALYTIC_SAMPLE_COLUMN>=<VALUE> \
  --output=/tmp/reaction-rutter-2020-aggregate.json
```

Do **not** pass `--candidate-metrics` until the source reproduction output has been inspected.

## 5. Required source inspection before execution

The OSF project must first be inspected to establish:

1. exact source filename(s);
2. file SHA-256;
3. source license / redistribution conditions if stated;
4. whether the available data are participant-level derived metrics, trial-level raw data, or both;
5. exact age column semantics;
6. exact Simple RT median and ICV column semantics;
7. any final-sample inclusion/exclusion flag used by the authors;
8. whether participant IDs and trial order permit a 20-vs-30 trial sensitivity analysis.

If the source does not expose participant-level median RT and ICV columns compatible with the harness, **do not guess mappings and do not reshape the source ad hoc**. Record the actual schema and return for a tooling revision.

## 6. Reproduction gate

Before producing any candidate evidence, reproduce the paper's overall analytic summary.

Required report:

```text
source rows selected
medianRtMs N / mean / SD
rtICV N / mean / SD
paper-vs-derived delta
PASS / FAIL for each metric
```

The current harness uses deliberately narrow rounding tolerances around the published Table 1 values. Failure means the source columns/filtering do not yet reproduce the paper and no candidate should be minted.

The two metrics are scientifically separable: a later revision may admit `medianRtMs` while deferring `rtICV` if the source supports one more strongly than the other. No production mapping is implied by reproduction alone.

## 7. Age-specific derivation

If the reproduction gate passes:

- aggregate by the source's integer age year;
- encode age `Y` as applicability `[Y*12, (Y+1)*12)` months only for exact matching;
- explicitly state that this encoding does not imply month-level empirical precision;
- do not interpolate missing ages;
- do not use nearest-age fallback;
- retain the source bin sample size for every metric/age entry;
- do not use an age bin that falls below the source study's own minimum display threshold (`N<25`) without a new scientific review.

Initial K12-focused audit range may inspect ages 10–18, subject to actual source coverage and sample sizes.

## 8. Trial-level sensitivity, only if raw trials are available

If the OSF source includes reliable trial-level Simple RT data and trial order, perform offline sensitivity analyses before recommending a production applicability mapping:

### RT floor

Compare source-faithful `<200 ms` trimming with an exploratory 100 ms lower floor. Report participant-level changes in median RT and ICV. This is sensitivity analysis only; it must not rewrite the published source statistics.

### 20 vs 30 scored trials

Compare the source-faithful 30-trial metric with the first 20 scored trials when trial order is authoritative. Report at least mean/median absolute difference and correlation for participant median RT and ICV.

Do not synthesize a 60-trial reference from a 30-trial source.

If trial-level data or ordering are unavailable, explicitly mark these analyses `NOT AVAILABLE`.

## 9. Candidate classification

Any candidate emerging from this gate is capped at:

```text
referenceKind   = descriptive_sample
evidenceLevel   = literature_beta
provenanceType  = literature_derived_estimate
status          = DRAFT
```

It is not:

- a normative distribution;
- a percentile table;
- a K12 population norm;
- a Chinese norm;
- a device-specific norm;
- a validated norm.

Expected product language later, if separately approved and bound, is “试行参考 / Pilot Reference”.

## 10. Measurement applicability remains separate

This derivation file does not decide production binding. The existing COG-P4 measurement applicability contract requires exact frozen:

```text
profile + resolvedConfigHash
```

A future approved mapping must explicitly list the allowed profile(s) and resolved config hash(es). Omission is not a wildcard and mismatch must remain `measurement_mismatch`.

Given the source uses 30 scored trials:

- `experience=8`: no default applicability;
- `standard=20`: requires 20-vs-30 sensitivity evidence before approval;
- `research=60`: cannot be assumed equivalent to a 30-trial source.

`recommended production applicability = NONE YET` is the default until source execution provides evidence.

## 11. Repository and privacy boundary

Never commit participant-level OSF rows to this repository.

Permitted future committed artifacts are limited to:

- derivation code;
- source metadata and SHA-256;
- aggregate, non-identifying age-bin statistics;
- a validated DRAFT reference definition;
- limitations and derivation provenance.

No OSF download, external API, research data parsing, or statistical derivation may enter server startup, FINAL scoring, report generation, Reference resolution, or a database transaction.

## 12. Current status

```text
Chat-side derivation harness: IMPLEMENTED
Synthetic regression tests: IMPLEMENTED, not executed in Chat
OSF source inspection: PENDING local/Work execution
Paper reproduction: PENDING
Age-bin aggregate derivation: PENDING
Trial-level sensitivity: PENDING source capability
DRAFT reference candidate: NOT CREATED
AssessmentReferenceSet DB rows: 0
ACTIVE references: 0
TaskDefinition.references production mappings: 0
COG-P4 §4.4: NOT STARTED
```
