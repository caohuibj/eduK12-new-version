# `feat/mental-health-bundle-v1` inventory

冻结 commit：`bba5cdf chore: freeze mental health bundle v1 reference`（2026-08-30）。  
基底：`85108c4`（PR #30）。其后 `main` 有 56 个 commit，含 V32-1–V32-4。  
远端无此分支。禁止整分支 cherry-pick。

重叠且会与当前 main 冲突的路径：

- `server-version/backend/prisma/schema.prisma`
- `server-version/backend/src/modules/cognitive-analysis/{cognitive-analysis.types,index,protocol-freeze,report-package-freeze,report-package.catalog.service,report-package.registry}.ts`
- `server-version/backend/src/modules/composite/{composite.service,composite-analysis-snapshot.service,composite-analysis-export.service,composite-report.projector,composite-report.types}.ts`

冻结分支独有、main 上不存在：

- `server-version/backend/src/modules/mental-health-bundle/*`
- `server-version/backend/src/modules/cognitive-analysis/package-analysis.dispatcher.ts`
- `server-version/backend/prisma/migrations/20260830110000_add_mental_health_bundle_contract/`
- 对应 engine/integration 测试

## 冻结原型实际做了什么

四份 **DRAFT** 定义，全部是 Scale-only，引擎 key 为 `mental-health-rule-v1`：

| key | 类别 | 量表 |
|---|---|---|
| `youth_anxiety_comprehensive_v1` | youth self | SCARED-41 Child + RCADS-25 Youth + WHO-5 |
| `parent_anxiety_observer_v1` | parent observer | SCARED parent + RCADS caregiver |
| `teacher_broad_mental_health_v1` | teacher | 教师版宽泛心理健康观察 |
| `adult_depression_context_v1` | adult self | 成人抑郁上下文 |

行为要点：

- `package-analysis.dispatcher.ts` 按 `analysisEngineKey` 在 `cognitive-v1` 与 `mental-health-rule-v1` 之间二选一（仍是 package-key/engine 特判，不是通用 registry）。
- CORE 规则枚举分类组合，产出 `STRONG_CONVERGENCE` / `CONCERN_WITH_LOW_WELLBEING` / `SAFETY_ESCALATED`。
- Schema 增量：`AssessmentEpisode`；Attempt 上 `subject*` / `respondent*` / `assessmentEpisodeId`；Composite 上 `analysisEngineKey`。
- 发布门是结构体，四份定义均 `exactFormsVerified/rightsVerified=false`，`disabledReason` 写明未过 gate。
- 仓库不内置第三方题目。

这与 v1.0 计划的首发清单（Go/No-Go+SST、WHO-5 单独描述包、SDQ/TEXI 四个 observer、Go/No-Go+ADEXI 18+）不是同一组产品。

## 分类

### REUSE（概念与测试意图，不搬文件）

- 精确 `key@version` 定义，重复 key 在校验时失败。
- 一个 Scale 施测一次，多个 `scoreKey` mapping 指向同一 slot。
- mapping 带 `role`（PRIMARY / SUPPORTING / FACET / CONTEXT / SAFETY）和 namespaced construct。
- 引擎只读已计分的 Scale 结果，不重读原始作答、不重新计分。
- 未命中 CORE 规则时 fail closed。
- standalone Scale 结果与 Bundle 聚合结果同时保留。
- 发布门把 scientific / rights / 中文证据 / safety 写成显式字段（实现要换成计划中的授权 overlay + 统一 Publish 校验）。
- additive migration、历史行保持 null/unknown 的意图。

### ADAPT（语义可留，必须在当前 V3.2 类型上重写）

| 冻结物 | 计划中的去向 |
|---|---|
| `MentalHealthBundleDefinition` | `AssessmentBundleDefinitionV1`（COGNITIVE/SCALE/FORM slots，engine/context/report/publication gates） |
| `BundleEvidenceMappingDefinition` | `EvidenceItemV1`（来源 `COGNITIVE_METRIC \| SCALE_SCORE \| CONTEXT_FACT`） |
| 报告 facts 草稿 | `BundleReportFactsV1` 通用 envelope + discriminated engine payload |
| `AssessmentEpisode` 表 | 教师 campaign 按 subject 建 episode；家长自助建独立 episode |
| Attempt subject/respondent 列 | 禁止从旧 `userId` 猜测；历史保持 null |
| `analysisEngineKey` 列 | CompositeAnalysisSnapshot 查询元数据；payload 仍加密 |
| `package-analysis.dispatcher.ts` | `BundleAnalysisEngineRegistry`，按精确 engine key+version dispatch，删除 package-key 特判 |
| 观众 projector | student/parent/teacher/admin；家长只能看自己作为 respondent 的投影 |
| publicationGate 结构 | 管理员授权记录 + 动态 Publish；WHO-5 非商业部署才可发布 |

### REIMPLEMENT（从当前 main 新写）

- `FrozenAssessmentBundleSnapshotV3` 与旧 v1/v2 compatibility parser。
- 四个引擎：`cognitive-domain-v1`、`scale-evidence-v1`、`mental-health-rule-v1`、`integrated-evidence-v1`。
- 计划中的七个 PUBLISHED Bundle 与 TEXI 简体本地化流程。
- 授权管理、`EXPIRED/REVOKED/SCOPE_MISMATCH` overlay、Attempt 有限截止时间。
- `PARENT` 角色、邀请码、关系、consent、教师分配 / 家长自助。
- SafetyPolicyTemplate、持久 SafetyCase、Bull 延迟升级、test-only safety fixture。
- 显式 `{ targetBundleKey, targetBundleVersion }` reanalysis。
- 分类只读冻结 `criterionBand.key`。

### IGNORE（不要带进本 PR）

- 整分支 cherry-pick 或把 `20260830110000_add_mental_health_bundle_contract` 原样 replay。
- SCARED-41 / RCADS-25 以及四份 DRAFT 焦虑综合包作为首发产品。
- 把 WHO-5 低分映射成危机 / `SAFETY_ESCALATED`。
- `STRONG_CONVERGENCE` 等在无参考阈值时的跨量表结论（计划明确禁止）。
- 在 V3.2 已改过的 `composite.service.ts` / snapshot / report-package-freeze 上套冻结 diff。
- 从显示标签推断分类。
- Cross-informant 综合或平均分。

## incoming-main 冲突审计

冻结 diff 直接改 `schema.prisma` 与 composite/cognitive-analysis 核心文件。这些文件在 PR41–45 中已经：

- 引入 UNIFIED unit runtime、Frozen Unit Admission、Closed Aggregate、parent CAS；
- 把 UNIT submit 从 aggregate finalize 拆开；
- 扩展 Cognitive/Form admission 快照。

若 cherry-pick `bba5cdf`，迁移时间戳、Attempt 列、snapshot 形状、engine 特判都会与 V3.2 打架。正确做法：本分支每个 commit 只在 **当前 main** 上 additive 引入计划中的契约，需要冻结原型时手工抄类型/规则意图，不搬旧文件。
