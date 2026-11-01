# B09 亲职负担、信心与支持

This DRAFT adds `parenting_burden_efficacy_zh_cn@0.1.0`: 28 existing items, adult parent/carer SELF. The current uninstalled draft revision uses package schema3 / engine1.2.0 and depends on shared candidates #502/#503; it is not compatible with the older main parser until that integration lands. It does not install, publish, approve, merge, deploy, alter historical records, or modify either leaf instrument. Complete project design and shared Bundle specifications were read before implementation. Only project-authored declarations/report text and public bibliographic metadata are added; private source locations, file metadata, design documents and item text are not republished.

## Existing source identities

| Source | C | P | Default R | Locale/localization | Selected scores |
|---|---|---|---|---|---|
| pba23_2018_zh_cn@1.0.1 | 1.0.1:1.0.0 | none-v1 | 1.1.0 | zh-CN / 1.0.0 | parental_burnout plus four existing facets |
| bpses5_zh_cn_research@1.0.0 | 1.0.0:1.0.0 | none-v1 | 1.1.0 | zh-CN / 1.0.0 | total |

These are the existing `sourceParts()` defaults, including the nonnull parameter part. Both definitions have `referencePolicy.type=none`; this means no norm distribution or thresholds, not absence of a parameter identity or literature. Existing compiler/import freezing is retained. No new hash or qualification mechanism is introduced. Existing report-variants retain historical R1.0.0 alongside current R1.1.0. Chinese forms retain their working-translation status and are not relabeled validated Chinese editions. Neither instrument specifies a fixed recall window.

PBA C hash: `0c62c74a47a7a64d75f4b6a008753365a4fe39dfdaf507d947edc9dcce72d8d6`; R: `bba1dd1c5203aafda052adc04ca4fbbb65c81311a95cbb9894c9521ee4fcde08`.
BPSES C: `7b3bf47cb1e9d46f39233041456c64558df239dd14765a73bcb248cbf1fe8ca7`; R: `b8a3136062773a9aca219c1591db794922c29871875c4defb6ed5b34cf9ee38e`.
Existing nonnull P hash, both: `635725d40ea9016d340f4b9d4b9640a656079abfa676eef2d328f598bce72379`.

## Declaration and interpretation

Required context: the adult subject's age in years (`subject_age_years`, the existing shared population contract), parent/carer confirmation, and at least one child living with parent. The old draft-only age field was aligned with this existing contract; no new eligibility gate was introduced. The adult is the subject. Child age is not an accepted substitute. Under 18, false required context, or unknown applicability yields existing UNAVAILABLE behavior. No new Form engine or initiation mode is added.

Existing condition rules still compare raw SUM scores directly; schema3 additionally freezes the two direct `RANGE_POSITION` coordinates. The design's `b=PBA/138` and `e=(BPSES-5)/20` are equivalent to PBA <=34.5/>=103.5 and BPSES <=10/>=20. Four rules supply experimental support themes: preserve support, redistribute/recover, practical help plus one small practice, or confidence-building practice. Middle values remain continuous. These are project-authored theoretical tails, not original cutoffs, percentiles, clinical diagnoses, LPA classes, parenting skill assessments, or predictions about children.

PBA total is 0–138; facets are exhaustion 0–54, contrast 0–36, fed-up 0–30, distancing 0–18. Facets are already included in the total and are not weighted again. BPSES is 5–25 without three invented subscales. No cross-instrument total, MSPSS or APQ is added. Optional unscored support-choice questions are deferred to keep this core at 28 items.

Missing, invalid and not-applicable evidence retain existing distinct states and suppress joint rules. `interpretable_only` also excludes limited-quality sources. Scores are not imputed or prorated. A valid independent result remains computed when its counterpart is unusable; actual access still follows frozen disclosure policy.

## Schema3 numbers and panels

`rules.derivations` declares `burden_position=(PBA-0)/(138-0)` and `efficacy_position=(BPSES-5)/(25-5)`, both DIRECT. `rules.theme` links these axes to only `pa1`–`pa4`. Middle values retain the continuous positions and BOUNDARY state; the existing `middle_continuous` text remains available without becoming a forced fifth type.

Eight ordered Chinese-labelled rows retain the two original sums, two positions and four PBA facets. Four explicit blocks contain independent results, experimental support theme, PBA detail, and methods/limits. Each row retains its source range, original sum unit and item count where relevant. These are declarations for the shared renderer; no UI or scoring engine is copied into this PR. `narrativeContent=BUNDLE_OWNED_SELF` identifies only the project's original narrative, without changing either leaf's label or educational-content capability.

## Precise remaining report-reader gap

Schema3's core projector can show owned SELF narrative with existing numeric/individual-interpretation capabilities while `scoreDerivedLabels=false` remains unchanged. This resolves the old V1 model limitation at the shared-projector level. The package is still not an integrated participant feature.

PBA's real R1.1.0 contract is `respondent=ADULT_SELF, audience=parent`; BPSES's is `ADULT_SELF, student`. At C candidate `45449e9aa8b1d583868247cfd06b81f81ce7d5c7`, `bundle-product/analysis.ts` permits a schema3 adult-self audience remap only for teacher-source reports. PBA therefore loses `individualInterpretations` at the participant read, and the combined theme is WITHHELD. A bounded test using this package, the real source definitions/policies and the actual saved-reader function reproduced PBA=111/BPSES=21 numeric rows plus WITHHELD theme, while retaining the BPSES independent summary. Database reads and admission runtime loading were synthetic persistence doubles, not a real installation or user journey.

Separately, code inspection of `bundle-product/survey-source.ts` shows reportAudience accepts only `student/researcher` and nulls the real PBA parent audience. Survey's existing policy intersection then withholds that source. This Survey case has not been claimed as a completed end-to-end run. Shared owners need to resolve the adult SELF parent-audience mapping explicitly; this content PR does not change source audience identities, role authority, leaf policies or shared code.

## Bounded evidence and integration handoff

Earlier V1 checks and their original local harness failures remain historical evidence, not schema3 qualification. They are not repeated as a full source/scoring suite. The new isolated combination overlays A `d5f10b96710bda704ce722ef4860adcf1c1aab0d`, B `ae20aab4c5cdb347f714e60bfce6740ebbf086b7` and C `45449e9aa8b1d583868247cfd06b81f81ce7d5c7`; it is used only for local validation and is not pushed with this content branch.

The selected package's new expected-derived fields and references pass the existing onboarding CLI. Six local tests cover coordinates/theme, Chinese rows/panels, missing/invalid/inapplicable/limited inputs, numeric/quality permission intersections, the actual saved-reader parent-audience limitation, and the existing required subject-age context. No leaf scorer/golden suite, full platform suite, browser journey, DB installation, publication or production operation was run. Evidence identifies the exact shared commits and package hash.

The shared generated index addition from the earlier draft is removed from this PR. The integration owner must run the existing generator on the combined tree after shared core integration; no parallel shared-index rewrite is committed here.

Candidate scope is this package's JSON, its response-only smoke fixture, and passive engineering evidence. It remains eligible for content-light when the shared parser/runtime dependency is present. Main does not yet parse schema3, so this dependency update is pushed with `[skip ci]`; no manual workflow is dispatched and no current-main success is claimed. Prior CI run 41281071115 passed only historical head 59674da3d774beea297d09588347ab960b68892a. The PR stays Draft pending core integration and actual report-exit closure. This adds no review qualification, hash mechanism or deployment gate.
