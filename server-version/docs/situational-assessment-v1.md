# Situational Assessment V1（Text）— 架构决策与实施方案

状态：PR-A 实施中（feat/situational-v1-domain）。本文档记录已锁定的架构决策、
运行时落点与节点/验收计划；后续 Image / Comic / Video（PR-E / PR-F）在此基础上演进。

## 1. 已锁定的架构决策（2026-09-06）

### Decision A — 单一 provisional option contribution
- Raw answer 只保存 `sceneKey / channelKey / optionKey`（或 0–100 评分值），**不保存分数**。
  被冻结的参与者证据永远是"选了什么"，不是"得几分"。
- `scoring.scoringVersion` 把 optionKey 映射为单一 provisional contribution
  （trait-expression gradient，如 +1.5 / +0.5 / −0.5 / −1.5）。校准后发布新
  scoringVersion，基于 immutable 历史回答重算，**response schema 永不变**。
- 每个 response channel 明确一个 `scoredConstruct`；scene 的
  `secondaryConstructs` 仅作科学设计元数据，V1 不自动计分。
- 将来确有经验依据支持多维 loading 时，通过新 scoringVersion / custom scorer
  扩展（对齐 Scale 的 `registerScaleCustomScorer` 机制），不预埋 schema。

### Decision B — Construct × Channel 独立 metrics
- 每个已激活且允许发布的 channel 生成独立 metric key
  （如 `bfi2.assertiveness.behavior`、`bfi2.anxiety.emotion`），进
  `CanonicalUnitResultCoreV1.metrics[]`，由编译期
  `aggregateProjection.allowedMetricKeys` 白名单把关。
- Canonical 层不合并通道（would-do / should-do / emotion / appraisal 保持可分），
  也不输出 raw scene response。
- Norm–Behavior Gap、Trait–Skill Gap 等派生指标必须由**版本化 scoring /
  analysis definition** 显式生成；报告层只读取与解释，不临时计算科学分数。

### Decision C — Instrument / Module = UNIT
- 一个 Situational Instrument（或具有独立科学评分/完成语义的 Module）
  = 一个 UNIT = 1 个 slot = 1 次 FINAL submit = 1 个 CanonicalUnitResult。
- Scene 是 UNIT 内部的测量原子，每 Scene 1–3 个 response channels。
- Matrix Sampling 在 UNIT start 时选择并冻结为 **UNIT 内部状态**
  （frozen situational assignment），**不改 FrozenActiveSlotSet**——
  90 场景 → 1 slot，避免冻结 slot 集合随场景数膨胀。
- 不采用一 Scene 一 UNIT，也不采用一 Channel 一 UNIT。
  （对齐现状：Scale slot = 整份量表；Cognitive slot = 整个 task、
  一次 FINAL submit 携带全部 trials。）

### Decision D — Bundle 集成是 V1 完成条件
- PR 序列：PR-A Domain+Scoring → PR-B Runtime+Submit → PR-C UI+Report →
  PR-D Composite/Bundle（V1 completion gate）→ 之后才是 PR-E Image/Comic、
  PR-F Video。
- PR-D 只做四件事：Composite 可选 `SITUATIONAL` item type；composite freeze
  铸 situational slot（一个 instrument 一个 slot）；FINAL submit →
  CanonicalUnitResult / AssessmentUnitSnapshot；Evidence bridge 只消费
  canonical aggregate-safe metrics，不读 raw scene responses。

## 2. 运行时落点

新模块 `server-version/backend/src/modules/situational/`（镜像 Scale 模块形态）：

| 文件 | 职责 |
| --- | --- |
| `situation-definition.ts` | zod schema（instrument / scene / channel / sampling / scoring / report）、跨字段校验、`hashSituationDefinition`、`runnerSituationDefinition`（客户端投递切片，剥离构念与计分元数据） |
| `situation-scoring.ts` | 纯函数 scorer：raw responses → `SituationalResultV1{metrics, quality}`；answers ≠ scores；`validateSituationalResponse`、`missingRequiredSituationalResponseKeys` |
| `packages/*.ts` | 代码拥有的内容包（definition + goldenCases），provisional key 版本化 |
| `situation-package.registry.ts` | 包注册表 + `validateSituationPackage`（定义校验 + hash 稳定性 + runner 构建 + golden cases 执行，发布 gate） |

运行时契约扩展：
- `assessment-runtime/types.ts`：`RuntimeInstrumentType` 增加 `'SITUATIONAL'`。
- `assessment-runtime/compiler.ts`：`compileSituationRuntime`——publishedMetrics →
  metricDefinitions + `aggregateProjection.allowedMetricKeys`；
  `scorerKey='situational.default'`、`scorerVersion=scoring.scoringVersion`；
  `referenceBindingDefinition={required:false}`（V1 referencePolicy=none）。
- `assessment-runtime/unit-result.ts`：`projectSituationCanonicalUnitResult`；
  core/envelope 的 unitType 联合与 zod 增加 `'SITUATIONAL'`。

后续节点（PR-B 及以后）：
- Prisma `AssessmentUnitType` / `CompositeAssessmentItemType` 增加 `SITUATIONAL`（migration）。
- `slot-set.ts` / `attempt-runtime.ts`：`situationalSlot()`（slotKey `situational:<id>`）。
- 提交链镜像 Scale：`situation-admission.service.ts`（activateSituationAdmission +
  assertAdmissionParentBinding）→ `withUnitSubmitAdmission`（共享
  UNIT_SUBMIT_ADMISSION_LIMIT=7 / QUEUE=16 / TIMEOUT=500ms 闸门）→ raw answers
  加密持久化（镜像 CognitiveRawSubmission）→ 纯内存计分 → canonical projection →
  `AssessmentUnitSnapshot` create-only → `finalizeParentAfterUnitSubmit`。
- Start 时按 sampling 配置计算并冻结 `frozenSituationalAssignmentEncrypted(+hash)`，
  resume/submit 校验，fail-closed 抛 STALE_ATTEMPT/DEFINITION_MISMATCH(409)；
  infrastructure 错误 next(err) 走 5xx。遵守 O4 读纪律，不重新引入重复 parent read。
- 架构边界：`v32-1.architecture.test.ts` 增加 SITUATIONAL 段（不得引用 legacy
  coordination / frozen slot 内部；必须匹配 admission 激活与 parent binding 断言）。

## 3. 节点与验收（摘要）

| 节点 | 范围 | 验收 |
| --- | --- | --- |
| PR-A | 定义/计分契约 + 3 个黄金包 + compiler/projection + 文档 | 定义校验正/负测试；golden scoring fixtures；换 scoringVersion 重算回归（response schema 不变）；tsc 干净；全量 vitest 零回归 |
| PR-B | Prisma 枚举 + slot/assignment + admission + FINAL submit + 路由 + 观测 + 架构测试 | CI 4 项；定向 postgres 集成（快照 create-only、exactly-once、/complete 含 SITUATIONAL）；并发分类（COMPLETION_BUSY ≠ retry-serialization）；冻结 assignment 409；全量回归。**review STOP gate** |
| PR-C | Standalone Text UI + Report（student/public 两路径） | frontend CI；浏览器真实路径回归；Computer Use 关键 journey；断点续答恢复 frozen assignment |
| PR-D | Composite/Bundle 集成（Decision D 四件事） | 混合 slot freeze/submit/aggregate 集成测试；bridge 只达 canonical metrics；report projector 快照；CI 4 项 + 全量回归 |
| 收口 | correctness closure + 文档 | 不做 anchor reset / k6 curve / capacity 校准（冻结中）；PR-B/D 标 performance-sensitive，仅数量级 smoke sanity（separately verified） |

## 4. V1 边界（不做）

Branching / Sequential Decision；Image/Comic/Video stimulus（schema 仅预留
`stimulus.type`）；开放式生成题自动计分；answer-driven 自适应；批量题库生产
（内容走 content lane 并行）；问卷内嵌 situational（QuestionnaireScale 式第三宿主，
如需作为 V1.x 追加节点）；不碰 #53/#54/#55 冻结内容。

## 5. 性能敏感标注（供 PR-B / PR-D 描述引用）

- submission payload 大小：N scenes × channels 的 raw responses（量级：数十 KB / UNIT）。
- snapshot 持久化：1 条 `AssessmentUnitSnapshot`（UNIT_RESULT，canonicalResultEncrypted）。
- aggregate finalization：新增一种 unitType 的 canonical metrics 投影（构造 × channel keys）。
- admission：与 SCALE/COGNITIVE 共享 UNIT_SUBMIT_ADMISSION_* 闸门，不新增闸门参数。
