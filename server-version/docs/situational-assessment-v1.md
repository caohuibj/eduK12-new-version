# Situational Assessment V1（Text）— 架构决策与 Pilot-first 实施方案

状态：PR-A review-fix（feat/situational-v1-domain，基于 main@e793766）。
本文档记录已锁定的架构决策、运行时落点、Pilot-first 节点/验收计划与未来
Research backlog；Image / Comic / Video（PR-E / PR-F）在此基础上演进。

## 1. 科研成熟度模型：两条正交的轴

```text
Product lifecycle:    DRAFT → PUBLISHED → RETIRED
Scientific maturity:  PILOT → RESEARCH_GRADE
```

两条轴互相独立。第一版正式允许 `PUBLISHED + PILOT + referencePolicy=none +
provisional scoringVersion` 上线——这不是半成品，而是正常产品状态。

Pilot 必须：功能完整、scoring deterministic、scoringVersion 显式、raw evidence
immutable、result reproducible、report complete、interpretation conservative、
version/reanalysis 可行。

Pilot 不要求：正式常模、percentile、年龄常模、option × facet empirical
loading、factor analysis、measurement invariance、formal reliability study、
convergent/discriminant validity、behavioral signature、situational sensitivity
model、Matrix Sampling、Video telemetry。这些属于 RESEARCH_GRADE 升级路径
（见 §7 Research backlog）。

## 2. 已锁定的架构决策

### Decision A — 单一 provisional option contribution
- Raw response 永远只保存"用户回答了什么"：`sceneKey / channelKey /
  responseValue`（choice 存 optionKey，CONTINUOUS 存显式 range 内的数值），
  **不保存分数**。
- provisional 计分映射由 `scoringVersion` 管理；calibration 后可发布新
  scoringVersion，基于 immutable 历史回答重算，response schema 永不变。
- V1 不使用 option × facet 多维 loading matrix；scene 的
  `secondaryConstructs` 仅作科学设计元数据，V1 不自动计分。
- 将来确有经验依据时，通过新 scoringVersion / custom scorer 扩展。

### Decision B — Canonical 输出 Construct × Channel 独立 metrics
- 每个已激活且允许发布的 channel 一个独立 metric key
  （如 `bfi2.assertiveness.behavior`、`bfi2.anxiety.emotion`），进
  `CanonicalUnitResultCoreV1.metrics[]`，由编译期 `allowedMetricKeys` 白名单把关。
- Canonical 层不合并通道，也不输出 raw scene responses（contract test 强制）。
- Norm–Behavior Gap 等派生指标必须由版本化 scoring / analysis definition
  显式生成；报告层只读取与解释，不临时计算科学分数。

### Decision C — Instrument / scientific Module = UNIT
```text
1 Situational Instrument / meaningful Module
= 1 UNIT = 1 slot = N scenes = 1 FINAL submit = 1 CanonicalUnitResult
```
Scene 是 UNIT 内部测量原子；每 Scene 1–3 channels。不采用一 Scene 一 UNIT，
也不采用一 Channel 一 UNIT。

### Decision D — Channel 三概念正交
```text
channelKey   自由字符串 identity：raw response / choiceScores / metrics 均以它为键
purpose      科学含义枚举：BEHAVIOR_TENDENCY | EMOTION | APPROACH_AVOID |
             PREFERENCE | APPRAISAL | NORM_JUDGMENT | CONFIDENCE（仅元数据）
responseType 应答/计分 primitive：SINGLE_CHOICE | CONTINUOUS
```
- 三者互不推断；scorer 按 `responseType` 分派，**永远不按 channelKey 或
  purpose 的名称**（有 orthogonality regression test 强制）。
- CONTINUOUS primitive 显式携带 `range {min,max}` 与
  `scoringDirection: POSITIVE | NEGATIVE`（NEGATIVE = min+max−raw 的确定性
  反向映射）。没有 piecewise / formula / 任意 JS 规则 / IRT / transform graph。
- Runner payload 包含 CONTINUOUS 的 `range`（渲染滑条所需），但剥离
  `purpose / scoringDirection / scoredConstruct / contributions / 科学元数据`。

### Decision E — Runtime capability 不跑在代码前面
`compileSituationRuntime` 的 `runtimeCapabilities` 只声明当前 unified runtime
已支持的能力。PR-A 阶段全部为 false（standalone/embedded/aggregateEligible/
supported；collectionFacts 恒为 false——situational 永远产出 UNIT_RESULT）。
落地对应路径的 PR 翻转对应 flag，绝不提前。

### Decision F — Definition identity 绑定完整定义内容
`compileSituationRuntime` 的 `sourceDefinitionHash = hashSituationDefinition(
definition)`：同 key+version 下任何 scene/channel/scoring 内容变化都必须改变
冻结 identity（contract test 强制）。

## 3. Sampling（Pilot V1 边界）

Pilot V1 固定 `{ strategy: 'ALL' }`：全部声明场景、固定线性呈现。
Matrix Sampling 已从 Pilot V1 契约中移除（原 FIXED_SCENE_SAMPLE 是"schema
宣布支持、scorer 不支持"的半实现）。它进入 Research-scale backlog，将来以
显式 assignment contract 回归：`assignmentVersion + activeSceneKeys +
activeChannelKeys + sampling provenance`。scorer 永不依赖它无法兑现的
sampling 语义。

## 4. 节点路线图（Pilot-first）

```text
PR-A   Domain + Scoring Contract（本 PR）
  ↓
PR-B   Standalone Pilot Runtime
  ↓
PR-C   Text Pilot Product
  ↓
========================================
PUBLISHED + PILOT  Standalone Launch Gate
========================================
  ↓
PR-D   Composite / Bundle Integration
  ↓
========================================
Situational V1 Architecture Complete
========================================
  ↓
PR-E   Image / Comic        PR-F   Video
```

**Pilot Launchable ≠ V1 Architecture Complete**：PR-C 完成即可 standalone
Pilot 上线；PR-D 仍是 V1 architecture-complete 的必要条件。

### PR-B — Standalone Pilot Runtime（范围已收窄）
只做：Situational unit persistence identity（exact frozen
definition/runtime/scoringVersion）→ start → resume → all scenes → 客户端
收集 raw answers → ONE FINAL submit → validate once → score once → canonical
once → encrypt/write once → idempotency → history/result。
不做：Matrix Sampling、Bundle、Reference、norm、research workflow、media、
branching。
性能纪律（沿 O4 / Unified FINAL）：不重新引入 guard read → route read →
finalizer reread；不 per-answer durable write；不 per-scene DB write；不新增
admission semaphore（复用现有 UNIT admission）；one UNIT = one final-submit
boundary。

### PR-C — Text Pilot Product（= Pilot Launch Gate）
覆盖：Text Scene Runner（SINGLE_CHOICE + CONTINUOUS、每 Scene 1–3 channels、
local draft/resume、FINAL submit）、result page、history、export /
reanalysis-compatible evidence、Pilot wording、browser E2E、mobile regression、
Computer Use key journey。
完成即 `PUBLISHED + PILOT` standalone 上线。不等 Bundle / Image / Video /
Matrix Sampling / reference / formal psychometric study。

### PR-D — Composite / Bundle Integration（范围窄，V1 完成条件）
只做四件事：Composite item type 支持 `SITUATIONAL`；freeze 铸一个 situational
slot；terminal `AssessmentUnitSnapshot / CanonicalUnitResult`；Evidence bridge
只消费 canonical metrics。不 reread raw responses、不做 bundle 专用 scorer、
不新增跨工具心理 ontology、不做 composite interpretation engine。

## 5. Reference policy

Pilot V1 保持 `referencePolicy = none`。不为"看起来更完整"制造 simulation
percentile、expert-estimated norm、fake age bands、arbitrary 低/中/高人群
解释。报告可展示 raw / scaled descriptive Construct × Channel 分数，但不得
表述"高于同龄人 73% / 正常范围 / 异常 / 诊断"。

Reference 演进路径（本轮不实现 engine）：
`NONE → LOCAL_PILOT → LOCAL_NORM → VALIDATED_NORM`。

## 6. Report wording

保留"provisional / descriptive / no diagnosis / no norm"原则。报告层可教育性
解释、可给 reflection guidance；不得把单 scene state response 表述为稳定
trait；不得用 provisional score 做常模性标签；不得自行产生科学派生分数。

允许："在本组标准化情境中，你较常选择直接表达不同意见的行为方式。"
避免："你是一个高果断性人格的人。"

## 7. Research backlog（只记录，不实施）

- **R1 Content evidence**：expert review、cognitive interview、construct-scene mapping。
- **R2 Option calibration**：response frequency、monotonicity、rare options、empirical rescoring。
- **R3 Scene functioning**：scene discrimination、difficulty/extremity、context effects。
- **R4 Channel structure**：Behavior / Norm / Emotion / Appraisal 是否真正可分。
- **R5 Reliability / Generalizability**：cross-scene generalizability、test-retest、
  alternate forms、Person × Situation variance。
- **R6 Validity**：BFI-2 / SEL / Taking Charge / observer / educational outcomes。
- **R7 Population evidence**：grade、age、locale、group consistency / invariance。
- **R8 Reference**：LOCAL_PILOT → LOCAL_NORM → VALIDATED_NORM。
- **R9 Research-scale presentation**：Matrix Sampling assignment contract
  （assignmentVersion / activeSceneKeys / activeChannelKeys / provenance）。

## 8. 运行时落点

新模块 `server-version/backend/src/modules/situational/`（镜像 Scale 模块形态）：

| 文件 | 职责 |
| --- | --- |
| `situation-definition.ts` | zod schema（instrument/scene/channel/sampling/scoring/report）、跨字段校验、`hashSituationDefinition`、`runnerSituationDefinition` |
| `situation-scoring.ts` | 纯函数 scorer：raw responses → `SituationalResultV1{metrics, quality}`；responseType 分派；answers ≠ scores |
| `packages/*.ts` | 代码拥有的内容包（definition + goldenCases），provisional key 版本化 |
| `situation-package.registry.ts` | 包注册表 + `validateSituationPackage`（定义校验 + hash 稳定性 + runner 构建 + golden 执行） |

运行时契约扩展：`RuntimeInstrumentType`/`CanonicalUnitResult` unitType 增加
`SITUATIONAL`；`compileSituationRuntime`（publishedMetrics → metricDefinitions
+ `allowedMetricKeys` 白名单；sourceDefinitionHash = 完整定义内容 hash；
staged capabilities）；`projectSituationCanonicalUnitResult`（Construct ×
Channel metrics，canonical 层无 raw responses）。

## 9. 验收基线（PR-A）

- 定义校验 positive/negative；golden scoring fixtures（含跨场景 mean、
  CONTINUOUS POSITIVE/NEGATIVE、双通道独立 metric）；
- 换 scoringVersion 重算同 raw responses 得新分、response schema 不变；
- orthogonality regressions：choice-under-emotion-key、CONFIDENCE+CONTINUOUS、
  duplicate channelKey、inverted range 拒绝；
- canonical：whitelist 拒绝、not_calculable/null 语义、无 raw responses；
- runner payload 不泄露 purpose/scoringDirection/scoredConstruct/contributions；
- compiled `sourceDefinitionHash` 随定义内容变化；staged capabilities 全 false。
