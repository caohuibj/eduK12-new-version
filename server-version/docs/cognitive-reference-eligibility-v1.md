# Cognitive Reference Eligibility Audit v1（COG-P4 §4.1 / §4.1.1）

- 日期：2026-09-09
- 基线：COG-P3 PR #67 合并后的 `main @ 2ed9e4e`
- 分支：`feat/cognitive-pilot-reference-v1`
- 性质：**reference eligibility source audit**。本文记录当前注册表真值和未来 pipeline 的候选边界；不创建 reference row，不改变 publication、scorer、report 或数据库行为。
- 配套文档：`cognitive-literature-reference-candidates-v1.md`（COG-P4 §4.2 / §4.2.1）

## 1. Scope

本轮回答两个问题：

1. 当前 Cognitive Library 的哪些 metric 明确有资格进入未来 Reference pipeline 的候选集合；
2. 这个资格字段是否 fail-closed，并且不会因为 `primary` role 或 report 使用位置被隐式放大。

这里的“有资格”只表示代码将该 metric 标记为 `referenceEligible=true`。它不表示已经存在文献数值、已经通过人口/协议匹配，也不表示结果可以展示常模位置。

本轮明确不做：

- 不创建 `AssessmentReferenceSet` / `AssessmentReferenceEntry`；当前新增 reference rows = **0**；
- 不把现有文献锚定、模拟数据或候选对象改为 ACTIVE；当前 ACTIVE cognitive reference = **0**；
- 不实现 4.3 Reference Applicability runtime、4.4 Frozen Reference Binding、4.5–4.8 audience projection/regression；
- 不修改 Student/Parent、Teacher 或 Admin report，不修改 FINAL runtime、scorer、Bundle、COS 或数据库 schema；
- 不创建 `CognitiveNormEngine`、第二套 Reference Registry、连续年龄插值或自动 norm fitting；
- 不做 touch/desktop correction、device penalty/bonus 或 device-specific norm switching。

### 1.1 审计快照

| 轴 | 当前事实 | 本文含义 |
|---|---|---|
| Product publication | 28 个 exact identities：9 `PUBLISHED`、19 `DRAFT`、0 `RETIRED` | 工程可发布状态，不是科研成熟度 |
| Scientific status | 24 个真实 task identity 全部 `PILOT`；`fake` 为 `FRAMEWORK` | exact identity scoped；当前 `RESEARCH_GRADE_IDENTITIES` 为空 |
| Reference applicability | 所有 v2 `TaskDefinition.references` 均为空 | 没有任何 metric 已绑定 reference version/kind/context |
| Eligibility | 旧 `primary/report` fallback 识别的 22 个候选中，15 个当前 PUBLISHED metric 明确为 `true`、7 个收紧为 `false`；其余未显式覆盖的 PUBLISHED metric 及全部 DRAFT 也为 `false` | 只做候选资格筛选，不等同 reference 可用 |
| Evidence Mapping | 版本 `1.0.0`，只提供 domain/facet/role 语义映射 | 只做构念链接，不授予 eligibility 或 applicability |

### 1.2 三条状态轴不得合并

一个未来允许的组合可以是：

```text
PUBLISHED + PILOT + literature_beta
```

其中：

- `PUBLISHED` = 任务定义层面允许产品发布；
- `PILOT` = 当前 exact task identity 的科研成熟度仍是试行；
- `literature_beta` = 某个经过协议/人群审查的试行参考层，仍不是正式常模。

本轮没有把任何 task 或 metric 推进到第三轴的实现状态。

## 2. Authoritative truth

### 2.1 单一 eligibility 真值

未来 consumer 应从 exact v2 definition 读取：

```text
TaskDefinition.metrics[metricKey].referenceEligible
```

它的真实来源和传递链路是：

```text
RegistryEntry.metricDefinitions[metricKey].referenceEligible
  → v2/registry.ts（原值透传）
  → TaskDefinition.metrics[metricKey].referenceEligible
  → future reference candidate filter
```

本轮给 legacy `MetricDefinition` 增加了显式 `referenceEligible: boolean`。registry 的 `metric()` helper 默认写入 `false`，只有 exact RegistryEntry definition 对批准的 metric 显式覆盖为 `true`。因此：

- `role === 'primary'` 不再自动授予 eligibility；
- `reportDefinition.primaryMetrics` 不再自动授予 eligibility；
- Evidence Mapping 的 `domain/facet/role` 不授予 eligibility；
- 文档表格不是 runtime 的第二份 eligibility truth。

### 2.2 Publication gate 的 fail-closed 约束

`validateTaskDefinition` / `cognitive:audit` 现在对每个 metric 检查：

- `referenceEligible` 必须是显式 boolean；
- `referenceEligible=true` 时，`valueType` 必须是标量 `number` 或 `integer`；
- `referenceEligible=true` 时，metric 不能是 `quality` 或 `research_only`；
- reference mapping 仍须引用现有 metric key，且 key、instrument version、scoring version、direction 必须精确匹配；
- 不要求每个 `PUBLISHED` task 必须拥有 eligible metric；`PUBLISHED + PILOT + 0 eligible` 是合法状态；
- `TaskDefinition.references` 仍然是具体 applicability 的声明位置，本轮全部为 `[]`。

因此 `nback.dPrimeByN` 的 `map/object` 输出不引入 selector、map path 或 transformation；它保持 `referenceEligible=false`。`maxReliableN` 也保持 `false`，因为它是项目内质量阈值派生的 level，而不是来源中的原始 scalar metric。

### 2.3 现有 Reference Core 约束

未来正式定义必须复用 shared `AssessmentReferenceSetDefinition` / `AssessmentReferenceEntry`：

- `ReferenceKind`：`normative_distribution`、`criterion_threshold`、`descriptive_sample`；
- `ReferenceEvidenceLevel`：`literature_beta`、`local_pilot`、`local_norm`、`validated_norm`（以及未请求状态 `none`）；
- `ReferenceProvenance`：`literature_reported`、`literature_derived_estimate`、`local_observed`。

`normative_distribution` 至少要有可核验的 mean+SD 或 percentile table；`criterion_threshold` 必须有 thresholds；每条 entry 还要有 exact instrument/scoring identity、population、source 和 limitations。本轮没有 source 满足完整 admission 条件到足以落 row。

## 3. 28 exact identity audit

身份键始终是：

```text
testType / engineVersion / scoringVersion
```

下表对应当前 source registry、v2 adapter 和 `cognitive:audit`。`eligible` 是当前 `referenceEligible=true` 的 metric keys；`mapping` 是 Evidence Mapping 摘要；`ref=0` 表示当前 `TaskDefinition.references.length`。

| # | exact identity | Product | Scientific | report headline | eligible | mapping | ref |
|---:|---|---|---|---|---|---|---:|
| 1 | `fake/1.0.0/1.0.0` | DRAFT | FRAMEWORK | `accuracy` | — | — | 0 |
| 2 | `reaction/1.0.0/1.0.0` | DRAFT | PILOT | `medianRtMs` | — | — | 0 |
| 3 | `memory/1.0.0/1.0.0` | DRAFT | PILOT | `maxSpan` | — | — | 0 |
| 4 | `stroop/1.0.0/1.0.0` | DRAFT | PILOT | `stroopEffectMs` | — | — | 0 |
| 5 | `reaction/1.0.0/1.1.0` | PUBLISHED | PILOT | `medianRtMs` | `medianRtMs`, `rtICV` | `processing_speed/simple_response`; `sustained_attention/response_stability, omission_control` | 0 |
| 6 | `memory/1.0.0/1.1.0` | PUBLISHED | PILOT | `maxSpan` | `maxSpan` | `working_memory/verbal_storage` | 0 |
| 7 | `stroop/1.0.0/1.1.0` | PUBLISHED | PILOT | `stroopEffectMs` | `stroopEffectMs`, `incongruentAccuracy` | `interference_control/semantic_interference` | 0 |
| 8 | `gonogo/1.0.0/1.0.0` | PUBLISHED | PILOT | `commissionRate` | `commissionRate`, `dPrime` | `response_inhibition/action_withholding` | 0 |
| 9 | `cpt/1.0.0/1.0.0` | PUBLISHED | PILOT | `dPrime` | `dPrime`, `omissionRate`, `commissionRate`, `rtICV` | `sustained_attention/target_discrimination, omission_control, response_stability`; `response_inhibition/action_withholding` | 0 |
| 10 | `nback/1.0.0/1.0.0` | PUBLISHED | PILOT | `maxReliableN` | — | `working_memory/updating` | 0 |
| 11 | `corsi/1.0.0/1.0.0` | PUBLISHED | PILOT | `maxSpan` | `maxSpan` | `working_memory/visuospatial_storage` | 0 |
| 12 | `sst/1.0.0/1.0.0` | PUBLISHED | PILOT | `ssrtMs` | `ssrtMs` | `response_inhibition/action_cancellation` | 0 |
| 13 | `taskswitch/1.0.0/1.0.0` | PUBLISHED | PILOT | `switchCostRtMs` | `switchCostRtMs`, `switchCostAccuracy` | `cognitive_flexibility/trial_switching` | 0 |
| 14 | `patterncompare/1.0.0/1.0.0` | DRAFT | PILOT | `correctPerMinute` | — | `processing_speed/visual_comparison` | 0 |
| 15 | `flanker/1.0.0/1.0.0` | DRAFT | PILOT | `flankerEffectMs` | — | `interference_control/perceptual_interference` | 0 |
| 16 | `cardsort/1.0.0/1.0.0` | DRAFT | PILOT | `switchCostRtMs` | — | `cognitive_flexibility/rule_shifting` | 0 |
| 17 | `digitbackward/1.0.0/1.0.0` | DRAFT | PILOT | `maxSpan` | — | `working_memory/verbal_manipulation` | 0 |
| 18 | `picturesequence/1.0.0/1.0.0` | DRAFT | PILOT | `adjacentPairScore` | — | `episodic_learning_memory/sequence_learning` | 0 |
| 19 | `pairedassociate/1.0.0/1.0.0` | DRAFT | PILOT | `immediateAccuracy` | — | `episodic_learning_memory/paired_learning` | 0 |
| 20 | `matrix/1.0.0/1.0.0` | DRAFT | PILOT | `accuracy` | — | `fluid_reasoning/rule_induction` | 0 |
| 21 | `mentalrotation/1.0.0/1.0.0` | DRAFT | PILOT | `accuracy` | — | `visuospatial_reasoning/mental_rotation` | 0 |
| 22 | `tower/1.0.0/1.0.0` | DRAFT | PILOT | `minimumMoveSolveRate` | — | `planning/look_ahead` | 0 |
| 23 | `trailmaking/1.0.0/1.0.0` | DRAFT | PILOT | `completionTimeMs` | — | standalone（无 mapping） | 0 |
| 24 | `reversallearning/1.0.0/1.0.0` | DRAFT | PILOT | `reversalAccuracy` | — | standalone（无 mapping） | 0 |
| 25 | `bart/1.0.0/1.0.0` | DRAFT | PILOT | `adjustedPumps` | — | standalone（无 mapping） | 0 |
| 26 | `wordlist/1.0.0/1.0.0` | DRAFT | PILOT | `immediateAccuracy` | — | standalone（无 mapping） | 0 |
| 27 | `lexicaldecision/1.0.0/1.0.0` | DRAFT | PILOT | `dPrime` | — | standalone（无 mapping） | 0 |
| 28 | `emotionrecognition/1.0.0/1.0.0` | DRAFT | PILOT | `balancedAccuracy` | — | standalone（无 mapping） | 0 |

结论：`cognitive:audit` 必须通过 `28/28`，registry count = 28，published count = 9，draft count = 19，retired count = 0。当前 PUBLISHED eligible count = **15**，DRAFT eligible count = **0**，全库 eligible count = **15**；非标量 eligible count = **0**。

## 4. PUBLISHED metric matrix

下表只列出当前显式 `referenceEligible=true` 的 15 个 PUBLISHED metric。`report use` 只表示当前 v2 report 层级；`reference applicability` 全部为 `none`，因为 `TaskDefinition.references=[]`。

| Task / identity | metricKey | role / visibility | valueType | construct · unit · direction | Evidence Mapping | reference applicability |
|---|---|---|---|---|---|---|
| reaction / `1.0.0/1.1.0` | `medianRtMs` | primary / headline | number | processing_speed · ms · lower | simple_response / primary | none |
| reaction / `1.0.0/1.1.0` | `rtICV` | primary / user | number | processing_speed · ratio · lower | response_stability / supporting | none |
| memory / `1.0.0/1.1.0` | `maxSpan` | primary / headline | integer | working_memory · count · higher | verbal_storage / primary | none |
| stroop / `1.0.0/1.1.0` | `stroopEffectMs` | primary / headline | number | inhibitory_control · ms · lower | semantic_interference / primary | none |
| stroop / `1.0.0/1.1.0` | `incongruentAccuracy` | primary / user | number | inhibitory_control · ratio · higher | semantic_interference / primary | none |
| gonogo / `1.0.0/1.0.0` | `commissionRate` | primary / headline | number | response_inhibition · ratio · lower | action_withholding / primary | none |
| gonogo / `1.0.0/1.0.0` | `dPrime` | primary / user | number | response_inhibition · d-prime · higher | action_withholding / primary | none |
| cpt / `1.0.0/1.0.0` | `dPrime` | primary / headline | number | sustained_attention · d-prime · higher | target_discrimination / primary | none |
| cpt / `1.0.0/1.0.0` | `omissionRate` | primary / user | number | sustained_attention · ratio · lower | omission_control / primary | none |
| cpt / `1.0.0/1.0.0` | `commissionRate` | primary / user | number | sustained_attention · ratio · lower | action_withholding / supporting | none |
| cpt / `1.0.0/1.0.0` | `rtICV` | primary / user | number | sustained_attention · ratio · lower | response_stability / primary | none |
| corsi / `1.0.0/1.0.0` | `maxSpan` | primary / headline | integer | visuospatial_memory · count · higher | visuospatial_storage / primary | none |
| sst / `1.0.0/1.0.0` | `ssrtMs` | primary / headline | number | response_inhibition · ms · lower | action_cancellation / primary | none |
| taskswitch / `1.0.0/1.0.0` | `switchCostRtMs` | primary / headline | number | cognitive_flexibility · ms · lower | trial_switching / primary | none |
| taskswitch / `1.0.0/1.0.0` | `switchCostAccuracy` | primary / user | number | cognitive_flexibility · ratio · lower | trial_switching / primary | none |

### 4.1 Explicit decision table: old adapter result → hardened result

在 hardening 前，`primary/report` fallback 将 22 个 PUBLISHED metric 全部视作 eligible。下列 7 个决定性变化把当前真值收紧到 15 个：

| Metric | old fallback | current explicit flag | decision reason |
|---|---:|---:|---|
| `reaction.missRate` | true | **false** | omission/process quality 与设备、注意及 timeout 规则共同决定；当前没有 exact external numeric identity |
| `memory.totalCorrectTrials` | true | **false** | 受 `maxLength`、每级 trial 数、终止规则和 profile 强烈影响，是 protocol-dependent supporting count |
| `stroop.errorCost` | true | **false** | 条件准确率派生 ratio；当前 source 尚无与本项目公式一一对应的稳定 numeric statistic |
| `nback.dPrimeByN` | true | **false** | registry 输出为 `map/object`；scalar adapter 不增加 map selector、路径提取或转换 |
| `nback.maxReliableN` | true | **false** | 当前项目派生 level（`dPrime >= 0.5` 且 `hitRate >= 0.15`），不是来源直接报告的 metric |
| `corsi.totalCorrectTrials` | true | **false** | total correct 依赖 span 上限、每级 trial 数、终止和 digital layout，不是稳定的跨协议 reference outcome |
| `sst.pRespondStop` | true | **false** | stop-process/quality ratio，当前用于解释 SSRT 的可解释性边界，不作为独立 population reference outcome |

其余 15 个 `true` 是显式逐项批准的 scalar participant-outcome candidates；这不等于它们已经有可用 source。所有 `quality`、`research_only`、`object/array` 和未显式覆盖的 metric 均保持 `false`。

### 4.2 N-back special case

| Metric | `valueType` | `referenceEligible` | 原因 |
|---|---|---:|---|
| `dPrimeByN` | object/map | false | 每个 N 的结果是结构化集合；本轮不引入 selector 或 transformation |
| `maxReliableN` | integer/level | false | 项目派生 reliability threshold，不是 source 的原始分布 metric |

因此本轮 N-back **eligible = 0**，但不影响 N-back task 本身保持 `PUBLISHED + PILOT`。

## 5. DRAFT matrix

DRAFT 不因本审计而 publish。helper 的 fail-closed 默认意味着以下 19 个 exact identities 当前均无 eligible metric；未来候选仍需重新做 source、protocol、scoring 和人群审查。

| exact identity | current eligible |
|---|---|
| `fake/1.0.0/1.0.0` | — |
| `reaction/1.0.0/1.0.0` | — |
| `memory/1.0.0/1.0.0` | — |
| `stroop/1.0.0/1.0.0` | — |
| `patterncompare/1.0.0/1.0.0` | — |
| `flanker/1.0.0/1.0.0` | — |
| `cardsort/1.0.0/1.0.0` | — |
| `digitbackward/1.0.0/1.0.0` | — |
| `picturesequence/1.0.0/1.0.0` | — |
| `pairedassociate/1.0.0/1.0.0` | — |
| `matrix/1.0.0/1.0.0` | — |
| `mentalrotation/1.0.0/1.0.0` | — |
| `tower/1.0.0/1.0.0` | — |
| `trailmaking/1.0.0/1.0.0` | — |
| `reversallearning/1.0.0/1.0.0` | — |
| `bart/1.0.0/1.0.0` | — |
| `wordlist/1.0.0/1.0.0` | — |
| `lexicaldecision/1.0.0/1.0.0` | — |
| `emotionrecognition/1.0.0/1.0.0` | — |

这不是否定这些构念的研究价值；只是本轮不把 DRAFT candidate inventory 伪装成已批准 eligibility，也不创建 DRAFT reference set。

## 6. ReferenceKind semantics in the next adapter stage

本轮不绑定任何 `ReferenceKind`，但 §4.2.1 的 adapter contract 已补齐：

- `normative_distribution` 才能讨论 mean/SD、z/T 或经明确允许的 percentile；
- `criterion_threshold` 只能在完整 thresholds 和依据可核验时使用；
- `descriptive_sample` 只描述有边界的研究样本，不能暗示人口位置；
- cognitive adapter 对可用 `descriptive_sample` 强制 `relativePosition='descriptive'`，同时保留 `meanDifference`，并保持 `z/t/percentile/criterionBand=null`；
- shared Scale/reference core 的计算语义不改，quality-gated 或 unavailable 结果仍不产生 position。

## 7. Reference admission checklist

单个 metric 下一轮要升级为 `READY_NORMATIVE_BETA` 或 `READY_DESCRIPTIVE_BETA`，必须补齐：

1. exact `testType/engineVersion/scoringVersion` 和实际 profile/config；
2. source 原文表格/行、样本纳入排除和人口匹配；
3. stimulus、语言、duration/ISI/foreperiod、trial/block、response modality；
4. RT floor/trim、timeout/omission/error handling、adaptive/stopping rule；
5. 当前 scoring formula 与 source formula 的逐项 comparison；
6. 真实、可复核的 mean/SD、percentile table 或 threshold；
7. `limitations`、`disclaimer`、设备/输入 caveat；
8. shared Reference Core validation 和 non-overlapping population checks；
9. status 仍为 `DRAFT`，经过 review 后才可能讨论 ACTIVE，且不自动绑定到 session/report。

本轮没有任何一行完成全部条件。

## 8. Explicit non-actions

```text
AssessmentReferenceSet / Entry created: NO
ACTIVE literature reference: NO
Student/Parent report changed: NO
Teacher report changed: NO
Admin report changed: NO
FINAL runtime binding changed: NO
Reference applicability changed: NO
Norm Engine created: NO
continuous-age interpolation: NO
automatic norm fitting: NO
device correction or device-specific norm switch: NO
DB schema/migration: NO
```

**4.1.1 ✅ explicit eligibility hardening complete. 4.2.1 continues in the companion literature audit. 4.3 NOT STARTED.**

**STOPPED — waiting for review.**
