
# Huisurvey Cognitive Round 1 开发设计
## 认知任务扩展、测量指标体系、三档测评 Profile、数据存储与导出

**版本**：v1.0  
**目标项目**：`caohuibj/eduK12-new-version`  
**参考项目**：`caohuibj/cogtest`  
**文档性质**：开发实施规格 / 评分与数据契约设计  
**本轮边界**：只做单个认知任务的指标、评分、数据质量与单任务报告；**不做多个认知任务之间的综合分析，也不做认知任务与心理量表之间的综合反馈。**

---

# 1. 背景与现状

当前 `eduK12-new-version` 已经具备较可靠的 Cognitive Domain 基础：

- 静态、版本化 `Cognitive Registry`；
- `testType + engineVersion + scoringVersion` 精确解析，无 latest fallback；
- `CognitiveTestConfig / CognitiveAssignment / CognitiveSession / CognitiveTrial`；
- `configSnapshotEncrypted`、`randomSeed`、`scoreEncrypted`、`metricsEncrypted`、`qualityFlagsEncrypted`；
- `CognitiveTrial` append-only，`(sessionId, trialIndex)` 唯一；
- Reaction / Memory / Stroop 已完成服务端评分；
- Cognitive 单任务与 Composite Assessment 已有 CSV / SAV 的 summary / full export；
- 匿名参与、恢复凭证、权限隔离与下载授权已存在。

因此本轮**不得重构或替换现有 Cognitive Core**。本轮目标是在已有安全、版本化、可复现的框架上补齐“测什么、怎么测、如何记录、如何导出”。

`cogtest` 的主要参考价值在于：

1. 17 类认知任务的覆盖；
2. 每类任务已经形成较明确的 metric key；
3. 单任务结果展示与聚合报告已有可参考的 UI/数据结构；
4. 导出存在 metric label/data dictionary/异步 job 等经验。

但以下设计**不直接复制**：

- trust-client scoring；
- 虚拟常模；
- 把所有任务简单映射到 0–100 后再平均；
- 将心理量表和不同认知构念直接做 weighted overallScore；
- 宽松 JSON contract；
- 以最新算法重新解释历史结果。

---

# 2. 本轮开发目标

本轮完成后，系统应满足：

1. 认知任务从现有 Reaction / Memory / Stroop 扩展为可持续增长的任务库；
2. 每个任务均具有明确 `metricDefinitions`；
3. 每个任务均定义 `qualityDefinitions`；
4. 每个任务均提供 `experience / standard / research` 三档 Profile；
5. 发布 Assignment 时可选择 Profile，且发布后冻结；
6. 每个任务保存完整 trial-level raw data；
7. 服务端生成 metrics、qualityFlags 与 product score；
8. 每个任务提供独立、可解释的单任务报告；
9. export 支持 summary-wide + research-long；
10. CSV/SAV 继续保留，并新增 XLSX / export manifest / data dictionary 设计；
11. 历史数据可按 config/scoring/profile/metric definition 版本复现；
12. 不引入跨任务综合分、跨量表联合结论。

---

# 3. 明确非目标

本轮不做：

- Cognitive Domain 总分；
- 多认知任务 weighted average；
- “综合认知指数”；
- 认知 + 心理量表综合判断；
- 正式人口常模、percentile、z-score；
- 临床诊断结论；
- AI 自动诊断；
- 班级/学校层面的统计 Dashboard；
- 多次测量纵向建模；
- norm dataset 管理。

以上进入 Round 2 或更后阶段。

---

# 4. 任务范围与优先级

## 4.1 P0：现有任务升级

- Reaction
- Memory / Digit Span Forward
- Stroop

要求：不改变历史 scoringVersion 的结果；通过新增 registry metadata 或新 scoringVersion 完成指标扩展。

## 4.2 P1：本轮必须新增的核心 K12 Battery

- Go/No-Go
- CPT
- N-Back
- Corsi
- SST
- Task Switching

这 6 个任务优先补足：

- sustained attention；
- response inhibition；
- working-memory updating；
- visuospatial memory；
- motor stopping；
- cognitive flexibility。

## 4.3 P2：本轮建议新增的扩展任务

- Tower of London
- Matrix Reasoning / Sandia
- Iowa Gambling Task
- BART

## 4.4 P3：资源与文化适配后启用

- Emotion Recognition
- Dot Probe
- Emotional Stroop
- Lexical Decision Task

这些任务代码可以进入 Registry，但在刺激资源、license、语言材料、K12 年龄适配验证完成前不得默认发布为 `PUBLISHED`。

---

# 5. 三档测评 Profile

每个认知任务必须提供三个 Profile：

```text
experience   体验版
standard     正式版
research     科研版
```

## 5.1 体验版

目的：

- 教学演示；
- 产品体验；
- 功能预览；
- 快速说明范式。

要求：

- 明显减少 trial 数；
- 尽量控制在 2–5 分钟；
- 必须有 practice；
- 保留完整 raw trial；
- 可以计算 descriptive metrics；
- **不得把稳定性不足的指标包装为正式个体结论**；
- 报告显示“体验版，结果仅供体验”。

## 5.2 正式版

目的：

- K12 常规场景；
- 课堂/学校综合测评；
- 控制学生疲劳。

要求：

- trial 数高于体验版、低于科研版；
- 常见目标 4–12 分钟；
- 尽量保证主要 metric 有可用性；
- 某些高度依赖 trial 数的指标（如 SSRT）必须附稳定性提示；
- 支持单任务正式报告。

## 5.3 科研版

目的：

- 研究数据采集；
- 学术合作；
- 对测量稳定性要求更高的场景。

要求：

- trial 数参考经典范式和方法学文献；
- 允许 block/break；
- 导出完整 raw trial；
- 必须保留 stimulus/config/version；
- 允许额外 reliability / block-effect metrics；
- 不等于“自动获得临床效度”。

## 5.4 Profile 是配置，不是新的 testType

禁止：

```text
reaction_experience
reaction_standard
reaction_research
```

统一：

```text
testType = reaction
profile = experience | standard | research
```

Profile 的实际参数进入 `CognitiveTestConfig.config` 并在 Session 中冻结。

推荐配置：

```ts
type CognitiveProfile = 'experience' | 'standard' | 'research'

interface CognitiveProfileDefinition {
  profile: CognitiveProfile
  estimatedMinutes: [number, number]
  configPatch: Record<string, unknown>
  reportCaveats: string[]
}
```

发布 Assignment 时只允许从 Config 已声明的 Profile 中选择。

---

# 6. Registry 扩展

当前 Registry 继续作为任务实现入口，但扩展为真正的测量语义注册表。

建议：

```ts
interface CognitiveRegistryEntry<TConfig, TTrial> {
  testType: string
  name: string
  category: string

  engineVersion: string
  scoringVersion: string

  configSchema: ZodSchema<TConfig>
  trialSchema: ZodSchema<TTrial>
  score: CognitiveScorer<TConfig, TTrial>

  profiles: Record<CognitiveProfile, CognitiveProfileDefinition>

  metricDefinitionVersion: string
  metricDefinitions: Record<string, MetricDefinition>

  qualityDefinitionVersion: string
  qualityDefinitions: Record<string, QualityDefinition>

  reportDefinitionVersion: string
  reportDefinition: SingleTaskReportDefinition

  stimulusRequirements?: StimulusRequirement[]
}
```

## 6.1 MetricDefinition

```ts
interface MetricDefinition {
  key: string
  label: string
  shortLabel?: string

  construct: string
  description: string

  unit: 'ms' | 'ratio' | 'count' | 'd-prime' | 'level' | 'score' | 'map'
  valueType: 'number' | 'integer' | 'object' | 'array'

  direction:
    | 'higher_is_better'
    | 'lower_is_better'
    | 'descriptive'
    | 'signed'
    | 'target_range'

  role: 'primary' | 'secondary' | 'quality' | 'research_only'
  precision?: number

  requiresQualityFlags?: string[]
  availableProfiles: CognitiveProfile[]

  export: {
    summary: boolean
    label: string
  }
}
```

## 6.2 关键原则

- metric key 是数据契约，不因中文文案变化而变化；
- label 可本地化；
- direction 不是“高低好坏”的 UI 强制规则；
- BART 风险倾向、DotProbe bias 等允许 `signed/descriptive`；
- 任何 metric 的公式变化必须升级 `scoringVersion`；
- metric 含义变化应升级 `metricDefinitionVersion`。

---

# 7. Quality Definitions

质量控制必须成为所有任务的一等公民。

全局建议：

```text
interpretable
interrupted
insufficientTrials
excessiveOmissions
excessivePremature
lowAccuracy
extremeResponsePattern
visibilityInterrupted
```

任务可增加专属 flag，例如：

```text
SST:
pRespondStopOutOfRange
strategicSlowingSuspected

CPT:
highPerseverationRate

TaskSwitch:
insufficientSwitchTrials

DotProbe:
lowReliabilitySignal
```

`interpretable=false` 时：

- score 可保留；
- raw/metrics 必须保留；
- 报告必须优先显示质量提示；
- 不生成强解释文本；
- export 不丢弃记录，而是导出 quality flags。

---

# 8. 统一评分返回 Contract

```ts
interface CognitiveScoreResult {
  score: number | null            // product index，可选
  metrics: Record<string, unknown>
  qualityFlags: Record<string, boolean | number | string>
}
```

注意：

- `score` 不是 percentile；
- `score` 不是 norm score；
- 任务可以 `score=null`；
- 对科研价值更高的任务，metrics 优先于 product score；
- 前端结果页必须从 Registry 的 `metricDefinitions` 渲染，而不是任意遍历 JSON。

---

# 9. Practice

所有任务必须拥有 practice，但 practice：

- 不进入正式 trialIndex；
- 不写入正式 scoring dataset；
- 可以记录独立 practice telemetry，但默认不导出；
- 必须允许失败后重复；
- 正式 trial 开始前清空 practice state；
- SST 等复杂任务可拆为 Go-only practice + stop practice。

推荐 Session 不新增 `practice` 状态；继续由 Task Runner 内部实现，与现有架构保持一致。

---

# 10. Randomization 与可复现性

所有需要随机化的任务必须只依赖 Session `randomSeed`：

- stimulus order；
- condition order；
- target position；
- deck/balloon hidden schedule（如适用）；
- trial sequence；
- response mapping（如研究配置启用 counterbalancing）。

严禁直接依赖不可复现的 `Math.random()` 生成正式 trial sequence。

Research profile 还应保存：

```text
randomizationAlgorithmVersion
counterbalanceCell
blockDefinitionVersion
```

---

# 11. 单任务报告（Round 1）

本轮只提供单任务报告。

统一结构：

```ts
interface CognitiveSingleTaskReport {
  sessionId: string
  testType: string
  taskName: string

  profile: 'experience' | 'standard' | 'research'

  configVersion: string
  engineVersion: string
  scoringVersion: string
  metricDefinitionVersion: string
  reportDefinitionVersion: string

  quality: {
    interpretable: boolean
    flags: Record<string, unknown>
    messages: string[]
  }

  score?: {
    value: number | null
    type: 'product_index'
    caveat: string
  }

  primaryMetrics: ReportMetric[]
  secondaryMetrics: ReportMetric[]

  interpretation: string[]
  caveats: string[]
}
```

## 11.1 呈现原则

结果页顺序固定：

1. 任务名称 + Profile；
2. 数据质量；
3. 主要指标；
4. 次级指标；
5. 简要解释；
6. 方法/版本说明；
7. “不是医学诊断/不是人口常模”的必要提示。

不得：

- 在没有 norm 的情况下显示“超过全国 85%”；
- 把 product score 命名为“智力/认知百分位”；
- 对体验版输出确定的能力等级。

---

# 12. 各任务详细开发规格

## 13. 简单反应时（Reaction） (`reaction`)

**构念**：处理速度 / 反应稳定性  
**实施优先级**：现有，必须升级  
**Profile 默认值**：体验：8 trials，约1–2 min；正式：20 trials，约2–3 min；科研：60 trials，约5–7 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `medianRtMs` | 中位反应时 | ms | `lower_is_better` | 主指标；仅纳入有效反应。 |
| `rtICV` | 反应时变异系数 SD/Mean | ratio | `lower_is_better` | 反应稳定性；比单纯 SD 更便于不同速度水平比较。 |
| `missRate` | 遗漏率 | ratio | `lower_is_better` | 超时/无有效反应比例。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `meanRtMs` | 平均反应时 | ms | `lower_is_better` | 辅助描述，受长尾影响大于 median。 |
| `sdRtMs` | 反应时标准差 | ms | `lower_is_better` | 绝对波动。 |
| `fastestRtMs` | 最快有效反应 | ms | `descriptive` | 仅描述，不用于能力结论。 |
| `prematureCount` | 提前反应次数 | count | `lower_is_better` | 用于识别预判/抢答。 |
| `validTrialCount` | 有效试次数 | count | `higher_is_better` | 数据质量与解释前提。 |

### Trial raw payload

`trialIndex, foreperiodMs, rtMs|null, prematureCount, interrupted`

### Quality flags

interpretable；insufficientValidTrials；highMissRate；excessivePremature；interrupted；extremeRtPattern。

### 单任务报告要求

主呈现 medianRtMs + rtICV + missRate；score 仅保留为 product index，不解释为 percentile/常模。


## 14. 数字广度顺背（Digit Span Forward） (`memory`)

**构念**：短时记忆 / 言语工作记忆容量  
**实施优先级**：现有，必须升级  
**Profile 默认值**：体验：start=3、max=6、每长度2题，约2–3 min；正式：start=3、max=8、每长度2题，约4–6 min；科研：start=3、max=9、每长度2题，约6–8 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `maxSpan` | 最大正确广度 | digit count | `higher_is_better` | 最核心容量指标。 |
| `totalCorrectTrials` | 正确试次数 | count | `higher_is_better` | 避免只依赖单个 terminal span。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `levelsPassed` | 通过长度级数 | count | `higher_is_better` | 容量进展。 |
| `firstTryPassCount` | 首次尝试即通过的级数 | count | `higher_is_better` | 稳定性/学习需求。 |
| `medianResponseDurationMs` | 中位作答时长 | ms | `descriptive` | 策略/操作负担辅助指标。 |
| `trialCount` | 实际完成试次数 | count | `descriptive` | 自适应任务必须导出。 |

### Trial raw payload

`trialIndex, length, trialWithinLevel, sequence[], response[], responseDurationMs, correct(服务端推导), interrupted`

### Quality flags

interpretable；interrupted；insufficientCompletedLevels；invalidSequencePattern。

### 单任务报告要求

主呈现 maxSpan；不把 maxSpan/最大配置简单等同人口百分位。


## 15. 色词 Stroop (`stroop`)

**构念**：干扰抑制 / 选择性注意  
**实施优先级**：现有，必须升级  
**Profile 默认值**：体验：16 trials（8 congruent/8 incongruent），约2 min；正式：40 trials（20/20），约4–5 min；科研：96 trials（48/48，建议分2–3 blocks），约8–10 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `stroopEffectMs` | Stroop 干扰效应 | ms | `lower_is_better` | 正确试次中 incongruent median RT - congruent median RT。 |
| `errorCost` | 错误代价 | ratio | `lower_is_better` | congruent accuracy - incongruent accuracy。 |
| `incongruentAccuracy` | 不一致条件准确率 | ratio | `higher_is_better` | 抑制控制准确性。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracy` | 总体准确率 | ratio | `higher_is_better` | 总体表现。 |
| `congruentAccuracy` | 一致条件准确率 | ratio | `higher_is_better` | 基线。 |
| `medianRtCongruent` | 一致条件中位RT | ms | `lower_is_better` | 基线速度。 |
| `medianRtIncongruent` | 不一致条件中位RT | ms | `lower_is_better` | 冲突条件速度。 |
| `timeoutCount` | 超时次数 | count | `lower_is_better` | 质量/注意。 |

### Trial raw payload

`trialIndex, word, inkColor, response|null, rtMs|null, condition(服务端推导), correct(服务端推导), interrupted`

### Quality flags

interpretable；insufficientValidCongruentRt；insufficientValidIncongruentRt；lowAccuracy；interrupted。

### 单任务报告要求

优先展示干扰效应 + 不一致准确率；不得仅以总体 accuracy 代表 Stroop 抑制能力。


## 16. Go/No-Go (`gonogo`)

**构念**：反应抑制 / 冲动控制  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：40 trials（No-Go 25%），约2–3 min；正式：120 trials（No-Go 25%），约5–7 min；科研：240 trials（No-Go 25%，建议4 blocks），约10–14 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `commissionRate` | No-Go 误按率 | ratio | `lower_is_better` | 核心反应抑制错误。 |
| `dPrime` | 信号检测敏感度 d′ | d-prime | `higher_is_better` | 综合命中与误报，需做极端比例校正。 |
| `goMedianRtMs` | Go 正确反应中位RT | ms | `descriptive` | 解释速度—准确权衡。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `hitRate` | Go 命中率 | ratio | `higher_is_better` | Go 正确反应。 |
| `omissionRate` | Go 遗漏率 | ratio | `lower_is_better` | 注意/反应不足。 |
| `commissionErrors` | No-Go 误按次数 | count | `lower_is_better` | 原始计数。 |
| `postErrorSlowingMs` | 错误后减速 | ms | `descriptive` | 可选，正式/科研版启用。 |

### Trial raw payload

`trialIndex, stimulusId, trialType(go|nogo), response, responded, rtMs|null, correct, interrupted`

### Quality flags

interpretable；insufficientNoGoTrials；excessiveOmissions；extremeCommissionRate；speedAccuracyTradeoffSuspected；interrupted。

### 单任务报告要求

commissionRate 与 dPrime 为核心；Go RT 只作为速度—准确权衡的辅助证据。


## 17. 连续执行任务（Generic CPT-X） (`cpt`)

**构念**：持续注意 / 警觉 / 反应抑制  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：60 trials，约3 min；正式：180 trials，约7–10 min；科研：360 trials，约14–20 min，至少分6 blocks并保留 block 指标。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `dPrime` | 目标/非目标辨别 d′ | d-prime | `higher_is_better` | 核心辨别能力。 |
| `omissionRate` | 目标遗漏率 | ratio | `lower_is_better` | 持续注意。 |
| `commissionRate` | 非目标误报率 | ratio | `lower_is_better` | 冲动/辨别失败。 |
| `rtICV` | 命中RT变异系数 | ratio | `lower_is_better` | 注意稳定性。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `hitMedianRtMs` | 目标命中中位RT | ms | `descriptive` | 反应速度。 |
| `hitRtSdMs` | 目标RT标准差 | ms | `lower_is_better` | 波动。 |
| `blockSlopeRt` | 跨 block RT 斜率 | ms/block | `descriptive` | 随时间变化。 |
| `blockSlopeOmission` | 跨 block omission 斜率 | ratio/block | `descriptive` | 注意衰减。 |
| `perseverationRate` | 极短反应比例 | ratio | `lower_is_better` | 如 <100ms，阈值由 scoringVersion 固定。 |

### Trial raw payload

`trialIndex, blockIndex, stimulus, isTarget, response, rtMs|null, correct, interrupted`

### Quality flags

interpretable；insufficientTargets；highOmissionRate；highPerseverationRate；insufficientDuration；interrupted。

### 单任务报告要求

必须同时呈现 d′、omission、commission、RT variability；单一 RT 不代表持续注意。


## 18. N-Back (`nback`)

**构念**：工作记忆更新 / 持续监控  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：1-back 30 trials，约2–3 min；正式：1-back 40 + 2-back 60 = 100 trials，约6–8 min；科研：1/2/3-back 各60 trials，共180，分6 blocks，约12–16 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `dPrimeByN` | 各 N 水平 d′ | map | `higher_is_better` | 核心敏感度。 |
| `maxReliableN` | 达到质量门槛的最高 N | level | `higher_is_better` | 产品摘要指标，门槛由 scoringVersion 固定。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `hitRateByN` | 各 N 命中率 | map | `higher_is_better` | 目标识别。 |
| `falseAlarmRateByN` | 各 N 误报率 | map | `lower_is_better` | 错误响应。 |
| `medianRtByN` | 各 N 正确反应中位RT | map ms | `descriptive` | 负荷效应。 |
| `loadCostDPrime` | 高负荷-低负荷 d′ 差 | d-prime | `lower_loss_is_better` | 负荷增加后的性能下降。 |

### Trial raw payload

`trialIndex, blockIndex, nLevel, stimulus, target, response, rtMs|null, correct, interrupted`

### Quality flags

interpretable；insufficientTargetsByN；ceilingOrFloorByN；excessiveOmissions；interrupted。

### 单任务报告要求

以 dPrimeByN 与 load effect 为主；maxReliableN 仅是配置内表现，不是标准化工作记忆等级。


## 19. Corsi Block-Tapping (`corsi`)

**构念**：视空间短时记忆 / 视空间工作记忆  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：span 3–6，每级1–2 trials，约3 min；正式：span 3–8，每级2 trials，约5–7 min；科研：span 3–9，每级2 trials，连续2次失败终止，约7–10 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `maxSpan` | 最大空间广度 | block count | `higher_is_better` | 核心容量指标。 |
| `totalCorrectTrials` | 总正确试次 | count | `higher_is_better` | 增强稳定性。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `firstTryPassCount` | 首次通过级数 | count | `higher_is_better` | 稳定性。 |
| `medianResponseDurationMs` | 中位复现时长 | ms | `descriptive` | 操作/策略辅助。 |
| `sequenceErrorDistance` | 序列位置错误距离 | score | `lower_is_better` | 科研版可选的部分信用指标。 |

### Trial raw payload

`trialIndex, spanLength, trialWithinLevel, sequence[], response[], responseDurationMs, correct, interrupted`

### Quality flags

interpretable；insufficientCompletedLevels；invalidBlockSequence；interrupted。

### 单任务报告要求

与 Digit Span 区分：Corsi 代表视空间 span，不合并成统一“记忆总分”。


## 20. 停止信号任务（SST） (`sst`)

**构念**：动作停止 / 反应抑制速度  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：40 total / 10 stop，约3 min，仅体验机制；正式：96 total / 24 stop，约5–7 min，结果标注“增强版估计”；科研：200 total / 50 stop（25% stop），约7–10+ min，符合 SST 共识对 group-level SSRT 的最低推荐。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `ssrtMs` | 停止信号反应时 SSRT | ms | `lower_is_better` | 科研版用 integration method；体验/正式版需显式标注估计稳定性受限。 |
| `pRespondStop` | Stop trial 响应概率 | ratio | `target_0.5` | 用于验证 staircase 是否工作。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `goMedianRtMs` | Go 中位RT | ms | `descriptive` | 检查策略性等待。 |
| `goOmissionRate` | Go 遗漏率 | ratio | `lower_is_better` | 质量指标。 |
| `goChoiceErrorRate` | Go 选择错误率 | ratio | `lower_is_better` | 质量指标。 |
| `meanSsdMs` | 平均 SSD | ms | `descriptive` | 停止难度。 |
| `unsuccessfulStopRtMs` | 失败 Stop 的 RT | ms | `descriptive` | race-model 描述。 |

### Trial raw payload

`trialIndex, trialType, goStimulus, response, rtMs|null, ssdMs|null, stopSignalPresented, stopSuccess, interrupted`

### Quality flags

interpretable；insufficientStopTrials；pRespondStopOutOfRange(<.25 or >.75)；highGoOmission；strategicSlowingSuspected；interrupted。

### 单任务报告要求

科研版 SSRT 为主；体验/正式版不得输出过度确定的个人抑制结论。


## 21. Task Switching (`taskswitch`)

**构念**：认知灵活性 / 任务集合转换  
**实施优先级**：P1 新增  
**Profile 默认值**：体验：48 trials，约3 min；正式：128 trials，约6–8 min；科研：256 trials，分4–8 blocks，约12–16 min，保证足够 switch/repeat 正确试次。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `switchCostRtMs` | RT 转换代价 | ms | `lower_is_better` | switch correct median RT - repeat correct median RT。 |
| `switchCostAccuracy` | 准确率转换代价 | ratio | `lower_is_better` | repeat accuracy - switch accuracy。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `medianRtSwitch` | Switch 中位RT | ms | `descriptive` | 转换条件。 |
| `medianRtRepeat` | Repeat 中位RT | ms | `descriptive` | 重复条件基线。 |
| `accuracySwitch` | Switch 准确率 | ratio | `higher_is_better` | 转换正确性。 |
| `accuracyRepeat` | Repeat 准确率 | ratio | `higher_is_better` | 基线。 |
| `mixingCost` | 混合区块 vs 单任务区块代价 | ms | `lower_is_better` | 科研版如设计包含 pure blocks 则启用。 |

### Trial raw payload

`trialIndex, blockIndex, taskRule, previousTaskRule, switchType, stimulus, response, correct, rtMs|null, interrupted`

### Quality flags

interpretable；insufficientSwitchTrials；insufficientRepeatTrials；lowAccuracy；interrupted。

### 单任务报告要求

switchCost 必须与 switch/repeat accuracy 同屏，避免速度—准确权衡误读。


## 22. Tower of London (`tol`)

**构念**：计划 / 问题解决  
**实施优先级**：P2 新增  
**Profile 默认值**：体验：4 puzzles，约4 min；正式：8 puzzles，约8–12 min；科研：12 puzzles，难度分层平衡，约15–20 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `perfectSolutionRate` | 最少步数完成比例 | ratio | `higher_is_better` | 计划有效性。 |
| `meanExcessMoves` | 平均超额步数 | moves | `lower_is_better` | 偏离最优解程度。 |
| `firstMovePlanningTimeMs` | 首步规划时间 | ms | `descriptive` | 计划启动策略。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `meanMoves` | 平均步数 | moves | `lower_is_better` | 总体效率。 |
| `completionRate` | 完成比例 | ratio | `higher_is_better` | 任务可完成性。 |
| `ruleViolationCount` | 规则违反次数 | count | `lower_is_better` | 执行控制/理解。 |

### Trial raw payload

`puzzleIndex, puzzleId, difficulty, minMoves, moves[], moveCount, excessMoves, firstMovePlanningTimeMs, solved, ruleViolations, interrupted`

### Quality flags

interpretable；insufficientSolvedPuzzles；excessiveRuleViolations；interrupted。

### 单任务报告要求

重点展示 excess moves + perfect solution + planning time；避免把“思考更久”直接解释为更差。


## 23. 矩阵推理（Matrix Reasoning） (`sandia`)

**构念**：非语言推理 / 流体推理  
**实施优先级**：P2 新增  
**Profile 默认值**：体验：8 items，约4 min；正式：16 items，约8–12 min；科研：24 items，按难度分层/可选自适应，约15–20 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracy` | 正确率 | ratio | `higher_is_better` | 核心推理表现。 |
| `difficultyReached` | 稳定达到的最高难度 | level | `higher_is_better` | 若使用分层/自适应题库。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `medianRtMs` | 正确题中位RT | ms | `descriptive` | 解题速度。 |
| `accuracyByDifficulty` | 各难度正确率 | map | `higher_is_better` | 区分 ceiling/floor。 |
| `responseChangeCount` | 改答次数 | count | `descriptive` | 如 UI 允许改答。 |

### Trial raw payload

`itemIndex, stimulusId, stimulusVersion, difficulty, optionOrder[], response, correct, rtMs, interrupted`

### Quality flags

interpretable；insufficientItems；floorEffect；ceilingEffect；stimulusVersionMissing；interrupted。

### 单任务报告要求

无正式常模时仅报告 raw accuracy/难度表现；题库必须 license/version/hash。


## 24. Iowa Gambling Task (`igt`)

**构念**：风险—收益决策 / 反馈学习  
**实施优先级**：P2 新增  
**Profile 默认值**：体验：20 choices，约3 min；正式：60 choices，约7–10 min；科研：100 choices（经典范式长度），约12–18 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `netScore` | 净优势选择分 | count | `higher_is_better` | advantageous choices - disadvantageous choices。 |
| `blockNetScores` | 分块净分 | array | `upward_trend_is_better` | 学习轨迹，比单一终点更重要。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `totalEarnings` | 累计收益 | points | `higher_is_better` | 依具体 payoff table。 |
| `advantageousRate` | 优势牌堆选择率 | ratio | `higher_is_better` | 总体倾向。 |
| `awakeningTurn` | 首次持续转向优势策略的回合 | trial | `lower_is_better` | 算法需版本化，作为辅助。 |

### Trial raw payload

`trialIndex, deck, gain, loss, netDelta, cumulativeEarnings, deckClass, interrupted`

### Quality flags

interpretable；insufficientTrials；noDeckExploration；responsePatternDegenerate；interrupted。

### 单任务报告要求

科研版以 100 trials 和分块学习曲线为核心；体验版不输出稳定决策风格结论。


## 25. Balloon Analogue Risk Task (`bart`)

**构念**：风险承担 / 奖励敏感性  
**实施优先级**：P2 新增  
**Profile 默认值**：体验：8 balloons，约4 min；正式：20 balloons，约8–12 min；科研：30 balloons（常见经典配置），约12–18 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `adjustedAveragePumps` | 未爆气球平均充气次数 | pumps | `higher_risk_taking` | 经典核心指标，方向不是“越高越好”。 |
| `explosionRate` | 爆炸比例 | ratio | `descriptive` | 风险结果。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `totalEarnings` | 总收益 | points | `descriptive` | 受随机爆点参数影响。 |
| `cashoutRate` | 主动收取比例 | ratio | `descriptive` | 行为策略。 |
| `pumpChangeOverTime` | 随气球序号的 pump 趋势 | pumps/balloon | `descriptive` | 学习/策略调整。 |

### Trial raw payload

`balloonIndex, maxExplosionPoint(hidden config), pumps, exploded, cashedOut, earnings, cumulativeEarnings, interrupted`

### Quality flags

interpretable；insufficientCompletedBalloons；degenerateAlwaysCashout；degenerateAlwaysExplode；interrupted。

### 单任务报告要求

不把高 pumps 简单称为“优秀/差”；采用双向描述“更保守—更冒险”。


## 26. 情绪识别 (`emotion`)

**构念**：社会认知 / 情绪识别  
**实施优先级**：P3 资源依赖  
**Profile 默认值**：体验：12 stimuli，约3 min；正式：36 stimuli，约6–8 min；科研：60 stimuli，按类别/人物/性别等平衡，约10–15 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracy` | 总体识别准确率 | ratio | `higher_is_better` | 核心表现。 |
| `balancedAccuracy` | 类别平衡准确率 | ratio | `higher_is_better` | 避免类别数量不均。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracyByEmotion` | 各情绪准确率 | map | `higher_is_better` | 类别差异。 |
| `confusionMatrix` | 混淆矩阵 | matrix | `descriptive` | 错误类型。 |
| `medianRtMs` | 正确识别中位RT | ms | `descriptive` | 速度。 |

### Trial raw payload

`trialIndex, stimulusId, stimulusVersion, expectedEmotion, responseEmotion, correct, rtMs, interrupted`

### Quality flags

interpretable；insufficientPerCategory；stimulusLicenseMissing；stimulusVersionMissing；interrupted。

### 单任务报告要求

必须显示刺激集版本；未做本地年龄/文化验证前不做人格或临床推断。


## 27. Dot Probe (`dotprobe`)

**构念**：注意偏向  
**实施优先级**：P3 资源依赖  
**Profile 默认值**：体验：40 trials，约3 min；正式：120 trials，约7–9 min；科研：240 trials，分 blocks，约12–18 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `biasScoreMs` | 注意偏向分 | ms | `signed` | 通常 incongruent RT - congruent RT；符号解释必须与配置一致。 |
| `medianRtCongruent` | 一致位置中位RT | ms | `descriptive` | 构成 bias。 |
| `medianRtIncongruent` | 不一致位置中位RT | ms | `descriptive` | 构成 bias。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracy` | 探测反应准确率 | ratio | `higher_is_better` | 质量与基本表现。 |
| `biasSplitHalf` | 偏向分 split-half | coefficient | `higher_is_better` | 科研版可计算内部一致性辅助指标。 |

### Trial raw payload

`trialIndex, stimulusPairId, valencePair, probePosition, threatPosition, congruency, response, correct, rtMs, interrupted`

### Quality flags

interpretable；insufficientCongruent；insufficientIncongruent；lowAccuracy；lowReliabilitySignal；assetVersionMissing；interrupted。

### 单任务报告要求

Dot-probe 可靠性问题必须显式提示；单次个体 bias 不做强结论。


## 28. 情绪 Stroop (`emostroop`)

**构念**：情绪干扰 / 注意控制  
**实施优先级**：P3 资源依赖  
**Profile 默认值**：体验：24 trials，约3 min；正式：72 trials，约6–8 min；科研：144 trials，类别平衡并分 blocks，约10–15 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `emotionalStroopEffectMs` | 情绪干扰效应 | ms | `lower_is_better` | 情绪词/刺激条件 RT - 中性条件 RT。 |
| `accuracyDifference` | 情绪条件准确率代价 | ratio | `lower_is_better` | 中性 accuracy - 情绪 accuracy。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `medianRtEmotional` | 情绪条件中位RT | ms | `descriptive` | 构成干扰效应。 |
| `medianRtNeutral` | 中性条件中位RT | ms | `descriptive` | 基线。 |
| `accuracyByValence` | 按 valence 准确率 | map | `higher_is_better` | 正/负性分解。 |

### Trial raw payload

`trialIndex, stimulusId, stimulusVersion, valence, inkColor/responseRule, response, correct, rtMs, interrupted`

### Quality flags

interpretable；insufficientNeutral；insufficientEmotional；lowAccuracy；assetVersionMissing；interrupted。

### 单任务报告要求

说明情绪材料依赖性；不直接等价于焦虑/抑郁临床结论。


## 29. 词汇判断任务（LDT） (`ldt`)

**构念**：词汇加工 / 阅读自动化  
**实施优先级**：P3 语言资源依赖  
**Profile 默认值**：体验：40 trials（20 real/20 pseudo），约3 min；正式：120 trials（60/60），约6–9 min；科研：240 trials（120/120，词频/长度等匹配），约12–16 min。

### 核心指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `dPrime` | 真词/假词辨别 d′ | d-prime | `higher_is_better` | 核心辨别指标。 |
| `lexicalityEffectMs` | 词汇性效应 | ms | `descriptive` | pseudo-word RT - real-word RT。 |

### 次级指标

| Key | 指标 | 单位 | 方向 | 说明 |
|---|---|---:|---|---|
| `accuracyReal` | 真词准确率 | ratio | `higher_is_better` | 词识别。 |
| `accuracyPseudo` | 假词准确率 | ratio | `higher_is_better` | 拒绝错误词。 |
| `medianRtReal` | 真词中位RT | ms | `descriptive` | 加工速度。 |
| `medianRtPseudo` | 假词中位RT | ms | `descriptive` | 构成 lexicality effect。 |

### Trial raw payload

`trialIndex, stimulusId, stimulusVersion, lexicality, wordLength, frequencyBand, response, correct, rtMs, interrupted`

### Quality flags

interpretable；insufficientRealWords；insufficientPseudoWords；lowAccuracy；lexiconVersionMissing；interrupted。

### 单任务报告要求

中文 LDT 必须绑定词库版本、词频来源与年级适配；不可直接照搬英文材料。

# 30. Profile 发布与冻结

建议 `CognitiveAssignment` 增加或显式保存：

```text
profile
```

同时仍以 `configId + configSnapshotEncrypted` 为事实来源。

发布时：

```text
Draft Config
  + selected profile
  ↓
resolve profile patch
  ↓
validate merged config
  ↓
PUBLISHED Assignment
  ↓
start session
  ↓
freeze merged configSnapshot
```

发布后：

- profile 不可修改；
- core trial count / condition ratio / timing 不可修改；
- 如需调整，创建新 Config Version / Assignment。

---

# 31. 数据存储设计

## 31.1 保持现有四层关系

```text
CognitiveTestConfig
        ↓
CognitiveAssignment
        ↓
CognitiveSession
        ↓
CognitiveTrial
```

不引入 cogtest 的 `unit_results/task_results` 替代现有模型。

## 31.2 CognitiveTestConfig

建议 config 中加入：

```json
{
  "profile": "standard",
  "task": {},
  "timing": {},
  "randomization": {},
  "quality": {},
  "report": {
    "referenceMode": "none"
  }
}
```

`profile` 是运行配置的一部分。

建议增加字段或 registry metadata：

```text
metricDefinitionVersion
qualityDefinitionVersion
reportDefinitionVersion
stimulusSetVersion (必要时)
```

如果不增加数据库列，则这些版本必须进入 `configSnapshotEncrypted`，并在 export manifest 中可读取。

## 31.3 CognitiveSession

保留当前加密字段。

建议确保 Session 可追溯：

```text
testType
profile
configVersion
engineVersion
scoringVersion
metricDefinitionVersion
qualityDefinitionVersion
reportDefinitionVersion
randomSeed
stimulusSetVersion?
```

这些字段的核心价值是：

> 同一 `testType` 的不同 Profile、不同 scorer、不同刺激集不能被误认为完全同一种测量条件。

## 31.4 CognitiveTrial

继续 append-only。

建议 raw payload 分为“统一 envelope + task-specific payload”。

逻辑结构：

```ts
interface CognitiveTrialEnvelope {
  trialIndex: number

  blockIndex?: number
  trialType?: string
  condition?: string

  stimulusId?: string
  stimulusVersion?: string

  response?: unknown
  correct?: boolean | null
  rtMs?: number | null

  timeout?: boolean
  premature?: boolean
  omission?: boolean
  interrupted?: boolean

  taskData: Record<string, unknown>
}
```

注意：现有 task schema 不要求立即物理重构为嵌套结构；可以逐任务在 schema 层形成统一命名，避免大 migration。

## 31.5 不存派生“真相”两份

原则：

- raw trial 是行为 source of truth；
- metrics 是 scorer snapshot；
- qualityFlags 是 scorer/quality snapshot；
- report 是 presentation snapshot/派生；
- 不允许前端提交 score/metrics 作为可信最终结果。

---

# 32. 可选 Analytics Projection（本轮可建接口，不强制建表）

为了未来班级/纵向分析，可定义：

```ts
interface CognitiveMetricObservation {
  sessionId: string
  participantKey: string

  testType: string
  profile: CognitiveProfile

  metricKey: string
  numericValue?: number
  textValue?: string

  construct: string
  unit: string
  direction: string

  configVersion: string
  scoringVersion: string
  metricDefinitionVersion: string
}
```

Round 1 可以只实现 projection service，不要求新增数据库表。

---

# 33. 导出设计

当前 summary/full CSV/SAV 能力保留，但需要修正科研导出的组织方式。

## 33.1 Summary Wide

一 Session 一行：

```text
U_id
A_session_id
A_assignment_id
A_test_type
A_profile
A_score
A_config_version
A_engine_version
A_scoring_version
A_metric_definition_version
A_quality_interpretable
M_*
Q_*
A_started_at
A_finished_at
A_duration_s
```

适合：

- 教师；
- SPSS；
- 快速统计；
- 单任务批量比较。

## 33.2 Full Wide

继续兼容：

```text
T001_*
T002_*
...
```

但定位为**兼容导出**，不作为科研主格式。

原因：

- adaptive task trial 数不一致；
- 任务可能有 100–360 trials；
- 每类 taskData 字段不同；
- 容易 column explosion。

## 33.3 Research Long / Tidy（本轮重点新增）

### `sessions.csv`

一 Session 一行。

### `metrics.csv`

一 metric 一行：

```text
session_id
test_type
profile
metric_key
metric_label
construct
value
unit
direction
quality_interpretable
scoring_version
metric_definition_version
```

### `trials.csv`

一 trial 一行：

```text
session_id
participant_id
test_type
profile
trial_index
block_index
trial_type
condition
stimulus_id
response
correct
rt_ms
timeout
premature
omission
interrupted
task_payload_json
```

对 task-specific 字段可选择：

1. 展开为额外列；
2. 保留 `task_payload_json`；
3. 同时做两者。

推荐同任务导出时展开；跨任务 bundle 时保留通用列 + JSON。

---

# 34. Export Package

新增推荐格式：

```text
cognitive_export_<id>.zip
├── manifest.json
├── sessions.csv
├── metrics.csv
├── trials.csv
├── data_dictionary.xlsx
└── README.txt
```

## 34.1 manifest.json

至少包括：

```json
{
  "exportSchemaVersion": "1.0.0",
  "generatedAt": "...",
  "detail": "research",
  "filters": {},
  "taskVersions": [
    {
      "testType": "sst",
      "profile": "research",
      "configVersion": "1.0.0",
      "engineVersion": "1.0.0",
      "scoringVersion": "1.0.0",
      "metricDefinitionVersion": "1.0.0"
    }
  ]
}
```

---

# 35. Data Dictionary

每次 research export 必须生成 Data Dictionary。

字段：

```text
variable
label
source
testType
construct
dataType
unit
direction
role
description
availableProfiles
scoringVersion
metricDefinitionVersion
```

这部分直接吸收 cogtest 的“metric label + dictionary”优势，但升级为正式数据契约。

---

# 36. CSV / SAV / XLSX

## CSV

继续作为通用格式。

要求：

- UTF-8 BOM 可保留；
- spreadsheet formula injection 防护；
- date 统一 ISO 8601；
- null 与 0 明确区分。

## SAV

继续支持 summary 数据。

注意：

- 动态 map/matrix/array metric 不直接强行塞 numeric；
- 对复杂 metric 可拆列或 JSON string；
- variable name <= SAV 限制；
- variable label 使用 registry label。

## XLSX

本轮建议新增，尤其服务教师和研究者。

推荐 sheets：

```text
Summary
Metrics
Trials
Data Dictionary
Methods & Versions
```

---

# 37. Export Resource Limits

保留已有：

```text
EXPORT_MAX_RECORDS
EXPORT_MAX_TRIALS
EXPORT_MAX_FIELDS
EXPORT_MAX_BYTES
EXPORT_RETENTION_HOURS
```

Research long export 仍需 limits。

当数据超过同步阈值时，返回：

```text
413 + 建议缩小范围
```

Round 1 不强制开发 async job，但接口设计要允许 Round 2/3 接入异步导出。

---

# 38. 单任务报告与导出必须使用同一 Metric Registry

禁止出现：

```text
前端显示 medianRt
CSV 叫 avg_speed
SAV 叫 reactionScore
报告解释 another key
```

统一：

```text
Scorer
  ↓ metrics
Metric Registry
  ├── UI
  ├── report
  ├── CSV
  ├── SAV
  ├── XLSX
  └── data dictionary
```

---

# 39. API 建议

保留现有 Session API。

建议增加：

```text
GET /api/cognitive/tests
GET /api/cognitive/tests/:testType
```

返回：

```text
task metadata
profiles
metricDefinitions
qualityDefinitions
reportDefinition
versions
```

教师端 Assignment 创建/编辑返回可选 Profile。

Export：

```text
GET  /api/cognitive/assignments/:id/export/preview?detail=summary|full|research
POST /api/cognitive/assignments/:id/export
```

请求：

```json
{
  "detail": "research",
  "format": "zip",
  "anonymize": true,
  "dateRange": {}
}
```

---

# 40. 前端改造

推荐目录继续沿用现有：

```text
frontend/src/modules/cognitive/
├── registry.ts
├── types.ts
├── api.ts
├── core/
├── pages/
└── tasks/
```

每个新增任务：

```text
tasks/<testType>/
├── <Task>Runner.tsx
├── <Task>Practice.tsx
├── <Task>Stimulus.tsx
├── <Task>.test.tsx
└── helpers.ts
```

不要为每个任务新增独立业务路由。

---

# 41. 后端新增任务模板

每个新任务最少需要：

```text
schemas/<task>.config.ts
schemas/<task>.trial.ts
scoring/<task>.v1.ts
registry entry
seed config
unit tests
integration tests
frontend runner
browser E2E
report renderer metadata
export tests
```

---

# 42. 测试矩阵

每任务至少覆盖：

## Config

- experience/standard/research 都通过 schema；
- 非法 trial count 拒绝；
- ratio 总和正确；
- timing 范围正确。

## Trial

- raw schema；
- index 连续；
- stimulus/condition 约束；
- duplicate replay；
- conflicting duplicate -> 409。

## Scoring

- golden fixture；
- missing trial；
- invalid range；
- extreme hit/false alarm；
- null RT；
- quality flags；
- profile 差异；
- version lock。

## E2E

每个 Profile 至少一条浏览器链路：

```text
start
→ practice
→ trials
→ complete
→ result
→ history
```

Research Profile 的浏览器 E2E 可以使用测试配置缩短真实等待时间，但**不能改变 trial count 校验逻辑**；测试时通过 virtual timer/fast mode。

---

# 43. 性能与安全

必须继续保持：

- 敏感 Cognitive payload 加密；
- participantKey 不暴露真实身份；
- trial append-only；
- completion 行锁；
- assignment/session 对象级权限；
- export 下载二次授权；
- 匿名 recovery token 只存 hash；
- raw trial 不写 application log；
- stimulus license metadata 不含授权密钥。

---

# 44. 迁移策略

本轮优先 additive migration。

不得：

- 删除现有 CognitiveSession 字段；
- 修改历史 ciphertext；
- 重写已完成 Session；
- 修改旧 scorer 使历史结果发生变化。

如 Reaction/Memory/Stroop 需要新指标且旧 raw trial 足够支持：

- 新建 `scoringVersion=1.1.0`；
- 新 Config 使用新 scorer；
- 历史 session 仍使用 v1.0.0；
- 不自动 backfill/re-score，除非单独数据迁移项目明确批准。

---

# 45. 发布顺序建议

```text
R1-A Registry metadata + Profile framework
R1-B Reaction/Memory/Stroop metadata upgrade
R1-C GoNoGo + CPT
R1-D NBack + Corsi
R1-E SST + TaskSwitch
R1-F TOL + Matrix + IGT + BART
R1-G resource-dependent tasks
R1-H research-long export + XLSX/data dictionary
R1-I full regression / production validation
```

P1 Gate 完成即已经形成一套较完整 K12 核心 Cognitive Battery。

---

# 46. 验收标准

Round 1 完成必须同时满足：

1. 所有 P0/P1 任务有三档 Profile；
2. 每任务有 config/trial Zod schema；
3. 每任务服务端评分；
4. 每任务至少 2 个 primary metrics；
5. 每任务 quality gate；
6. 每任务单任务报告；
7. Session 冻结 profile/config/scoring/metric versions；
8. raw trial 完整保存；
9. summary export 正确；
10. research long export 正确；
11. Data Dictionary 与 Metric Registry 一致；
12. CSV/SAV regression 通过；
13. Docker build/run 通过；
14. 原有量表/课程/问卷无 regression；
15. 禁止任何伪 percentile/虚拟常模文案。

---

# 47. 科研 Profile 的方法学说明

“科研版”在本系统中的定义是：

> trial 数、条件平衡、数据字段与方法报告更接近经典科研范式，并能够支持复现与统计分析。

它**不是**：

- 自动获得论文级信效度；
- 自动成为诊断工具；
- 自动等同某个商业/临床量表；
- 自动获得常模。

特别是 SST：Verbruggen et al. 2019 的 consensus guide 建议标准 SST 使用约 25% stop trials，并指出 group-level SSRT 一般至少需要约 50 个 stop trials，即约 200 total trials；因此本设计把 `research` 默认设为 200/50，而 experience/standard 必须显示稳定性限制。

---

# 48. 参考实现与资料

## 当前项目

- `server-version/backend/src/modules/cognitive/cognitive.registry.ts`
- `server-version/backend/src/modules/cognitive/scoring/reaction.v1.ts`
- `server-version/backend/src/modules/cognitive/scoring/memory.v1.ts`
- `server-version/backend/src/modules/cognitive/scoring/stroop.v1.ts`
- `server-version/backend/prisma/schema.prisma`
- `server-version/docs/cognitive-export-spec.md`
- `server-version/docs/composite-assessment-spec.md`

## cogtest

- `psy-assessment-web/src/config/unitRegistry.js`
- `psy-assessment-web/server/config/cognitiveMetricLabels.js`
- `psy-assessment-web/src/config/cognitiveReportMetrics.js`
- `psy-assessment-web/src/utils/scoring.js`
- `psy-assessment-web/server/services/exportService.js`
- `psy-assessment-web/server/services/questionnaireService.js`
- `psy-assessment-web/src/components/cognitive/*TestCore/`

## 方法学

- Verbruggen F, et al. *A consensus guide to capturing the ability to inhibit actions and impulsive behaviors in the stop-signal task*. eLife. 2019;8:e46323. DOI: 10.7554/eLife.46323.
- 其他任务 Profile 数量是本项目用于产品/科研模式切换的默认配置，发布前应由测量学负责人对具体刺激、年龄段和研究用途进行 protocol review；它们不是宣称存在唯一“标准 trial 数”。

---

# 49. 结论

Round 1 的关键不是“把 cogtest 的 17 个页面复制过来”，而是建立：

```text
Task
  + Profile
  + Versioned Config
  + Trial Schema
  + Server Scorer
  + Metric Definitions
  + Quality Definitions
  + Single-task Report
  + Research-grade Export
```

这样新增第 18 个任务时，系统仍然保持同一测量、报告和数据契约。
