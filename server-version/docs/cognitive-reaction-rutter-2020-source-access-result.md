# Cognitive Reaction｜Rutter 2020 Source Access Result

Date: 2026-09-09

Scope: COG-P4 §4.2.2 source-access/reproduction gate. This is scientific evidence documentation only. It does not create or activate an Assessment Reference, bind `TaskDefinition.references`, modify the Reaction scorer, alter FINAL, or write research data to the application database.

## 1. Repository execution gate

After synchronizing `origin/main@03cfa5b05918db9a3e3ac028a15470ba52459629` into `feat/cognitive-pilot-reference-v1`:

- main sync merge: `5bdda1d07e7e4173cc21bc7d682cb11fcb77fa95`
- tooling sync merge: `0ac4cdc30f1bad0464c7a97634b1b0277e57fa0b`
- conflicts: none
- Reaction derivation synthetic regression: 1 file / 4 tests PASS
- targeted P4 regression: 15 files / 100 tests PASS
- `cognitive:audit`: PASS; 28/28 exact identities, 9 PUBLISHED, 19 DRAFT, 15 eligible metrics, 0 non-scalar eligible metrics
- real PostgreSQL instrument-final: 12/12 PASS, 0 skip
- Cognitive AssessmentReferenceSet rows: 0
- ACTIVE Cognitive references: 0
- production Cognitive reference mappings: 0

## 2. Primary source

Rutter LA, Vahia IV, Forester BP, Ressler KJ, Germine L. *Heterogeneous Indicators of Cognitive Performance and Performance Variability Across the Lifespan.* Front Aging Neurosci. 2020;12:62.

- DOI: `10.3389/fnagi.2020.00062`
- PMID: `32210793`
- PMCID: `PMC7068851`
- declared OSF project: <https://osf.io/w5nge/>

The primary paper states that study data are available through that OSF project. The public article and supplementary PDF remain accessible, but they do not expose the participant/trial dataset required for the exact reproduction gate.

## 3. Source-access result

Work/local inspection attempted the OSF project page, official OSF API, metadata endpoints, and WaterButler file endpoint.

Observed result:

```text
OSF API: 401
metadata/file service: 403
anonymous usable source file: NONE
source filename: NOT AVAILABLE
source file size: NOT AVAILABLE
source SHA-256: NOT AVAILABLE
license/redistribution metadata: NOT RETRIEVABLE
README/data dictionary: NOT RETRIEVABLE
analysis code: NOT RETRIEVABLE
```

A separate Chat/web search found no public dataset mirror or author GitHub containing the Rutter participant/trial source. PMC/Frontiers/BioStudies point back to the same OSF source or to article/supplementary PDF material; those are insufficient to reconstruct exact K12 age-bin descriptive statistics without estimating from figures or inventing transformations.

## 4. Reproduction gate

Paper Table 1 reproduction targets remain:

```text
final analytic N = 10,060
Simple RT participant median: mean ≈ 301 ms, SD ≈ 60 ms
Simple RT ICV: mean ≈ 0.33, SD ≈ 0.17
```

Because no source dataset was retrievable:

```text
selected source rows: NOT RUN
participant-level schema: NOT CONFIRMED
trial-level schema: NOT CONFIRMED
paper reproduction: NOT EVALUATED
K12 age-bin derivation: NOT RUN
100-vs-200 ms sensitivity: NOT AVAILABLE
20-vs-30 trial sensitivity: NOT AVAILABLE
```

No value was estimated from figures, segmented-regression plots, or secondary summaries.

## 5. Protocol comparison remains valid

Rutter Simple RT:

- 3 practice + 30 scored trials
- 700–1500 ms variable interval
- 2000 ms response window
- RT <200 ms trimmed
- participant median RT and ICV = SD/mean
- mixed keyboard/touch web administration

Current Huisurvey Reaction:

- experience / standard / research = 8 / 20 / 60 scored trials
- 700–1500 ms foreperiod
- 2000 ms timeout
- current scorer accepts valid RT from 100 ms through timeout
- current deterministic median/ICV implementation remains unchanged

Therefore a 30-trial source cannot be silently applied to any 8/20/60 profile. Exact `profile + resolvedConfigHash` applicability remains fail-closed.

## 6. Scientific decision

```text
reaction.medianRtMs: DEFER
reaction.rtICV: DEFER
READY_NORMATIVE_BETA: 0
READY_DESCRIPTIVE_BETA from Rutter: 0
DRAFT candidate generated: NO
recommended production applicability: NONE YET
```

Reason: source-access/reproduction evidence is absent. `rtICV` additionally lacks RT-floor and trial-count sensitivity evidence.

This is not a failure of the Reference Core or measurement-applicability architecture. It is a source-evidence gate: the project deliberately refuses to convert published overall statistics or plotted age trends into a K12 reference without reproducible source data.

## 7. Re-entry condition

Rutter may be reconsidered only when one of the following becomes available:

1. authenticated read access to OSF `w5nge` with the source dataset and field documentation;
2. an author-provided/publicly archived mirror whose provenance can be tied to the study;
3. a direct public file link with verifiable source identity and checksum.

At re-entry, first reproduce Table 1, then derive source-faithful age bins, then evaluate `medianRtMs` and `rtICV` separately. No production binding is implied by source access alone.

## 8. Product gate

Current production state remains:

```text
AssessmentReferenceSet DB rows: 0
ACTIVE Cognitive references: 0
TaskDefinition.references production mappings: 0
percentile derivation: NO
age interpolation: NO
device correction: NO
COG-P4 §4.4 production binding: NOT STARTED
```

**COG-P4 §4.2.2: DEFERRED — source access blocked; derivation harness retained for future reproducible re-entry.**
