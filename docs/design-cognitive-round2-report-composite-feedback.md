
# Huisurvey Cognitive Round 2 开发设计
## 单任务报告升级、多认知任务画像、认知 + 心理量表综合反馈

**版本**：v1.0  
**目标项目**：`caohuibj/eduK12-new-version`  
**参考项目**：`caohuibj/cogtest` 的 Aggregate Report / cognitive report 设计  
**前置条件**：Round 1 的 Profile、Metric Registry、Quality Registry、raw trial 与单任务报告已稳定。

---

# 1. Round 2 的核心目标

Round 2 不再以“新增任务数量”为主，而是建立可靠的报告与证据整合层：

```text
Raw Trials
   ↓
Task Metrics
   ↓
Quality Gate
   ↓
Single Task Report
   ↓
Cognitive Domain Evidence
   ↓
Scale Evidence
   ↓
Cross-source Integration
   ↓
Composite Feedback
```

核心输出：

1. 单个认知任务的正式报告系统；
2. 多个认知任务形成“认知功能画像”；
3. 心理量表 + 认知行为任务的证据一致性/差异性分析；
4. 教师/研究者综合报告；
5. 学生/参与者可理解但不过度解释的报告；
6. 版本化的 Composite Analysis Snapshot。

---

# 2. 对 cogtest 的借鉴与限制

`cogtest` 已经有一个很重要的结构：

```text
unitReports
overallScore
overallLevel
dimensions
feedback
recommendations
```

并且能够把 Scale、Form、Cognitive 放入同一 aggregate report。

这部分**架构思想值得借鉴**：

- unit report；
- feedback；
- recommendation；
- aggregate report；
- result UI；
- registry-driven metric labels。

但 Round 2 明确不照搬以下做法：

1. 不用简单 `score × weight` 形成跨任务总分；
2. 不把不同测量方向的 0–100 product score 平均；
3. 不用虚拟常模产生 percentile；
4. 不把量表高分、Reaction 高分、Stroop 高分直接认为同尺度；
5. 不在没有实证模型时创造“综合认知指数”；
6. 不因主观量表与客观任务一致就作因果/诊断结论。

---

# 3. 报告系统的五层模型

## Level 0 — Provenance

任何报告首先必须知道结果来自什么：

```text
testType
profile
configVersion
engineVersion
scoringVersion
metricDefinitionVersion
qualityDefinitionVersion
reportDefinitionVersion
stimulusSetVersion
normVersion?
analysisVersion?
```

没有 provenance 的历史报告不可接受。

## Level 1 — Data Quality

先回答：

> 这次数据能不能解释？

统一输出：

```text
interpretable
quality flags
valid trial counts
interruption
completion
response-pattern anomalies
```

## Level 2 — Task Metrics

例如：

```text
Reaction:
medianRtMs
rtICV
missRate

CPT:
dPrime
omissionRate
commissionRate
rtICV

Stroop:
stroopEffectMs
incongruentAccuracy

SST:
ssrtMs
pRespondStop
```

## Level 3 — Cognitive Domain Evidence

把 metric 映射到构念，但不是简单平均。

## Level 4 — Cross-source Integrated Feedback

把：

```text
Cognitive behavioral evidence
+
Psychological scale self-report evidence
+
Form/context evidence
```

进行 evidence-based integration。

---

# 4. Domain Definitions

建议第一版 Domain：

```text
processing_speed
sustained_attention
response_inhibition
interference_control
working_memory
visuospatial_memory
cognitive_flexibility
planning
fluid_reasoning
decision_making
risk_taking
social_emotion_processing
language_processing
```

示例：

```ts
interface CognitiveDomainDefinition {
  key: string
  label: string
  description: string
  evidenceRules: DomainEvidenceRule[]
  minimumEvidence: {
    primaryMetricCount: number
    independentTaskCount: number
  }
}
```

---

# 5. Metric → Domain 映射

不是所有任务只有一个 Domain。

例如：

## Reaction

```text
medianRtMs → processing_speed
rtICV      → sustained_attention / response_stability
missRate   → sustained_attention
```

## CPT

```text
dPrime          → sustained_attention
omissionRate    → sustained_attention
commissionRate  → response_inhibition
rtICV           → sustained_attention
```

## Stroop

```text
stroopEffectMs       → interference_control
incongruentAccuracy  → interference_control
```

## Go/No-Go

```text
commissionRate → response_inhibition
dPrime         → response_inhibition / sustained_attention
```

## SST

```text
ssrtMs → response_inhibition
```

因此：

> Domain 是对“证据”的组织，不是给 task 强行贴唯一标签。

---

# 6. Evidence Model

建议增加统一结构：

```ts
interface EvidenceItem {
  sourceType: 'cognitive_metric' | 'scale_dimension' | 'form'
  sourceId: string

  construct: string
  metricKey?: string

  value: number | string | null
  unit?: string

  direction?: string

  quality: {
    interpretable: boolean
    flags: string[]
  }

  interpretationClass:
    | 'descriptive'
    | 'criterion'
    | 'normative'
    | 'self_report'

  strength:
    | 'supporting'
    | 'weak'
    | 'not_interpretable'

  provenance: Record<string, string>
}
```

Round 2 的 Domain 分析只消费 `EvidenceItem[]`。

---

# 7. 不使用跨任务简单平均

禁止：

```text
Reaction score = 80
Stroop score = 70
CPT score = 60

Attention = (80 + 70 + 60) / 3
```

原因：

- score 可能是 product index；
- metric 方向不同；
- reliability 不同；
- profile 不同；
- task 对 construct 的测量关系不同；
- 部分任务同时混合速度和准确率。

第一版 Domain 输出应优先采用：

```text
evidence count
evidence directions
consistency
quality
```

而不是强制一个 0–100 数值。

---

# 8. Domain Result v1

建议：

```ts
interface CognitiveDomainResult {
  domain: string
  label: string

  status:
    | 'not_measured'
    | 'insufficient_evidence'
    | 'descriptive_only'
    | 'interpretable'

  evidence: EvidenceItem[]

  consistency:
    | 'not_applicable'
    | 'consistent'
    | 'mixed'
    | 'divergent'

  summary: string
  strengths: string[]
  watchItems: string[]
  caveats: string[]
}
```

第一版不需要：

```text
domainScore = 73
```

未来只有在 norm/model 经验证后再加入。

---

# 9. 单任务报告 v2

Round 1 报告升级为配置驱动。

建议 `reportDefinition`：

```ts
interface SingleTaskReportDefinition {
  title: string

  headlineMetrics: string[]
  metricGroups: Array<{
    key: string
    label: string
    metrics: string[]
  }>

  qualityMessages: Record<string, string>

  interpretationRules: InterpretationRule[]

  profileCaveats: Record<CognitiveProfile, string[]>

  methodology: {
    construct: string[]
    methodSummary: string
  }
}
```

---

# 10. 单任务报告 UI

推荐：

```text
┌─────────────────────────────┐
│ CPT 持续注意任务            │
│ 正式版 · 数据可解释         │
└─────────────────────────────┘

核心指标
d'                 1.82
遗漏率             7.1%
误报率             4.8%
RT 变异系数        0.21

表现结构
[准确性] [稳定性] [随时间变化]

数据质量
✓ 有效目标数充足
✓ 未发现明显抢答
! 发生 1 次页面切出

解释
- 本次任务中目标/非目标辨别……
- 反应稳定性……
- 本结果反映本次结构化任务表现……

方法与版本
profile=standard
scoring=1.0.0
...
```

不把“解释”写成疾病结论。

---

# 11. Profile 必须进入报告语义

同一任务三个 Profile 不应展示同样强度的解释。

## Experience

```text
体验版
数据仅用于了解任务形式；
试次数不足以支持稳定的个体差异解释。
```

## Standard

```text
正式版
适合常规教育测评场景；
结果应结合其他信息解释。
```

## Research

```text
科研版
采用更高试次数和更完整条件平衡；
仍需依据研究设计、样本与统计计划解释。
```

---

# 12. 心理量表接入方式

当前心理量表已有：

```text
Scale
Dimension
Assessment
Scores
Feedback
```

Round 2 不重写量表评分。

把已完成 scale dimension 转换成 EvidenceItem：

```text
sourceType = scale_dimension
construct = mapped construct
interpretationClass = self_report
```

需要新增一个 **Scale Construct Mapping**。

示例：

```ts
interface ScaleConstructMapping {
  scaleCode: string
  dimensionCode: string

  construct: string

  direction:
    | 'higher_more_difficulty'
    | 'higher_more_strength'
    | 'descriptive'

  evidenceRole: 'primary' | 'supporting'

  reportLabel: string
}
```

---

# 13. 主观报告与行为任务必须区分

报告 UI/文案明确区分：

```text
自评/问卷证据
行为任务证据
```

不能把二者混成一个来源。

示例：

```text
持续注意

行为任务
CPT omission：偏高
CPT RT variability：偏高

自评信息
注意困难维度：较高

综合反馈
两类信息在“持续注意困难”方向上呈一致证据。
```

---

# 14. Convergence / Divergence Engine

这是 Round 2 最重要的功能之一。

## 14.1 一致

```text
self-report difficulty ↑
behavioral difficulty ↑
```

输出：

> 主观报告与本次结构化任务表现方向一致。

## 14.2 不一致

```text
self-report difficulty ↑
behavioral task within expected/criterion range
```

输出：

> 主观感受较明显，但本次结构化任务未出现同方向表现。两类信息反映的情境不同，建议结合课堂/日常表现进一步观察。

## 14.3 只有一类证据

输出：

> 当前只有行为任务证据，尚无对应自评信息。

## 14.4 数据质量不足

输出：

> 本次行为任务数据质量不足，不参与跨来源一致性判断。

---

# 15. 第一版不要自动说“正常/异常”

在没有正式 norm 时，认知任务可使用：

```text
较快 / 较慢
更稳定 / 波动较大
较少遗漏 / 较多遗漏
干扰效应较小 / 较大
```

但这些词必须基于：

1. 明确 criterion；
2. 或 validated reference；
3. 或仅描述同一任务内部条件差异。

如果没有以上基础，则使用：

```text
本次 median RT = 420ms
本次 omission = 8%
```

而不是自动“正常”。

---

# 16. Reference / Norm 分层

建议：

```text
referenceMode:
none
criterion
simulated
literature
local_norm
validated_norm
```

生产报告策略：

- `none`：只描述 raw metric；
- `criterion`：仅做预设质量/操作阈值；
- `simulated`：只允许开发/测试，不对终端用户称常模；
- `literature`：说明参考来源，不能冒充本地常模；
- `local_norm`：明确样本与版本；
- `validated_norm`：以后正式常模。

---

# 17. 报告中的等级系统

不建议统一：

```text
high / medium / low
```

应该改为带语义的：

```ts
type InterpretationBand = {
  key: string
  label: string
  meaning: string
  basis: 'criterion' | 'literature' | 'local_norm' | 'validated_norm'
}
```

不同 metric 可以有不同 band。

BART 等没有“高就是好”的任务可以使用：

```text
more_conservative
balanced_range
more_risk_taking
```

---

# 18. Composite Report v1

建议新的返回结构：

```ts
interface CompositeReportV1 {
  attemptId: string
  assessmentId: string
  name: string

  generatedAt: string

  analysisVersion: string
  reportSchemaVersion: string

  qualitySummary: {
    interpretableModules: number
    excludedModules: string[]
    warnings: string[]
  }

  modules: Array<
    CognitiveSingleTaskReport |
    ScaleReport |
    FormReport
  >

  cognitiveDomains: CognitiveDomainResult[]

  crossSourceFindings: CrossSourceFinding[]

  recommendations: Recommendation[]

  limitations: string[]

  provenance: ReportProvenance
}
```

---

# 19. CrossSourceFinding

```ts
interface CrossSourceFinding {
  construct: string

  type:
    | 'convergence'
    | 'divergence'
    | 'single_source'
    | 'insufficient_quality'

  evidenceRefs: string[]

  summary: string
  caveat?: string

  confidence:
    | 'descriptive'
    | 'moderate'
}
```

第一版不要输出 `high confidence clinical inference`。

---

# 20. Recommendation Engine

建议使用 versioned rule engine，不直接由 LLM 生成最终正式报告。

```ts
interface RecommendationRule {
  id: string
  version: string

  construct: string

  when: {
    evidencePattern: string
    qualityRequired: boolean
  }

  audience: 'student' | 'teacher' | 'researcher'

  text: string
  priority: 'info' | 'watch' | 'follow_up'
}
```

LLM 如以后加入，只能用于：

- 文案润色；
- 把结构化结论转成易读语言；

不能绕过规则引擎直接根据 raw data 做诊断。

---

# 21. 推荐文案层级

## Student / Participant

重点：

- 简洁；
- 非诊断；
- 可行动；
- 避免标签。

## Teacher

增加：

- 证据来源；
- 课堂观察建议；
- 质量限制；
- 不把测评直接转化为教育处分。

## Researcher/Admin

增加：

- raw metrics；
- profile/version；
- quality flags；
- reference basis；
- evidence mapping；
- export links。

---

# 22. Composite Analysis Snapshot

Round 2 建议正式新增：

```text
CompositeAnalysisSnapshot
```

字段建议：

```text
id
attemptId
analysisVersion
reportSchemaVersion
domainDefinitionVersion
recommendationRuleVersion
normVersion?

inputFingerprint
analysisPayloadEncrypted
generatedAt
createdAt
```

`inputFingerprint` 基于：

```text
module result IDs
scoring versions
metric definition versions
scale result versions
```

生成。

用途：

> 历史综合报告不会因为代码升级而静默改变。

---

# 23. 为什么要保存 Snapshot

如果不保存：

```text
2026 年完成测评
2027 年修改 report rules
重新打开旧报告
→ 结论变了
```

这是不可接受的。

正确：

```text
assessment completed
→ analysis v1.0
→ snapshot
→ historical report reads snapshot
```

如管理员明确“重新分析”：

```text
analysis v2.0
→ new snapshot
```

两个版本都可追踪。

---

# 24. Domain Definition Version

建议：

```text
domainDefinitionVersion = 1.0.0
```

因为未来：

```text
CPT commissionRate
```

究竟主要属于：

```text
sustained_attention
response_inhibition
```

可能随研究设计调整。

Mapping 变化不应悄悄重写历史分析。

---

# 25. Quality Gate Pipeline

统一：

```text
Module Result
   ↓
Quality Flags
   ↓
interpretable?
   ├─ no → report module but exclude from domain integration
   └─ yes
        ↓
Metric Evidence
        ↓
Domain Evidence
```

报告必须清楚显示：

> 某任务已完成但因数据质量不足未进入综合反馈。

---

# 26. Cross-task Evidence Rule

对于一个 Domain，v1 建议最低要求：

```text
1 independent task
+
至少 1 primary metric interpretable
```

如果要使用“多任务一致”：

```text
>= 2 independent tasks
```

例如：

```text
response_inhibition

Stroop effect
GoNoGo commission
SST SSRT
```

三者都指向不同抑制机制，不能简单取平均，但可以判断 evidence pattern。

---

# 27. Domain Summary 文案生成

建议模板化：

```text
Evidence strong/consistent:
“在多个任务中观察到方向一致的表现模式。”

Evidence mixed:
“不同任务反映的表现并不完全一致，这可能与任务所要求的具体认知过程不同。”

Only one task:
“当前该领域只有一项行为任务证据，结论应保持有限。”

Poor quality:
“当前可用数据不足，暂不进行该领域综合解释。”
```

---

# 28. 认知 + 量表例子：注意

Composite：

```text
注意困难自评量表
CPT
Reaction
Go/No-Go
```

证据：

```text
Scale attention difficulty ↑
CPT omission ↑
CPT rtICV ↑
Reaction miss ↑
GoNoGo commission normal
```

输出：

```text
持续注意：
自评和 CPT/Reaction 在注意持续与反应稳定性方面方向一致。

反应抑制：
Go/No-Go 未显示同方向变化。

综合：
当前证据更集中于持续注意/稳定性，而不是广泛的反应抑制困难。
```

这比“注意力综合得分 43”更符合当前证据水平。

---

# 29. 认知 + 量表例子：焦虑/情绪

Composite：

```text
焦虑自评
Emotional Stroop
Dot Probe
Emotion Recognition
```

必须避免：

```text
“你有焦虑症”
```

允许：

```text
“自评中焦虑相关体验较明显；本次情绪注意任务是否出现同方向偏向，需要结合任务质量和对应指标判断。”
```

Dot Probe 如果 `lowReliabilitySignal=true`：

> 不进入强一致性判断。

---

# 30. 表单/背景信息

Form 可以作为 context：

```text
年级
睡眠时间
测试设备
近期重大事件
```

但 v1 不自动作为因果变量。

只在报告中作为：

```text
context
```

研究者导出可用于后续统计。

---

# 31. Teacher Dashboard（Round 2 可做）

单次报告之外，教师页可以显示：

```text
Completed modules
Data quality
Domain coverage
Cross-source findings
```

但 Round 2 不必立即提供：

- 班级百分位；
- 同班排名；
- 学校排名。

避免在无 norm 前以群体相对排名冒充能力常模。

---

# 32. 可视化建议

## 单任务

推荐：

- metric cards；
- 条件对比条形图；
- RT distribution；
- block trend；
- accuracy/RT tradeoff。

## 多任务 Domain

推荐：

```text
Domain coverage matrix
```

而不是第一版就做雷达图 0–100。

示意：

| Domain | Evidence | Quality | Consistency |
|---|---:|---|---|
| 持续注意 | CPT + Reaction | 可解释 | 一致 |
| 反应抑制 | GoNoGo + SST | 1项质量不足 | 证据不足 |
| 工作记忆 | NBack + Memory | 可解释 | 混合 |

---

# 33. 为什么暂不推荐雷达图

没有统一标准化尺度时，雷达图会暗示：

```text
processing_speed=72
attention=51
memory=85
```

这些数字没有共同量尺。

等正式 norm/measurement model 后再引入。

---

# 34. 报告 API

建议：

```text
GET /api/cognitive/sessions/:id/report
```

返回单任务 report snapshot。

Composite：

```text
GET /api/composite-assessments/attempts/:attemptId/report
```

Round 2 升级返回 `CompositeReportV1`。

管理员：

```text
POST /api/composite-assessments/attempts/:attemptId/reanalyze
```

仅 ADMIN/明确权限可触发新 analysisVersion。

---

# 35. Report Generation Service

建议新增：

```text
backend/src/modules/reporting/
├── reporting.types.ts
├── metric-evidence.ts
├── domain.registry.ts
├── domain-analysis.service.ts
├── scale-mapping.registry.ts
├── cross-source.service.ts
├── recommendation.registry.ts
├── report-render.service.ts
└── snapshot.service.ts
```

Cognitive scorer 仍放原 Cognitive Domain。

不要把分析规则塞回 task scorer。

---

# 36. 依赖方向

正确：

```text
Cognitive Scoring
      ↓
Metrics
      ↓
Reporting / Analysis
```

禁止：

```text
Reporting
  ↓
修改 scorer
```

评分层和解释层必须分离。

---

# 37. 前端目录

建议：

```text
frontend/src/modules/reporting/
├── components/
│   ├── QualityBanner.tsx
│   ├── MetricCard.tsx
│   ├── EvidenceList.tsx
│   ├── DomainSection.tsx
│   ├── CrossSourceFinding.tsx
│   └── ProvenancePanel.tsx
├── pages/
│   ├── CognitiveTaskReport.tsx
│   └── CompositeReport.tsx
└── types.ts
```

避免每个 cognitive task 单独手写完全不同的结果页。

---

# 38. 结构化报告与自然语言报告分离

数据库 snapshot 保存结构化结果：

```json
{
  "domains": [],
  "findings": [],
  "recommendations": []
}
```

UI 文案由：

```text
report definition + localization
```

渲染。

这样可以：

- 中文/英文切换；
- 更新措辞但不改变分析事实；
- 审计分析规则。

---

# 39. 版本策略

至少：

```text
reportSchemaVersion
analysisVersion
domainDefinitionVersion
scaleMappingVersion
recommendationRuleVersion
normVersion
```

不要只保存一个模糊的：

```text
reportVersion
```

---

# 40. 安全与敏感信息

综合报告可能比 raw task 更敏感。

要求：

- snapshot 加密；
- 教师只访问自己有权限的学生/任务；
- public anonymous report 仍需要 recovery credential；
- 不在 URL 放 recovery token；
- export 可按角色强制 anonymize；
- 不记录详细心理反馈到 application logs。

---

# 41. Validation / Expert Review

任何正式的：

```text
interpretation rule
domain mapping
scale mapping
recommendation
```

进入 `PUBLISHED` 前，需要至少：

```text
developer review
measurement/psychology review
content review
test fixture
versioned approval
```

建议规则也有：

```text
DRAFT
PUBLISHED
RETIRED
```

---

# 42. 自动测试

## Domain

- bad quality 不进入；
- 一个 task 不冒充多 task 一致；
- 多 task consistent；
- mixed；
- divergent。

## Scale integration

- higher_more_difficulty；
- higher_more_strength；
- missing dimension；
- reverse interpretation。

## Snapshot

- same input + same versions deterministic；
- analysisVersion 变化产生新 snapshot；
- 旧 snapshot 不被覆盖。

## UI

- experience caveat；
- non-interpretable quality banner；
- no fake percentile；
- provenance 可见；
- anonymous access。

---

# 43. Round 2 发布阶段

```text
R2-A Single-task Report Registry
R2-B Domain Registry + Cognitive Evidence
R2-C Composite Cognitive Domain Report
R2-D Scale Construct Mapping
R2-E Convergence/Divergence
R2-F Recommendation Rules
R2-G Analysis Snapshot
R2-H Teacher/Participant UI
R2-I Validation + regression
```

---

# 44. Round 2 验收标准

必须满足：

1. 每个任务 report 由 `reportDefinition` 渲染；
2. Profile caveat 正确；
3. quality gate 生效；
4. 至少 6 个核心 Cognitive Domain 可聚合证据；
5. 不出现简单跨任务平均分；
6. 心理量表与行为任务明确分源；
7. convergence/divergence 有自动测试；
8. 无 norm 时不出现 percentile；
9. Composite Report 有 analysisVersion；
10. Snapshot 不覆盖历史版本；
11. recommendation 可追踪 rule ID/version；
12. public/teacher/student 权限正确；
13. export 能带 analysis provenance；
14. 原有单任务 result/history 不回归。

---

# 45. 后续 Round 3 才考虑

- 正式本地常模；
- 年龄/年级分层；
- longitudinal reliable change；
- domain standardized score；
- validated composite index；
- group statistics；
- school/classroom dashboard；
- psychometric calibration；
- IRT/latent variable model；
- machine-learning prediction（如确有科学依据）。

---

# 46. 参考项目文件

## eduK12-new-version

- `server-version/backend/src/modules/cognitive/cognitive.registry.ts`
- `server-version/backend/prisma/schema.prisma`
- `server-version/docs/composite-assessment-spec.md`
- `server-version/docs/cognitive-export-spec.md`

## cogtest

- `psy-assessment-web/server/services/questionnaireService.js`
  - `generateAggregateReport()`
- `psy-assessment-web/src/components/ScenarioAggregateReport/`
- `psy-assessment-web/src/config/cognitiveReportMetrics.js`
- `psy-assessment-web/server/config/cognitiveMetricLabels.js`
- `psy-assessment-web/server/services/exportService.js`

借鉴的是：

```text
unitReports
feedback
recommendations
report registry
metric labels
```

不照搬：

```text
virtual norm
generic high/medium/low
weighted overallScore
```

---

# 47. 最终架构

```text
                   Composite Assessment
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       Scales          Cognitive          Forms
          │                │                │
          ▼                ▼                ▼
    Scale Evidence    Metric Evidence      Context
          │                │
          └──────────┬─────┘
                     ▼
                 Quality Gate
                     ▼
               Domain Evidence
                     ▼
          Convergence / Divergence
                     ▼
             Recommendation Rules
                     ▼
             Versioned Snapshot
                     ▼
         Participant / Teacher Report
```

---

# 48. 核心原则

Round 2 最重要的产品判断是：

> **综合报告应先整合证据，再谈总分。**

在当前没有正式统一常模、没有验证过跨任务 latent model 的情况下，Huisurvey 更适合输出：

```text
“哪些能力领域被测量”
“证据来自哪些任务”
“这些证据是否可解释”
“不同证据是否一致”
“主观与客观信息是否一致”
“有哪些合理的观察与行动建议”
```

而不是输出一个看似精确、实际上缺少测量学基础的“综合认知 72 分”。


> **本仓库状态：Round 2 未开工。** Round 1 完成后才能开始本文件中的报告整合与 Composite Snapshot。
