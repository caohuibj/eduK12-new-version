# B09 亲职负担、信心与支持

This DRAFT adds `parenting_burden_efficacy_zh_cn@0.1.0`: 28 existing items, adult parent/carer SELF. It does not install, publish, approve, merge, deploy, alter historical records, or modify either leaf instrument. Complete project design and shared Bundle specifications were read before implementation. Only project-authored declarations/report text and public bibliographic metadata are added; private source locations, file metadata, design documents and item text are not republished.

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

Required context: adult's age in years, parent/carer confirmation, and at least one child living with parent. The adult is the subject. Child age is not an accepted substitute. Under 18, false required context, or unknown applicability yields existing UNAVAILABLE behavior. No new Form engine or initiation mode is added.

V1 compares existing raw SUM scores directly. The design's `b=PBA/138` and `e=(BPSES-5)/20` are equivalent to PBA <=34.5/>=103.5 and BPSES <=10/>=20. Four rules supply experimental support themes: preserve support, redistribute/recover, practical help plus one small practice, or confidence-building practice. Middle values remain continuous. These are project-authored theoretical tails, not original cutoffs, percentiles, clinical diagnoses, LPA classes, parenting skill assessments, or predictions about children.

PBA total is 0–138; facets are exhaustion 0–54, contrast 0–36, fed-up 0–30, distancing 0–18. Facets are already included in the total and are not weighted again. BPSES is 5–25 without three invented subscales. No cross-instrument total, MSPSS or APQ is added. Optional unscored support-choice questions are deferred to keep this core at 28 items.

Missing, invalid and not-applicable evidence retain existing distinct states and suppress joint rules. `interpretable_only` also excludes limited-quality sources. Scores are not imputed or prorated. A valid independent result remains computed when its counterpart is unusable; actual access still follows frozen disclosure policy.

## Concrete shared runtime limitation

Both existing source disclosures have `individualInterpretations=true` but `scoreDerivedLabels=false`. `bundle-product/analysis.ts` sets `restrictSummary` if either capability is false; V1 then suppresses all rule narrative, including the support theme, while permitted numeric evidence may remain. This package does not change those leaf policies.

The current V2 Bundle-owned interpretation exception requires ADULT_TEACHER applicability and mean-score bindings. B09 is adult parent SELF with SUM sources. Relabeling parents as teachers or changing source aggregation would be incorrect. No runtime edit is included. The content is reviewable and rules compute, but participant theme display is **pending shared runtime support**. No end-to-end browser/report-display success is claimed. Existing V1 evidence blocks expose the same evidence collection, so a single evidence block avoids duplicating all six source scores. Desired specialized bars/collapsing facets were not implemented as new UI.

## Bounded evidence and CI handoff

Primary local checks: actual 28-answer scoring -> source projection -> V1 rules; adjacent raw boundaries; zero; missing/invalid/limited/range cases; adult applicability; source identity mismatch; existing report-policy restriction. Existing freeze builder/validator accepted this declaration. Only the affected package's schema, four fixtures and static dependencies were checked with the existing onboarding CLI. No DB, Prisma migration, source golden suite, app build, recovery, performance or platform journey ran. See sibling JSON for failures, corrections and final results.

The shared package index was produced by the existing `bundle-onboarding.ts generate`; it was not hand edited. Integration owner should regenerate it against the final combined tree rather than overwrite another group's generated changes.

Candidate scope is JSON Bundle package + one synthetic response-only smoke fixture + generated index + passive engineering evidence. Intended route is existing #494 `content-light`, domain `bundle`, with affected package validation and generated-index/history checks only; no runtime/CodeQL/app build expansion is justified. Parent dot received the exact candidate and the user subsequently authorized this Bundle's public Draft submission. Opening a PR triggers only the existing configured route; no manual workflow dispatch is requested. Local selected-package checks already passed before removal of private design file metadata from the citation. Scoring, applicability, selectors, rules, report and all fixtures are unchanged by that citation cleanup; passed score/boundary evidence is retained. No local result is represented as an official CI success.

Applicable historical checks: CI-006 source/admission identity: local synthetic and frozen declaration PASS; real admission NOTRUN. CI-007 generated registry: existing generator PASS. CI-008 report consumer coverage: narrative projection limitation BLOCKED as described; browser NOTRUN. CI-001 DB setup and CI-003 frontend closure N_A because neither database nor frontend is modified or executed. All other unrelated platform checks are outside this content scope. CI failure rounds: zero.
