# Cognitive Reference Eligibility Audit v1（COG-P4 §4.1）

- 日期：2026-09-09
- 基线：COG-P3 PR #67 合并后的 `main @ 2ed9e4e`
- 分支：`feat/cognitive-pilot-reference-v1`
- 性质：**reference eligibility source audit**。本文只记录当前注册表真值和未来 pipeline 的候选边界，不创建 reference row，不改变任何 publication、scorer、report 或数据库行为。
- 配套文档：`cognitive-literature-reference-candidates-v1.md`（COG-P4 §4.2）

## 1. Scope

本轮回答一个问题：当前 Cognitive Library 的哪些 metric **有资格进入未来 Reference pipeline 的候选集合**。这里的“有资格”只表示代码已经将该 metric 标记为 `referenceEligible=true`；它不表示已经存在文献数值、已经通过人口/协议匹配，也不表示结果可以展示常模位置。

本轮明确不做：

- 不创建 `AssessmentReferenceSet` / `AssessmentReferenceEntry`，当前新增 reference rows = **0**。
- 不把现有文献锚定或模拟数据改为 ACTIVE；当前 ACTIVE cognitive reference = **0**。
- 不实现 4.3 Reference Applicability runtime、4.4 Frozen Reference Binding、4.5–4.8 audience projection/regression。
- 不修改 Student/Parent、Teacher 或 Admin report，不修改 FINAL runtime、scorer、Bundle、COS 或数据库 schema。
- 不创建 `CognitiveNormEngine`、第二套 Reference Registry、连续年龄插值或自动 norm fitting。
- 不做 touch/desktop correction、device penalty/bonus 或 device-specific norm switching。

### 1.1 本次审计快照

| 轴 | 当前事实 | 本文含义 |
|---|---|---|
| Product publication | 28 个 exact identities：9 `PUBLISHED`、19 `DRAFT`、0 `RETIRED` | 工程可发布状态，不是科研成熟度 |
| Scientific status | 24 个真实 task identity 全部 `PILOT`；`fake` 为 `FRAMEWORK` | exact identity scoped；当前 `RESEARCH_GRADE_IDENTITIES` 为空 |
| Reference applicability | 所有 v2 `TaskDefinition.references` 均为空 | 没有任何 metric 已绑定 reference version/kind/context |
| Eligibility | 由 v2 metric definition 暴露 `referenceEligible` | 只做候选资格筛选，不等同 reference 可用 |
| Evidence Mapping | 版本 `1.0.0`，只提供 domain/facet/role 语义映射 | 只做构念链接，不授予 eligibility 或 reference applicability |

### 1.2 三条状态轴不得合并

一个合法的未来组合可以是：

```text
PUBLISHED + PILOT + literature_beta
```

其中：

- `PUBLISHED` = 任务定义层面允许产品发布；
- `PILOT` = 当前 exact task identity 的科研成熟度仍是试行；
- `literature_beta` = 某个经过协议/人群审查的试行参考层，仍不是正式常模。

本轮没有把任何 task 或 metric 推进到第三轴的 `literature_beta` 实现状态。

## 2. Authoritative truth

### 2.1 单一 eligibility 真值

未来 consumer 应从 exact v2 definition 读取：

```text
TaskDefinition.metrics[metricKey].referenceEligible
```

当前读取链路是：

```text
cognitive.registry exact identity
  → v2/registry.ts
  → TaskDefinition.metrics[metricKey]
  → referenceEligible
```

`v2/registry.ts` 当前 adapter 的实现 lineage 是：metric 的 legacy role 为 `primary`，或 legacy `reportDefinition.primaryMetrics` 包含该 key，则派生为 `true`。这只是现有 adapter 的实现事实；本文件中的表格不是第二份可供 runtime 读取的 eligibility table。若未来 adapter 或 metric definition 改变，应重新运行 registry audit，而不是手工同步本文。

`deriveCognitiveScoringContract` 已按上述 v2 field 派生 `referenceEligibleMetricKeys`，源码不维护手写 eligibility 列表。本轮不改变这条边界。

### 2.2 其他字段的职责

- `role`：`primary`、`secondary`、`quality`、`research_only`，描述 metric 在计分/质量/研究层的角色。
- `visibility`：`headline`、`user`、`detail`、`research_only`、`hidden`，描述 v2 report projection 的可见层级。
- `report.headlineMetrics/userMetrics/detailMetrics`：当前报告使用，不代表 reference applicability。
- `TaskDefinition.references`：未来具体 reference applicability 的声明位置；当前所有 identity 都是 `[]`。
- Evidence Mapping v1.0.0：`domain/facet/role` 的构念映射，不能替代 `referenceEligible`，也不能自动生成 `ReferenceApplicability`。

### 2.3 现有 Reference Core 的约束

未来正式定义必须复用 shared `AssessmentReferenceSetDefinition` / `AssessmentReferenceEntry`：

- `ReferenceKind`：`normative_distribution`、`criterion_threshold`、`descriptive_sample`；
- `ReferenceEvidenceLevel`：`literature_beta`、`local_pilot`、`local_norm`、`validated_norm`（以及未请求状态 `none`）；
- `ReferenceProvenance`：`literature_reported`、`literature_derived_estimate`、`local_observed`。

`normative_distribution` 至少要有可核验的 mean+SD 或 percentile table；`criterion_threshold` 必须有 thresholds；每条 entry 还要有 exact instrument/scoring identity、population、source 和 limitations。本轮没有满足这些条件到足以落 row 的 source，因此只交付审计文档。

## 3. 28 exact identity audit

身份键始终是：

```text
testType / engineVersion / scoringVersion
```

下表由 2026-09-09 运行 `cognitive:audit` 的当前 source registry 和 v2 adapter 生成。`eligible` 是当前 `referenceEligible=true` 的 metric keys；`mapping` 是 Evidence Mapping 的 domain/facet 摘要；`ref=0` 表示当前 `TaskDefinition.references.length`。

| # | exact identity | Product | Scientific | report headline | eligible | mapping | ref |
|---:|---|---|---|---|---|---|---:|
| 1 | `fake/1.0.0/1.0.0` | DRAFT | FRAMEWORK | `accuracy` | `accuracy` | — | 0 |
| 2 | `reaction/1.0.0/1.0.0` | DRAFT | PILOT | `medianRtMs` | `medianRtMs`, `rtICV`, `missRate` | — | 0 |
| 3 | `memory/1.0.0/1.0.0` | DRAFT | PILOT | `maxSpan` | `maxSpan`, `levelsPassed` | — | 0 |
| 4 | `stroop/1.0.0/1.0.0` | DRAFT | PILOT | `stroopEffectMs` | `stroopEffectMs`, `errorCost`, `incongruentAccuracy` | — | 0 |
| 5 | `reaction/1.0.0/1.1.0` | PUBLISHED | PILOT | `medianRtMs` | `medianRtMs`, `rtICV`, `missRate` | `processing_speed/simple_response`; `sustained_attention/response_stability, omission_control` | 0 |
| 6 | `memory/1.0.0/1.1.0` | PUBLISHED | PILOT | `maxSpan` | `maxSpan`, `totalCorrectTrials` | `working_memory/verbal_storage` | 0 |
| 7 | `stroop/1.0.0/1.1.0` | PUBLISHED | PILOT | `stroopEffectMs` | `stroopEffectMs`, `errorCost`, `incongruentAccuracy` | `interference_control/semantic_interference` | 0 |
| 8 | `gonogo/1.0.0/1.0.0` | PUBLISHED | PILOT | `commissionRate` | `commissionRate`, `dPrime` | `response_inhibition/action_withholding` | 0 |
| 9 | `cpt/1.0.0/1.0.0` | PUBLISHED | PILOT | `dPrime` | `dPrime`, `omissionRate`, `commissionRate`, `rtICV` | `sustained_attention/target_discrimination, omission_control, response_stability`; `response_inhibition/action_withholding`; `processing_speed/simple_response` | 0 |
| 10 | `nback/1.0.0/1.0.0` | PUBLISHED | PILOT | `maxReliableN` | `dPrimeByN`, `maxReliableN` | `working_memory/updating` | 0 |
| 11 | `corsi/1.0.0/1.0.0` | PUBLISHED | PILOT | `maxSpan` | `maxSpan`, `totalCorrectTrials` | `working_memory/visuospatial_storage` | 0 |
| 12 | `sst/1.0.0/1.0.0` | PUBLISHED | PILOT | `ssrtMs` | `ssrtMs`, `pRespondStop` | `response_inhibition/action_cancellation` | 0 |
| 13 | `taskswitch/1.0.0/1.0.0` | PUBLISHED | PILOT | `switchCostRtMs` | `switchCostRtMs`, `switchCostAccuracy` | `cognitive_flexibility/trial_switching` | 0 |
| 14 | `patterncompare/1.0.0/1.0.0` | DRAFT | PILOT | `correctPerMinute` | `correctPerMinute`, `accuracy`, `medianCorrectRtMs` | `processing_speed/visual_comparison` | 0 |
| 15 | `flanker/1.0.0/1.0.0` | DRAFT | PILOT | `flankerEffectMs` | `flankerEffectMs`, `incongruentAccuracy`, `congruentAccuracy`, `errorCost` | `interference_control/perceptual_interference` | 0 |
| 16 | `cardsort/1.0.0/1.0.0` | DRAFT | PILOT | `switchCostRtMs` | `switchCostRtMs`, `switchCostAccuracy`, `perseverativeErrorRate`, `postSwitchRecovery` | `cognitive_flexibility/rule_shifting` | 0 |
| 17 | `digitbackward/1.0.0/1.0.0` | DRAFT | PILOT | `maxSpan` | `maxSpan`, `totalCorrectTrials` | `working_memory/verbal_manipulation` | 0 |
| 18 | `picturesequence/1.0.0/1.0.0` | DRAFT | PILOT | `adjacentPairScore` | `adjacentPairScore`, `positionScore`, `learningGain`, `delayedRetention` | `episodic_learning_memory/sequence_learning` | 0 |
| 19 | `pairedassociate/1.0.0/1.0.0` | DRAFT | PILOT | `immediateAccuracy` | `correctByTrial`, `learningSlope`, `trialsToCriterion`, `immediateAccuracy`, `delayedAccuracy` | `episodic_learning_memory/paired_learning` | 0 |
| 20 | `matrix/1.0.0/1.0.0` | DRAFT | PILOT | `accuracy` | `accuracy`, `accuracyByRuleFamily` | `fluid_reasoning/rule_induction` | 0 |
| 21 | `mentalrotation/1.0.0/1.0.0` | DRAFT | PILOT | `accuracy` | `accuracy`, `angleCost`, `medianCorrectRtMs` | `visuospatial_reasoning/mental_rotation` | 0 |
| 22 | `tower/1.0.0/1.0.0` | DRAFT | PILOT | `minimumMoveSolveRate` | `minimumMoveSolveRate`, `excessMoves`, `ruleViolations` | `planning/look_ahead` | 0 |
| 23 | `trailmaking/1.0.0/1.0.0` | DRAFT | PILOT | `completionTimeMs` | `completionTimeMs`, `errorCount`, `setShiftCostMs` | standalone（无 mapping） | 0 |
| 24 | `reversallearning/1.0.0/1.0.0` | DRAFT | PILOT | `reversalAccuracy` | `acquisitionAccuracy`, `reversalAccuracy`, `reversalCost`, `perseverativeErrorCount` | standalone（无 mapping） | 0 |
| 25 | `bart/1.0.0/1.0.0` | DRAFT | PILOT | `adjustedPumps` | `adjustedPumps`, `explosionCount`, `cashoutCount` | standalone（无 mapping） | 0 |
| 26 | `wordlist/1.0.0/1.0.0` | DRAFT | PILOT | `immediateAccuracy` | `immediateAccuracy`, `learningGain`, `delayedRecallAccuracy` | standalone（无 mapping） | 0 |
| 27 | `lexicaldecision/1.0.0/1.0.0` | DRAFT | PILOT | `dPrime` | `dPrime`, `lexicalityEffectMs`, `accuracyReal`, `accuracyPseudo` | standalone（无 mapping） | 0 |
| 28 | `emotionrecognition/1.0.0/1.0.0` | DRAFT | PILOT | `balancedAccuracy` | `accuracy`, `balancedAccuracy` | standalone（无 mapping） | 0 |

结论：审计通过 `28/28`，`cognitive:audit` 为 `PASS`，registry count = 28，published count = 9，draft count = 19，retired count = 0。这里的 `PUBLISHED` 9 与 `PILOT` 24 并不矛盾。

## 4. PUBLISHED task × metric matrix

以下是当前 9 个 PUBLISHED exact identities 的逐 metric 矩阵。`report use` 只表示当前 v2 report 层级；`mapping` 为空表示该 exact identity 当前没有 Evidence Mapping 行。所有行的 `reference applicability` 均为 `none`，因为 `TaskDefinition.references=[]`，不是因为本文决定拒绝该指标。

| Task / identity | metricKey | role | visibility | refEligible | construct · unit · direction | report use | Evidence Mapping | reference applicability |
|---|---|---|---|---|---|---|---|---|
| reaction / `1.0.0/1.1.0` | `medianRtMs` | primary | headline | ✅ | processing_speed · ms · lower | headline | processing_speed / simple_response / primary | none |
| reaction / `1.0.0/1.1.0` | `rtICV` | primary | user | ✅ | processing_speed · ratio · lower | user | sustained_attention / response_stability / supporting | none |
| reaction / `1.0.0/1.1.0` | `missRate` | primary | user | ✅ | processing_speed · ratio · lower | user | sustained_attention / omission_control / supporting | none |
| memory / `1.0.0/1.1.0` | `maxSpan` | primary | headline | ✅ | working_memory · count · higher | headline | working_memory / verbal_storage / primary | none |
| memory / `1.0.0/1.1.0` | `totalCorrectTrials` | primary | user | ✅ | working_memory · count · higher | user | working_memory / verbal_storage / primary | none |
| stroop / `1.0.0/1.1.0` | `stroopEffectMs` | primary | headline | ✅ | inhibitory_control · ms · lower | headline | interference_control / semantic_interference / primary | none |
| stroop / `1.0.0/1.1.0` | `errorCost` | primary | user | ✅ | inhibitory_control · ratio · lower | user | interference_control / semantic_interference / supporting | none |
| stroop / `1.0.0/1.1.0` | `incongruentAccuracy` | primary | user | ✅ | inhibitory_control · ratio · higher | user | interference_control / semantic_interference / primary | none |
| gonogo / `1.0.0/1.0.0` | `commissionRate` | primary | headline | ✅ | response_inhibition · ratio · lower | headline | response_inhibition / action_withholding / primary | none |
| gonogo / `1.0.0/1.0.0` | `dPrime` | primary | user | ✅ | response_inhibition · d-prime · higher | user | response_inhibition / action_withholding / primary | none |
| cpt / `1.0.0/1.0.0` | `dPrime` | primary | headline | ✅ | sustained_attention · d-prime · higher | headline | sustained_attention / target_discrimination / primary | none |
| cpt / `1.0.0/1.0.0` | `omissionRate` | primary | user | ✅ | sustained_attention · ratio · lower | user | sustained_attention / omission_control / primary | none |
| cpt / `1.0.0/1.0.0` | `commissionRate` | primary | user | ✅ | sustained_attention · ratio · lower | user | response_inhibition / action_withholding / supporting | none |
| cpt / `1.0.0/1.0.0` | `rtICV` | primary | user | ✅ | sustained_attention · ratio · lower | user | sustained_attention / response_stability / primary | none |
| nback / `1.0.0/1.0.0` | `dPrimeByN` | primary | user | ✅ | working_memory_updating · map · higher | user | working_memory / updating / primary | none |
| nback / `1.0.0/1.0.0` | `maxReliableN` | primary | headline | ✅ | working_memory_updating · level · higher | headline | working_memory / updating / primary | none |
| corsi / `1.0.0/1.0.0` | `maxSpan` | primary | headline | ✅ | visuospatial_memory · count · higher | headline | working_memory / visuospatial_storage / primary | none |
| corsi / `1.0.0/1.0.0` | `totalCorrectTrials` | primary | user | ✅ | visuospatial_memory · count · higher | user | working_memory / visuospatial_storage / primary | none |
| sst / `1.0.0/1.0.0` | `ssrtMs` | primary | headline | ✅ | response_inhibition · ms · lower | headline | response_inhibition / action_cancellation / primary | none |
| sst / `1.0.0/1.0.0` | `pRespondStop` | primary | user | ✅ | response_inhibition · ratio · target_range | user | response_inhibition / action_cancellation / primary | none |
| taskswitch / `1.0.0/1.0.0` | `switchCostRtMs` | primary | headline | ✅ | cognitive_flexibility · ms · lower | headline | cognitive_flexibility / trial_switching / primary | none |
| taskswitch / `1.0.0/1.0.0` | `switchCostAccuracy` | primary | user | ✅ | cognitive_flexibility · ratio · lower | user | cognitive_flexibility / trial_switching / primary | none |

### 4.1 当前 PUBLISHED metric 的解释边界

- `headline` 不是“唯一可做 reference 的指标”；例如 Reaction 的 `rtICV`、CPT 的 `omissionRate` 也被标记为 eligible。
- `primary` 不是“已经有常模”；它只是当前 eligibility adapter 的主要来源之一。
- `quality`、`research_only`、detail-only metric 即使有科学意义，也不能因为名字相近而越过当前 `false`。
- `map`、`level`、difference、模型估计和跨条件派生量需要额外的可复现 scoring/protocol 证据，不能自动按单一连续分布处理。

## 5. DRAFT candidate matrix

DRAFT 不因本审计而 publish。下表只盘点未来候选，标记格式为 `metricKey（role / visibility）`。这些 keys 仍然必须经过 §4.2 的来源、协议、计分和人群审查；它们不是当前 reference applicability。

| exact identity | report headline / user / detail | referenceEligible candidate metrics | Evidence Mapping | current ref |
|---|---|---|---|---:|
| `fake/1.0.0/1.0.0` | `accuracy` / — / `meanRtMs, correctCount, trialCount` | `accuracy`（primary / headline） | — | 0 |
| `reaction/1.0.0/1.0.0` | `medianRtMs` / `rtICV, missRate` / detail RT metrics | `medianRtMs`（primary / headline）；`rtICV, missRate`（primary / user） | — | 0 |
| `memory/1.0.0/1.0.0` | `maxSpan` / `levelsPassed` / detail metrics | `maxSpan`（primary / headline）；`levelsPassed`（secondary / user） | — | 0 |
| `stroop/1.0.0/1.0.0` | `stroopEffectMs` / `incongruentAccuracy, errorCost` / detail metrics | `stroopEffectMs`（primary / headline）；`incongruentAccuracy, errorCost`（primary / user） | — | 0 |
| `patterncompare/1.0.0/1.0.0` | `correctPerMinute` / `accuracy, medianCorrectRtMs` / detail metrics | `correctPerMinute`（primary / headline）；`accuracy, medianCorrectRtMs`（primary / user） | processing_speed / visual_comparison | 0 |
| `flanker/1.0.0/1.0.0` | `flankerEffectMs` / `incongruentAccuracy, congruentAccuracy, errorCost` / detail metrics | `flankerEffectMs`（primary / headline）；`incongruentAccuracy, congruentAccuracy, errorCost`（primary / user） | interference_control / perceptual_interference | 0 |
| `cardsort/1.0.0/1.0.0` | `switchCostRtMs` / `switchCostAccuracy, perseverativeErrorRate, postSwitchRecovery` / detail metrics | all four listed metrics（primary / headline or user） | cognitive_flexibility / rule_shifting | 0 |
| `digitbackward/1.0.0/1.0.0` | `maxSpan` / `totalCorrectTrials` / detail metrics | `maxSpan, totalCorrectTrials`（primary / headline or user） | working_memory / verbal_manipulation | 0 |
| `picturesequence/1.0.0/1.0.0` | `adjacentPairScore` / `positionScore, learningGain, delayedRetention` / detail metrics | all four listed metrics（primary / headline or user） | episodic_learning_memory / sequence_learning | 0 |
| `pairedassociate/1.0.0/1.0.0` | `immediateAccuracy` / `correctByTrial, learningSlope, trialsToCriterion, delayedAccuracy` / — | all five listed metrics（primary / headline or user） | episodic_learning_memory / paired_learning | 0 |
| `matrix/1.0.0/1.0.0` | `accuracy` / `accuracyByRuleFamily` / detail metrics | `accuracy`（primary / headline）；`accuracyByRuleFamily`（primary / user） | fluid_reasoning / rule_induction | 0 |
| `mentalrotation/1.0.0/1.0.0` | `accuracy` / `angleCost, medianCorrectRtMs` / detail metrics | all three listed metrics（primary / headline or user） | visuospatial_reasoning / mental_rotation | 0 |
| `tower/1.0.0/1.0.0` | `minimumMoveSolveRate` / `excessMoves, ruleViolations` / detail metrics | all three listed metrics（primary / headline or user） | planning / look_ahead | 0 |
| `trailmaking/1.0.0/1.0.0` | `completionTimeMs` / `errorCount, setShiftCostMs` / detail metrics | all three listed metrics（primary / headline or user） | standalone | 0 |
| `reversallearning/1.0.0/1.0.0` | `reversalAccuracy` / `acquisitionAccuracy, reversalCost, perseverativeErrorCount` / detail metrics | all four listed metrics（primary / headline or user） | standalone | 0 |
| `bart/1.0.0/1.0.0` | `adjustedPumps` / `explosionCount, cashoutCount` / detail metrics | all three listed metrics（primary / headline or user） | standalone | 0 |
| `wordlist/1.0.0/1.0.0` | `immediateAccuracy` / `learningGain, delayedRecallAccuracy` / detail metrics | all three listed metrics（primary / headline or user） | standalone | 0 |
| `lexicaldecision/1.0.0/1.0.0` | `dPrime` / `lexicalityEffectMs, accuracyReal, accuracyPseudo` / detail metrics | all four listed metrics（primary / headline or user） | standalone | 0 |
| `emotionrecognition/1.0.0/1.0.0` | `balancedAccuracy` / `accuracy` / detail metrics | `balancedAccuracy`（primary / headline）；`accuracy`（primary / user） | standalone | 0 |

## 6. Evidence Mapping linkage

Evidence Mapping v1.0.0 当前覆盖 18/24 个真实 task type；6 个 standalone task type 没有 mapping：

```text
trailmaking, reversallearning, bart, wordlist, lexicaldecision, emotionrecognition
```

它的职责是把已存在的 metric 链接到 `domain/facet`，并区分 mapping role `primary/supporting`。它不做以下事情：

1. 不把 `referenceEligible=false` 改成 `true`；
2. 不把同构名称（例如 `accuracy`、`dPrime`、`maxSpan`）跨 task/version 视为同一个分布；
3. 不填 `referenceVersion`、`referenceKind` 或 `requiredContext`；
4. 不把无 mapping 的 standalone task 自动降级为不可审计，也不为了“有 mapping”修改 taxonomy。

当前映射只存在于对应 exact scoring version。例如 Reaction、Memory、Stroop 的 v1.1.0 有 mapping，v1.0.0 sibling identity 没有；这正是 identity scope 需要保留的原因。

## 7. Metrics intentionally NOT reference eligible

以下清单是当前 v2 field 的完整 `referenceEligible=false` 快照。它是**代码事实**，不是本轮新增的 scientific rejection，也不是未来永远禁止 reference。若要改变其中任一项，需要单独的 metric-definition/review 变更，不得在 4.2 文档中旁路修改。

| exact identity | 当前 false metrics |
|---|---|
| `fake/1.0.0/1.0.0` | `trialCount`, `correctCount`, `meanRtMs` |
| `reaction/1.0.0/1.0.0` | `meanRtMs`, `sdRtMs`, `fastestRtMs`, `prematureCount`, `validTrialCount`, `missCount`, `totalTrials` |
| `memory/1.0.0/1.0.0` | `firstTryPassCount`, `medianResponseDurationMs`, `trialCount`, `interruptedCount` |
| `stroop/1.0.0/1.0.0` | `accuracy`, `congruentAccuracy`, `medianRtCongruent`, `medianRtIncongruent`, `timeoutCount`, `validCongruentRtCount`, `validIncongruentRtCount` |
| `reaction/1.0.0/1.1.0` | `meanRtMs`, `sdRtMs`, `fastestRtMs`, `prematureCount`, `validTrialCount`, `missCount`, `totalTrials` |
| `memory/1.0.0/1.1.0` | `levelsPassed`, `firstTryPassCount`, `medianResponseDurationMs`, `trialCount`, `interruptedCount`, `perseverativeTrialCount` |
| `stroop/1.0.0/1.1.0` | `accuracy`, `congruentAccuracy`, `medianRtCongruent`, `medianRtIncongruent`, `timeoutCount`, `validCongruentRtCount`, `validIncongruentRtCount` |
| `gonogo/1.0.0/1.0.0` | `goMedianRtMs`, `hitRate`, `omissionRate`, `commissionErrors`, `goTrialCount`, `nogoTrialCount` |
| `cpt/1.0.0/1.0.0` | `hitMedianRtMs`, `hitRtSdMs`, `blockSlopeRt`, `blockSlopeOmission`, `perseverationRate`, `targetCount`, `hitCount` |
| `nback/1.0.0/1.0.0` | `hitRateByN`, `falseAlarmRateByN`, `medianRtByN`, `loadCostDPrime` |
| `corsi/1.0.0/1.0.0` | `firstTryPassCount`, `medianResponseDurationMs`, `sequenceErrorDistance`, `trialCount` |
| `sst/1.0.0/1.0.0` | `goMedianRtMs`, `goOmissionRate`, `goChoiceErrorRate`, `meanSsdMs`, `unsuccessfulStopRtMs` |
| `taskswitch/1.0.0/1.0.0` | `medianRtSwitch`, `medianRtRepeat`, `accuracySwitch`, `accuracyRepeat`, `mixingCost` |
| `patterncompare/1.0.0/1.0.0` | `lapseRate`, `correctCount`, `completedTrialCount` |
| `flanker/1.0.0/1.0.0` | `accuracy`, `medianRtCongruent`, `medianRtIncongruent`, `omissionRate` |
| `cardsort/1.0.0/1.0.0` | `accuracySwitch`, `accuracyRepeat`, `medianRtSwitch`, `medianRtRepeat`, `overallAccuracy`, `omissionRate`, `perseverativeErrorCount` |
| `digitbackward/1.0.0/1.0.0` | `sequenceDistance`, `medianResponseDurationMs`, `completedLevelCount` |
| `picturesequence/1.0.0/1.0.0` | `adjacentPairScoreByRound`, `positionScoreByRound` |
| `pairedassociate/1.0.0/1.0.0` | （无 false metric；当前所有定义字段均为 eligible，但仍未绑定 reference） |
| `matrix/1.0.0/1.0.0` | `reachedDifficulty`, `medianRtMs`, `omissionRate` |
| `mentalrotation/1.0.0/1.0.0` | `mirrorErrorRate`, `omissionRate` |
| `tower/1.0.0/1.0.0` | `solveRate`, `firstMoveLatencyMs`, `noAttemptRate` |
| `trailmaking/1.0.0/1.0.0` | `partACompletionTimeMs`, `partBCompletionTimeMs`, `meanCorrectStepTimeMs`, `completedStepCount`, `errorRate`, `omissionRate` |
| `reversallearning/1.0.0/1.0.0` | `trialsToAcquisitionCriterion`, `trialsToReversalCriterion`, `feedbackWinRate`, `omissionRate`, `medianRtMs`, `validResponseCount` |
| `bart/1.0.0/1.0.0` | `meanPumpsAllCompleted`, `cashoutRate`, `completedBalloonCount`, `omissionRate` |
| `wordlist/1.0.0/1.0.0` | `totalImmediateCorrect`, `recallByRound`, `intrusionCount`, `duplicateResponseCount`, `omissionRate`, `medianResponseDurationMs` |
| `lexicaldecision/1.0.0/1.0.0` | `medianRtReal`, `medianRtPseudo`, `accuracyByFrequencyBand`, `omissionRate`, `validResponseCount` |
| `emotionrecognition/1.0.0/1.0.0` | `accuracyByEmotion`, `confusionMatrix`, `medianRtMs`, `omissionRate`, `validResponseCount` |

特别注意：`research_only` 与质量/计数指标当前大多在此列，例如 CPT 的 `blockSlopeRt/blockSlopeOmission`、Corsi 的 `sequenceErrorDistance`、Task Switching 的 `mixingCost`、Wordlist 的 `recallByRound`、Lexical Decision 的 `accuracyByFrequencyBand`、Emotion Recognition 的 confusion matrix。它们应继续作为研究/质量事实保留，不因“有数据”自动进入 reference。

## 8. Risks / ambiguities

1. **Adapter lineage risk**：eligibility 的单一 consumer 真值在 v2 definition；如果 legacy role/report 变化，adapter 派生结果可能变化。审计脚本应作为变更门禁，而不是复制一份静态表。
2. **Role ≠ comparability**：primary metric 可能是 difference、map、level 或模型估计；`referenceEligible=true` 只允许进入候选审查。
3. **Headline ≠ reference binding**：headline 是产品报告层级，Reference Core 需要另一个 exact `ReferenceApplicability` 声明。
4. **Version sibling risk**：同一 task family 的 scoring 1.0.0 和 1.1.0 不能共用 reference；必须匹配 `testType/engineVersion/scoringVersion`，以及实际 profile/config。
5. **Profile/trial risk**：experience、standard、research 的试次数、block 数、adaptive stop 或纯 block 结构不同，不能把一个 profile 的数据扩大到全部 profile。
6. **Population risk**：K12 年龄、grade、语言、地区、sex/context 需要明确；不存在“最近年龄带自动 fallback”。本文不设计连续年龄插值、nearest-band fallback 或跨文化替代。
7. **Device/input risk**：COG-P2 的 coarse `deviceClass` / `administrationMode` 只能 RECORD；设备不同的文献只能作为 limitation，不能做 touch penalty、desktop bonus、自动 device norm switch 或 correction。
8. **Language/stimulus risk**：中文词表、中文词汇判断、情绪面孔、内部生成图形/矩阵等 task 的刺激与文化/语言属性不能由西文或其他范式论文直接替代。
9. **Reference source risk**：现有 three literature anchors（reaction/memory/stroop）是 disabled provenance-only data；它们的 `bands` 为空或 `transformation=not_approved`，不能被解读为当前可用比较参数。内部 synthetic `lit-sim-k12-v0.2` 同样是开发验证数据，不代表真实文献或中国学生常模。

## 9. Candidate priorities for `literature_beta`

优先级只是未来审查顺序，不是批准名单：

### Priority 1：当前 PUBLISHED 的 headline metrics

```text
reaction/1.0.0/1.1.0      medianRtMs
memory/1.0.0/1.1.0        maxSpan
stroop/1.0.0/1.1.0       stroopEffectMs
gonogo/1.0.0/1.0.0        commissionRate
cpt/1.0.0/1.0.0           dPrime
nback/1.0.0/1.0.0         maxReliableN
corsi/1.0.0/1.0.0         maxSpan
sst/1.0.0/1.0.0           ssrtMs
taskswitch/1.0.0/1.0.0    switchCostRtMs
```

### Priority 2：同一 PUBLISHED identity 的 supporting eligible metrics

```text
reaction: rtICV, missRate
memory: totalCorrectTrials
stroop: errorCost, incongruentAccuracy
gonogo: dPrime
cpt: omissionRate, commissionRate, rtICV
nback: dPrimeByN
corsi: totalCorrectTrials
sst: pRespondStop
taskswitch: switchCostAccuracy
```

Priority 2 只有在 Priority 1 的 exact protocol、人群和计分边界通过后才进入同一 reference design；不能因为它们同时是 `primary` 就自动创建多条 percentile reference。

### Admission gate

单个 metric 进入未来 `literature_beta` 的最低条件：

1. exact instrument/engine/scoring/profile/config 可定位；
2. source 可追溯到原文表格/行或明确的统计输出；
3. stimulus、duration/ISI、trial/block 数、response modality、RT trimming、error handling、adaptive rule 和 scoring formula 足够匹配；
4. population 的年龄范围、语言、地区和其他 required context 明确；
5. source 明确支持所选 `ReferenceKind`；
6. mean/SD、percentile 或 thresholds 每个数字都可复核；
7. limitations/disclaimer 明确写出设备、短式、练习、天花板/地板和速度-准确权衡风险。

截至本轮，Priority 1/2 **没有任何 `READY_FOR_LITERATURE_BETA` metric**。具体 source-by-source 判断见配套 §4.2 文档。

## 10. Audit result

```text
registry audit: PASS
exact identities audited: 28/28
PUBLISHED: 9
DRAFT: 19
RETIRED: 0
current TaskDefinition.references rows: 0
new ACTIVE reference rows: 0
```

**4.1 ✅ complete. 4.2 is documented separately. 4.3 NOT STARTED.**

**STOPPED — waiting for review.**
