# Round 2：管理员授权报告包、证据快照与认知任务扩充——可执行 PR 任务书

**状态**：PR0–PR5 已合入；PR6 前置方案确认中，PR6 尚未启动

**版本**：v1.1（2026-08-24 PR6 前置确认稿）

**前置基线**：Round 1 的 9 个认知任务已发布；Round 2 PR3–PR5 又实现 9 个 DRAFT 任务。当前共 18 个真实认知 `testType`，另有 1 个只供测试的 `fake`

**设计来源**：`docs/design-cognitive-round2-report-composite-feedback.md`

**证据与刺激 Gate**：`docs/cognitive-round2-evidence-sources.md`

**实施仓库**：`/Users/Qiang/Documents/eduK12-dev`

---

## 0. PR6 前置确认：报告包、单项报告与宽表基线

本节记录 2026-08-24 在 PR6 开发前确认的产品边界。它优先于本任务书 v1.0 中把 `analysisProtocol` 直接暴露为教师通用选项的描述。PR6 及其后的代码在本节得到确认前不得启动。

### 0.1 四个术语必须分开

| 术语 | 定义 | 是否产生跨模块结论 |
|---|---|---|
| **单项报告（unit report）** | 一个认知 Session 或一个量表 Assessment 自己的冻结结果、解释、质量与方法信息 | 否 |
| **收集容器（collection-only）** | 教师自由组合 Form、量表和认知任务，用于一次发放、进度管理和宽表导出 | 否；只并列单项报告 |
| **报告包（report package）** | 由开发代码预先定义、版本化、管理员可见并授权给教师的固定测评产品；包含精确模块、Profile、版本、报告结构和分析规则 | 是，但只能产生该包声明的专用报告 |
| **包报告（package report）** | 报告包完成后按其冻结定义生成的专门报告和快照 | 是；范围不得超出包定义 |

“综合测评”作为页面或容器名称不等于“综合报告”。只有 `reportPackageKey + reportPackageVersion` 已冻结的实例可以产生包报告。普通问卷、普通 Composite、任意量表组合或任意认知任务组合只能得到单项报告集合。

### 0.2 本轮确认后的硬边界

1. **不做任意组合综合**：不根据当前模块集合自动匹配、近似匹配或推断报告包；即使模块恰好与某个包相同，只要创建时没有从获授权的报告包实例化并冻结，也只能按 collection-only 处理。
2. **报告包是独立资源**：v1 的包定义、版本、槽位、分析规则和发布/退役状态由开发者在代码 Registry 中维护并随部署变更；管理员不能在 UI 中自由编写构念映射、公式或报告模板。
3. **管理员授权后才能使用**：v1 的“管理员管理”明确限定为查看包目录、版本、状态、内容与使用记录，以及对合格教师 grant/revoke；教师目录只显示自己获授权且已发布的包。
4. **包授权覆盖固定内容**：教师获得报告包授权后，可以实例化该包内钉死的任务/量表，即使这些材料没有另外授权给教师；该权限只对该包实例有效，不授予教师把底层材料拿去任意组合的能力。
5. **撤销不改历史**：撤销授权阻止新的包实例化；已经发布或已经冻结的实例、Session 和报告继续按原快照工作。v1 不扫描并拆除历史容器。
6. **Package 不是编辑器**：教师只能选择包、目标课程以及包允许的 standard/research 档位；不能删除、替换、重排必需槽位，也不能改变专用报告结构。
7. **无包就无综合语义**：collection-only API/UI/export 不得出现 Domain、跨来源 finding、overall/average score、综合建议或“整体评估”措辞。

### 0.3 当前认知任务数量与扩展能力

以 backend Registry、frontend Runner Registry 和本机 seed 数据三者交叉核对：

| 状态 | 数量 | testType |
|---|---:|---|
| 已实现且 PUBLISHED | 9 | `reaction`、`memory`、`stroop`、`gonogo`、`cpt`、`nback`、`corsi`、`sst`、`taskswitch` |
| 已实现但保持 DRAFT/pilot | 9 | `patterncompare`、`flanker`、`cardsort`、`digitbackward`、`picturesequence`、`pairedassociate`、`matrix`、`mentalrotation`、`tower` |
| 内部测试，不计入产品数量 | 1 | `fake` |
| 本任务书后续候选 | 6 | `trailmaking`、`reversallearning`、`bart`、`wordlist`、`lexicaldecision`、`emotionrecognition` |

因此当前代码已经有 **18 个真实认知任务**，当前可正式创建的是其中 9 个；若 PR12–PR13 的六个扩展任务全部通过内容/pilot Gate，已实现总数会达到 **24 个**。Registry 和通用 Session/Trial/Report/Export 链没有写死总数上限，之后仍可按版本继续增加；真正的限制是每个新任务都必须完成 schema、三档 Profile、seed 重放、服务端评分、质量门、单项报告、导出字典、刺激许可和 pilot，而不是数据库容量。

### 0.4 单项存储、单项报告与宽表导出现状审计

| 要求 | 当前证据 | 结论 | PR6 阶段必须补的内容 |
|---|---|---|---|
| 认知任务结果存储 | Session 冻结 config/profile/report；Trial、score、metrics、quality 加密存储；Composite child 关联 attempt/item | 已完成 | 保持回归，不重建存储模型 |
| 认知单项报告 | `buildCognitiveSingleTaskReport` 被 standalone、history/Complete、Composite 共用 | 已完成 | 继续复用冻结报告，不由包引擎重算 |
| 认知单任务导出 | summary/full CSV/SAV 与 research ZIP/XLSX；含 trials、metrics、manifest、dictionary | 已完成 | 保持既有格式回归 |
| 量表结果存储 | 每个 Scale Assessment 独立保存 answers、dimension scores、feedback、时间 | 已完成 | 历史加密数据不迁移 |
| 量表单项报告 | standalone/普通问卷能逐量表展示；Composite backend 也返回每个量表 scores/feedback | 部分完成 | Composite 页面仍把量表结果显示为 JSON，须提取并复用正式 Scale 单项报告卡 |
| 混合容器宽表 | Composite summary/full CSV/SAV 已按“一位参与者的一次 Attempt 一行”，展开量表维度、认知 score/quality/metrics；教师强制匿名 | 基本完成 | 冻结标签/版本/Profile 列、0 与 null、重复槽位命名、混合 Scale+Cognitive fixture 和 UI 下载路径须形成明确 Gate |
| 普通多量表问卷边界 | 后台仍为任意量表计算并保存 `averageScore`，前端使用“聚合测评报告/整体评估” | 不符合本次确认 | 停止新生成/暴露任意量表平均分和综合措辞；历史字段不删除，但读取时只投影成单项报告集合 |

结论：**底层存储已足够，不能为了报告包另建每任务/每量表结果表；认知导出已完整，混合宽表已有主体实现。但“每个量表在混合容器里得到正式独立报告”及“普通多量表绝不产生综合平均”尚未满足，必须先于 Domain Engine 修正。**

### 0.5 PR6A 基线验收标准

在任何 Evidence/Domain 开发前，collection-only 必须通过以下验收：

1. 同一容器中含多个 Scale、多个 Cognitive 或二者混合时，参与者与教师看到的是按模块顺序排列的独立 report cards；每个卡片语义与该模块 standalone 报告一致。
2. collection-only response 不返回或展示 `averageScore`、`overallScore`、Domain、consistency、convergence、综合建议；顶层只允许完成时间、总用时、完成度等非解释性元数据。
3. 普通 Questionnaire 的历史 `aggregateReport.averageScore` 可以继续留在数据库以兼容旧数据，但新代码不得用它形成报告结论，API/UI 不再暴露为有效综合结果。
4. 后台 summary 宽表一行对应一个 Attempt；量表维度、认知主要/次要指标、quality、Profile 和精确版本列稳定可追溯；缺失为 null，真实 0 保持 0。
5. full/research 原始数据导出保持现有权限和匿名规则；宽表不要求把 trial 数组塞进单元格来替代 research-long。
6. 只有从获授权报告包创建并冻结的 Attempt，后续 API 才允许出现 `packageReport`/Domain/跨来源字段。

---

## 1. 本任务书解决什么

原 Round 2 文档说明了证据整合、Domain、跨来源反馈和 Snapshot 的方向，但还不能直接按 PR 开发；它也把“未来可能测量的领域”与“当前任务已经能支持的领域”混在了一起。

本任务书把 Round 2 改成可独立评审、可测试、可回滚的 PR 顺序，并补上三项产品约束：

1. **完整但不过度工程化**：只增加静态版本化 Registry、发布冻结和一张分析快照表；不做通用规则 DSL、插件系统、工作流引擎或证据明细表群。
2. **包报告必须受控**：Composite/Questionnaire 仍可收集任意模块，但只有从获授权、预先发布的 `ReportPackageDefinition` 实例化并冻结的容器才能生成专用包报告；任意组合只能显示单项报告。
3. **补齐任务覆盖**：Round 2 核心已新增 9 个 DRAFT 任务，使已实现的真实任务从 9 个增至 18 个；只有通过 pilot/Gate 的版本才会变为正式可用。另有 6 个扩展任务进入后续 PR，但不让低信度或高内容风险任务阻塞核心报告。

Round 2 的最终输出不是“综合认知 72 分”，而是：

```text
报告包与覆盖范围
→ 数据质量
→ 各核心领域/分面证据
→ 同一领域内的多任务一致性（有依据时）
→ 经批准的量表—行为跨来源比较（有依据时）
→ 版本化建议与限制
→ 不可变分析快照
```

---

## 2. Round 1 现状与必须复用的基础

当前实现已有：

| 能力 | 现状 | Round 2 处理 |
|---|---|---|
| 认知任务 | reaction、memory、stroop、gonogo、cpt、nback、corsi、sst、taskswitch | 原样复用并补任务，不重写历史 scorer |
| 三档 Profile | experience / standard / research，发布时冻结 | 只有 standard / research 可进入综合分析；experience 只显示单项报告 |
| Registry | 精确匹配 `testType + engineVersion + scoringVersion` | 扩展 Domain/Protocol/Evidence Registry，继续禁止 latest fallback |
| 报告快照 | Assignment 已冻结 config/report definition | 作为综合分析输入，不再读取 live Registry 改写历史语义 |
| 单任务报告 | 后端统一 builder，学生/教师/Composite 共用 | 保留为 `modules[]`，综合层不重算或覆盖单任务报告 |
| 质量门 | 每任务 `qualityFlags.interpretable` | 质量不足的任务仍展示，但不得进入 Domain/跨来源结论 |
| 导出 | summary/full/research，含 Registry 字典与 raw trials | Round 2 先固化混合宽表，再为包报告追加快照、证据引用和 package/analysis 版本 |
| Composite | 任意添加 Scale/Cognitive/Form，报告只组装 modules | 保留 collection-only；另增“从获授权报告包实例化”的固定模式 |

必须保持的历史契约：

- 不修改已发布的 task config、scoringVersion、report snapshot；
- 不把无 Profile 的历史数据回填为 standard；
- 不把 product index 当作 Domain 分数；
- 不用客户端提交的 trial condition 代替服务端按 seed 重放；
- 不让 Composite wrapper 重新 live merge Registry；
- 不影响现有单任务 result/history/export 路径。

---

## 3. 外部产品和文献带来的设计结论

### 3.1 借鉴什么

- 本地 `cogtest`：借鉴 `unitReports`、统一指标标签、反馈区块和导出结构。
- PsyMetrics：借鉴“先按目标能力选择经过验证的测量内容，再生成针对性报告”的产品逻辑；其官方说明强调按目标能力选取预验证量表，而不是把任意内容做简单平均。参考：[PsyMetrics Platform](https://psymetrics.ai/platform/our-platform/)、[PsyMetrics Science](https://psymetrics.ai/science/)、[Cognitive Assessments](https://psymetrics.ai/solutions/assessments/cognitive/)。
- NIH Toolbox：核心认知电池优先覆盖执行功能、情景记忆、语言、加工速度、工作记忆和注意；儿童电池用少量任务覆盖多个明确能力，而非堆出一个无依据总分。参考：[NIH Toolbox cognition battery design](https://pmc.ncbi.nlm.nih.gov/articles/PMC3662346/)、[pediatric validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3925365/)。
- PEBL：证明常见范式可以做成开放、可重复的计算机化任务，但其研究也提示 RT 往往比准确率、变异或随时间下降指标更稳定，重复测量还会有练习效应。参考：[PEBL battery](https://pmc.ncbi.nlm.nih.gov/articles/PMC3897935/)、[reliability study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9882756/)。
- ICAR / MaRs-IB：为公开矩阵推理和空间项目提供可借鉴的项目结构，但产品仍需记录具体许可、题库版本与内容审核。参考：[ICAR project](https://icar-project.com/attachments/download/60/Intelligence%202014.pdf)、[MaRs-IB](https://pmc.ncbi.nlm.nih.gov/articles/PMC6837216/)。

### 3.2 明确不照搬什么

- 不复制 `cogtest` 的 `score × weight`、通用 high/medium/low、虚拟百分位；
- 不复制 NIH、CANTAB、商业量表的题目、图片、名称商标或常模；只采用通用实验范式并制作自有刺激；
- 不因某范式“常见”就声称具备临床效度；Huisurvey 任务首先是教育/研究场景的结构化行为任务；
- Dot Probe 不进入个人核心报告。大样本多版本研究未找到可重复的非零威胁偏向信度，最多保留为研究草案。参考：[9,600 人 Dot Probe 可靠性研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC11949442/)；
- Tower、BART 等复杂任务不使用“越高越好”。Tower 的准确性、用步和计划时长受工作记忆、抑制和年龄共同影响；重复测试也有练习效应。参考：[青少年 Tower 研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4203700/)、[儿童执行任务重测研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC3105625/)；
- 没有正式本地样本与报告包内冻结协议匹配时，不显示 percentile、z-score、正常/异常或 IQ。

---

## 4. 产品边界：任意收集不等于报告包

### 4.1 两条互不自动转换的创建路径

| 路径 | 创建方式 | 允许内容 | 报告 |
|---|---|---|---|
| `collection_only` | 默认；教师自由编排 | 现有任意 Scale / Cognitive / Form 组合 | 只显示各模块独立报告、完成度和质量；支持宽表导出，不显示 Domain、跨来源结论或综合建议 |
| `report_package` | 教师从自己获授权的 PUBLISHED 包版本实例化 | 系统按包定义自动物化固定槽位、Profile、精确版本和报告定义 | 生成该包声明的 Domain/跨来源结果、建议和不可变 Snapshot，同时保留每个单项报告 |

禁止根据当前模块集合“猜一个最接近的包”，也禁止管理员或教师把一个普通 Composite 手工标记成包。即使 collection-only 的模块恰好与某个包完全相同，它仍然没有包报告资格。

### 4.2 ReportPackage v1 资源模型

v1 使用代码内不可变 Registry，不建设通用包编辑器：

```ts
type ReportPackageDefinition = {
  key: string
  version: string
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  name: string
  description: string
  profiles: Array<'standard' | 'research'>
  slots: Array<CognitiveSlot | ScaleSlot | ControlledFormSlot>
  reportDefinitionVersion: string
  analysisDefinition: FrozenAnalysisProtocolDefinition
  audience: Array<'participant' | 'teacher' | 'researcher'>
  estimatedMinutes: Record<'standard' | 'research', [number, number]>
}
```

- Registry 定义“这个产品是什么”，MaterialGrant 定义“哪些教师可以使用”；二者不能混为一个可编辑 Composite 模板。
- 复用现有 `MaterialGrant`，增加 `REPORT_PACKAGE` resourceType；`resourceId` 使用精确的 `packageKey@packageVersion`，grant 时必须能在代码 Registry 中解析到 PUBLISHED 包。
- 管理员目录可查看 DRAFT/PUBLISHED/RETIRED、槽位、预计时长、版本和不可用原因；教师目录只返回本人获授权的 PUBLISHED 版本。
- 包 grant 足以物化包内固定资源，但不改变底层 Scale/Cognitive config 的独立授权；教师不能在 collection-only 中借用这些底层资源。
- 当前已经实现的 `AnalysisProtocolRegistry` 不丢弃：它降为包内部的分析定义。对外选择、授权、冻结和报告均以 ReportPackage 为单位。
- 当前数据库中的 `analysisProtocolKey/version/snapshot` 尚无 PUBLISHED 协议实例；在首次发布包之前，应迁移/改名为 package 语义或增加明确的 package wrapper，避免把内部分析协议继续当作教师资源。
- 当前六个定义全部为 DRAFT/disabled，因此这个授权缺口尚未向教师开放；PR6B 是任何包版本变为 PUBLISHED 之前的必须门禁。

### 4.3 包报告不自动降级

- 某任务质量失败：保留原包，输出“部分可解释/证据不足”，不换成更短包；
- 某模块未完成：Attempt 不能完成，沿用固定必需槽位语义；
- 发布后包或模块改变：拒绝修改；复制时原样复制 package snapshot；
- experience Profile：可在 collection-only 完成和查看单项报告，但不能满足任何 v1 报告包；
- Form：只有包明确声明的受控 Form slot 才可进入包输入；普通 Form 只作为背景显示；
- live Registry、授权撤销或新包版本不得改写历史快照。

### 4.4 v1 不做的防御性工程

不增加：

- 可视化规则编辑器或通用 DSL；
- runtime plugin / hot reload / remote Registry；
- `EvidenceItem`、Domain、Recommendation 各一张数据库表；
- snapshot `latest` 标记、supersedes 图或异步分析队列；
- 为每个 Registry 冗余增加一列 hash；
- LLM 自动生成正式心理结论；
- 为理论上所有 Scale 建立自动语义映射。

v1 使用代码内不可变定义 + 发布快照 + 一张加密分析快照表即可。

---

## 5. 核心分析领域与当前覆盖

### 5.1 v1 正式领域

| Domain | 分面 | Round 1 证据 | Round 2 补充 | v1 可输出 |
|---|---|---|---|---|
| `processing_speed` | 简单反应、视觉比较速度 | reaction | patterncompare | 描述；有匹配 reference 才给方向 |
| `sustained_attention` | 辨别、遗漏、稳定性 | cpt、reaction | patterncompare 仅支持 | 多任务证据结构 |
| `response_inhibition` | 动作抑制、停止过程 | gonogo、sst | — | 两种范式分面，不做平均 |
| `interference_control` | 冲突下正确性和速度成本 | stroop | flanker | 两种独立干扰范式 |
| `working_memory` | verbal storage、visuospatial storage、updating、manipulation | memory、corsi、nback | digitbackward | 分面画像，不做 WM 总分 |
| `cognitive_flexibility` | trial switch、rule shift、perseveration | taskswitch | cardsort | 两种切换证据 |
| `episodic_learning_memory` | sequence learning、paired learning | — | picturesequence、pairedassociate | 学习曲线、即时保持；非临床记忆诊断 |
| `fluid_reasoning` | 规则归纳 | — | matrix | 正确数/难度覆盖；不转 IQ |
| `visuospatial_reasoning` | 空间旋转 | — | mentalrotation | 准确性与 RT；不与 Corsi 混为一体 |
| `planning` | look-ahead、效率、规则遵守 | — | tower | 单任务描述；不声称独立“计划能力分” |

### 5.2 v1 Metric → Domain 主映射

PR7 按下表建立第一版 primary evidence；表中未列出的指标只能作为单任务 secondary/quality 信息，不能临时加入包报告结论。

| Domain / facet | Primary evidence | Supporting（不增加独立任务计数） |
|---|---|---|
| processing speed | reaction.medianRtMs；patterncompare.correctPerMinute / medianCorrectRtMs | cpt.hitMedianRtMs |
| sustained attention / stability | cpt.dPrime / omissionRate / rtICV | reaction.rtICV / missRate |
| response inhibition | gonogo.commissionRate / dPrime；sst.ssrtMs / pRespondStop | cpt.commissionRate |
| interference control | stroop.stroopEffectMs / incongruentAccuracy；flanker.flankerEffectMs / incongruentAccuracy | 两任务 errorCost |
| verbal storage | memory.maxSpan / totalCorrectTrials | — |
| working-memory manipulation | digitbackward.maxSpan / totalCorrectTrials | sequenceDistance |
| visuospatial storage | corsi.maxSpan / totalCorrectTrials | sequenceErrorDistance |
| working-memory updating | nback.dPrimeByN / maxReliableN | loadCostDPrime |
| cognitive flexibility | taskswitch.switchCostRtMs / switchCostAccuracy；cardsort.switchCostRtMs / perseverativeErrorRate | postSwitchRecovery |
| episodic sequence learning | picturesequence.adjacentPairScore / learningGain | delayedRetention |
| paired learning | pairedassociate.learningSlope / trialsToCriterion | delayedAccuracy |
| fluid reasoning | matrix.accuracy / accuracyByRuleFamily | reachedDifficulty、RT 只作方法信息 |
| visuospatial reasoning | mentalrotation.accuracy / angleCost | medianCorrectRtMs |
| planning | tower.minimumMoveSolveRate / excessMoves | firstMoveLatencyMs、ruleViolations |

`directionClass` 仍须由 criterion/reference 另行提供；表中的 primary 并不自动表示“越高越强”或“越低越差”。

### 5.3 扩展领域

以下可以在 Round 2 扩展 PR 中提供单项报告，但在有足够质量/内容证据前不进入 `k12_core_profile_v1`：

- `visual_search_set_shifting`：trailmaking；
- `verbal_learning`：wordlist；
- `language_processing`：lexicaldecision；
- `social_emotion_processing`：emotionrecognition；
- `decision_learning`：reversallearning；
- `risk_taking`：bart。

### 5.4 不应建立的“伪覆盖”

- 只有一个 Tower 任务时，planning 只能是单任务结果，不显示跨任务一致性；
- Corsi 是视空间短时/工作记忆，不等同于空间推理；
- CPT commission 不能同时在两个 Domain 里被重复计数形成更强证据；可作为一个 Domain primary、另一个 supporting；
- 自评量表与行为任务不是同一种测量方法，不能合成一个数；
- 儿童执行功能的因素结构可能比成人更不分化，因此 UI 应显示分面与来源，而不是画一个看似精确的执行功能雷达总分。参考：[NIH Toolbox factor structure](https://pmc.ncbi.nlm.nih.gov/articles/PMC3950958/)。

---

## 6. Round 2 新增任务清单

所有数量都是首个版本的**候选默认值**，须经 schema/golden fixture/内部 pilot 后以新 configVersion 发布；它们不是文献常模。每个任务继续使用 experience / standard / research 三档，只有后两档可进入综合分析。

### 6.1 P0 核心任务：Round 2 核心发布必须完成

| testType | 范式与补齐领域 | Experience | Standard | Research | 主要指标 |
|---|---|---:|---:|---:|---|
| `patterncompare` | 图形模式比较；加工速度 | 30 秒 | 60 秒 | 90 秒 | correctPerMinute、accuracy、medianCorrectRtMs、lapseRate |
| `flanker` | Flanker 冲突；干扰控制 | 24 trials | 80 | 160 | flankerEffectMs、incongruentAccuracy、congruentAccuracy、errorCost |
| `cardsort` | 双规则卡片分类/DCCS；规则切换 | 24 | 72 | 144 | switchCostRtMs、switchCostAccuracy、perseverativeErrorRate、postSwitchRecovery |
| `digitbackward` | 数字倒背；工作记忆 manipulation | span 2–4 | 2–7 | 2–8，每级 2 题 | maxSpan、totalCorrectTrials、responseDuration、sequenceDistance |
| `picturesequence` | 自有图片序列学习；情景序列记忆 | 6 项×2 轮 | 12 项×3 轮 | 15 项×3 轮+延迟 | adjacentPairScore、positionScore、learningGain、delayedRetention |
| `pairedassociate` | 自有图形—位置配对学习；情景学习 | 6 对×2 轮 | 12 对×3 轮 | 18 对×4 轮+延迟 | correctByTrial、learningSlope、trialsToCriterion、delayedAccuracy |
| `matrix` | 公共/自有矩阵规则推理；流体推理 | 6 items | 16 | 24 | accuracy、accuracyByRuleFamily、reachedDifficulty、medianRtMs |
| `mentalrotation` | 自有几何旋转；空间推理 | 12 | 40 | 80 | accuracy、medianCorrectRtMs、angleCost、mirrorErrorRate |
| `tower` | 自有塔式规划；计划/规则遵守 | 4 problems | 10 | 18 | minimumMoveSolveRate、excessMoves、firstMoveLatencyMs、ruleViolations |

任务内容要求：

- Pattern Comparison、Picture Sequence 的任务逻辑可借鉴 NIH Toolbox 论文，但图片和 item 全部自制；Pattern Comparison 的 90 秒科研档与文献范式接近，但不得引用 NIH 常模。参考：[Pattern Comparison study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4425122/)、[Picture Sequence Memory](https://pmc.ncbi.nlm.nih.gov/articles/PMC4254833/)。
- Digit Backward 单独使用新 `testType`，不改变 Round 1 `memory` 的 forward scorer/语义；
- Matrix 只使用已确认公共领域/兼容许可项目，或内部生成并由两名内容审查者确认唯一答案；
- Tower 使用自有初始/目标状态与最短路径表，不能复制商业 TOL 题册；
- 每个正式 sequence 由 Session seed 决定，服务端可重放并验证条件；
- Practice 不入正式 trial，不计分，未通过可以重练。

### 6.2 P1 扩展任务：Round 2 扩展发布

| testType | 用途 | 建议三档 | 进入已发布报告包的条件 |
|---|---|---|---|
| `trailmaking` | 视觉搜索、动作速度、set shifting | 短 A / A+B / A+B 多等价形式 | 先验证触屏/鼠标设备差异；初版单项报告 |
| `wordlist` | 言语学习、即时/延迟回忆 | 8×2 / 12×3 / 15×5+延迟 | 中文词频、年龄适宜性、输入方式 pilot 后才能进入新报告包版本 |
| `lexicaldecision` | 词汇识别速度 | 40 / 100 / 200 | 中文词库、伪词规则和文化/地区适用性审查 |
| `emotionrecognition` | 基本情绪识别 | 24 / 60 / 120 | 肖像/绘图许可、年龄与文化平衡、内容审查 |
| `reversallearning` | 概率学习与规则反转 | 40 / 120 / 240 | 先只作 decision-learning 描述，不评价人格或风险 |
| `bart` | 风险行为范式 | 10 / 30 / 50 balloons | 研究档优先；报告用“更保守/更多泵压”等描述，不用好坏等级 |

### 6.3 本轮明确延期/排除

| 任务 | 处理 | 原因 |
|---|---|---|
| Dot Probe | 不开发 PUBLISHED 个人报告 | 个体偏向分信度证据不足 |
| Emotional Stroop | 仅保留研究候选 | 情绪词内容、文化适配和解释风险高，且与已有 Stroop 重叠 |
| IGT | 延期 | 时长较长、反馈/策略学习解释复杂，BART/反转学习已先覆盖决策研究场景 |
| 语义流畅性 | 延期 | 可靠实现需要语音采集/转写或受打字速度污染，不在本轮引入音频隐私链 |
| 正式智力/IQ、诊断量表等价物 | 排除 | 需要标准化施测、许可、常模和专业资格，超出平台当前定位 |

---

## 7. 每个新任务统一 Definition of Done

每个任务 PR 中的每个 `testType` 必须同时具备：

1. `.strict()` config schema 与 trial schema；
2. experience / standard / research 三档 Profile；
3. seed 驱动的正式序列生成与服务端重放；
4. 练习、失败重练、正式开始和中断处理；
5. 服务端 scorer，至少两个主要指标，不信任客户端条件标签；
6. metric / quality / report Registry，所有 key 可进入 research export dictionary；
7. 质量门：完成度、有效试次数、明显无反应/恒定反应、任务特有异常；
8. golden scoring fixture、schema 合同测试、seed determinism、Runner 测试；
9. 单任务报告顺序与 Round 1 一致，`referenceMode: none` 起步；
10. 原始刺激许可/来源记录；内部自制也要写 `stimulusSetVersion`；
11. Experience 明确标记体验，不进入 Domain 集成；
12. standard/research 的完整 start → practice → trials → complete → report 路径可运行。

不要为了“防御”给每个任务实现独立存储表、独立导出器或独立报告组件；全部复用 Round 1 通用链。

---

## 8. 内置 Report Package 与内部 Analysis Definition

### 8.1 v1 cognitive-only 报告包候选

报告包由代码内 `ReportPackageRegistry` 发布，内部引用冻结的 `AnalysisProtocolDefinition`；所有任务槽位都是精确且必需的。v1 不提供管理员或教师自定义包。

管理员先把精确包版本授权给教师。教师从获授权目录选择包后再选允许的档位（standard 或 research）；v1 同一包内所有认知槽位使用同一档位，不允许混搭。选择后由系统按包内精确版本自动创建/复用 Cognitive Assignment 并填入固定模块，教师不能删除或替换必需槽位。

| package key | 精确必需任务 | 专用报告主要输出 | 预计 standard 时长 |
|---|---|---|---:|
| `attention_stability_v1` | reaction + cpt + patterncompare | processing speed、sustained attention/stability | 约 10–15 分钟 |
| `inhibitory_control_v1` | gonogo + sst + stroop + flanker | response inhibition、interference control；分面并列 | 约 18–25 分钟 |
| `working_memory_v1` | memory + digitbackward + corsi + nback | verbal storage、manipulation、visuospatial storage、updating | 约 18–25 分钟 |
| `executive_control_v1` | nback + sst + taskswitch + cardsort + tower | updating、inhibition、switching、planning；无执行总分 | 约 25–35 分钟 |
| `learning_reasoning_v1` | picturesequence + pairedassociate + matrix + mentalrotation | episodic learning、fluid reasoning、visuospatial reasoning | 约 25–35 分钟 |
| `k12_core_profile_v1` | patterncompare + cpt + flanker + gonogo + nback + digitbackward + cardsort + picturesequence + matrix + tower | K12 核心多领域画像；不生成单一综合分 | 约 40–55 分钟，可由 Composite 分段完成 |

这六项目前都是候选内置包，仍保持 DRAFT；不能因为 Registry 中已有定义就自动授权或发布。`k12_core_profile_v1` 是预定义电池，不是“以上任务任选若干”。如果未来要用等价替代任务，发布一个新 packageVersion，并为新版本单独验证、授权和冻结。

### 8.2 跨来源报告包

跨来源只增加两个报告包候选，不对任何量表自动开放：

- `attention_multisource_v1`：`attention_stability_v1` 的认知槽位 + 一个经批准的注意/日常执行量表映射；
- `executive_multisource_v1`：`executive_control_v1` 的认知槽位 + 一个经批准的执行功能量表映射。

一个 Scale 只有同时满足下列条件才可占据量表槽位：

```text
scale.code
+ dimension.code
+ 冻结后的 scale definition contentHash
+ direction/band semantics
+ mappingVersion
+ 许可与内容审核记录
```

当前仓库没有可直接声明为正式映射的内置量表。后续跨来源 PR 必须选定至少一个已获许可、PUBLISHED、评分语义清楚的实际量表并完成内容/心理学审核；若没有，跨来源包保持 disabled，不能用测试 fixture 冒充产品完成。

### 8.3 Report Package 发布、授权与实例校验

创建包实例时先校验当前教师对精确 package key/version 的 grant；发布实例时再一次性校验并冻结：

- packageKey / packageVersion / packageDefinitionVersion；
- 内部 analysisDefinitionKey / analysisDefinitionVersion；
- 精确任务槽位、顺序、required；
- 每个 Cognitive Assignment 的 testType、Profile、engine/scoring/config/report definition versions；
- 每个 Scale 的 code、dimension、contentHash、direction 与 mappingVersion；
- audience、Domain 输出范围、recommendationRuleVersion；
- caveats、reportDefinitionVersion 与 grant 使用记录（只记录谁在何时实例化，不把 grant 状态冻结为报告语义）。

Session/Attempt 只复制冻结内容，不重新匹配 live Registry。授权撤销只阻止新的实例化，不使历史 Attempt 或 Snapshot 失效。

---

## 9. Evidence 与包报告规则

### 9.1 Evidence 只引用已冻结结果

```ts
type EvidenceItem = {
  id: string
  sourceType: 'cognitive_metric' | 'scale_dimension'
  sourceResultId: string
  construct: string
  facet?: string
  metricKey?: string
  value: number | string | null
  unit?: string
  role: 'primary' | 'supporting'
  interpretation: 'descriptive' | 'criterion' | 'reference' | 'self_report'
  directionClass: 'more_difficulty' | 'more_strength' | 'neutral' | 'unknown'
  interpretable: boolean
  qualityFlags: string[]
  provenance: Record<string, string>
}
```

- raw `direction: lower_is_better` 只说明指标方向，不能单独产生“较差”；
- `directionClass` 只能来自冻结的 criterion、报告包内协议匹配的文献/本地 reference，或量表已审核 band；
- 没有比较基础时使用 `unknown`，Domain 为 `descriptive_only`；
- 同一 metric 可映射到一个 primary Domain 和零/一个 supporting Domain，但综合一致性只计 primary 一次。

### 9.2 Domain 状态

```text
not_measured
insufficient_quality
descriptive_only
interpretable
```

只有两个以上独立任务、均可解释且具有可比较的 `directionClass`，才允许显示：

```text
consistent | mixed | divergent
```

一个任务只能显示单项/分面描述，不能写“多任务一致”。不同构念（例如记忆与推理）不能相互做一致性判断。

### 9.3 跨来源规则

只有同一 report package 冻结的内部 analysis definition 中的精确 Scale mapping 才能产生：

```text
convergence | divergence | single_source | insufficient_quality
```

文案必须分栏显示：

```text
行为任务证据
自评/问卷证据
综合说明与限制
```

不输出因果、诊断、高置信临床推断。Form 只在“背景信息”区展示，v1 不进入 convergence engine。

Round 1 尚无参与者年龄/年级的 Session 级冻结，因此 Round 2 v1 不从 seed/config 猜测 K7–9，也不默认落入第一个 reference band。若某个获批 reference 必须按年龄/年级选择，ReportPackage 内部协议要显式加入受控 `participant_age_band` Form 槽位并把答案冻结到分析输入；缺失或非法时 reference 为 unavailable。该字段只用于选择已批准 reference，不进入 convergence 或因果推断。

### 9.4 建议规则

建议由 ReportPackage 内部协议的静态 `RecommendationRule` 生成，必须包含 ruleId、version、audience 和触发 evidenceRefs。v1 不做通用表达式 DSL；规则使用有类型的代码函数和固定模板。

---

## 10. 最小数据与接口改动

### 10.1 Prisma

`CompositeAssessment` 增加：

```text
reportPackageKey                 String?
reportPackageVersion             String?
reportPackageSnapshotEncrypted   String?
```

`null` 表示 `collection_only`，避免另建 mode 列。PR2 已在本地加入的 `analysisProtocol*` 字段尚无正式包数据；PR6B 应使用显式 rename migration 或 package wrapper 完成语义收口，不保留两套并行开关。

`MaterialResourceType` 增加 `REPORT_PACKAGE`，继续复用现有 `MaterialGrant` 表，不新增 package grant 表，也不建立可编辑 package definition 表。

新增一张表：

```text
CompositeAnalysisSnapshot
  id
  attemptId
  packageKey
  packageVersion
  analysisDefinitionVersion
  analysisVersion
  reportSchemaVersion
  inputFingerprint
  generationReason      completion | reanalysis
  generatedBy?
  payloadEncrypted
  createdAt

unique(attemptId, analysisVersion, inputFingerprint)
```

不增加 `isLatest`。Attempt 完成时生成的第一份快照是默认历史报告；管理员显式 reanalysis 产生新行且不覆盖旧行，教师/管理员可指定 snapshotId 查看，参与者默认仍看完成时快照。

### 10.2 Fingerprint

`inputFingerprint` 基于 canonical 明文语义生成：

```text
module result IDs
+ canonical decrypted task metrics / quality
+ scale dimension scores
+ frozen task/scale provenance
+ package / analysis definition / mapping versions
+ report schema / recommendation rule versions
```

不能 hash 随机化加密密文本身。相同输入与版本应幂等返回已有快照。

### 10.3 API

新增/升级：

```text
GET  /api/composites/report-packages         # admin 全量；teacher 仅本人 grants
POST /api/composites                         # 可选精确 reportPackage key/version
POST /api/composites/:id/publish             # 精确校验并冻结
GET  /api/composites/attempts/:id/report     # unitReports；有包时再带 packageReport snapshot
GET  /api/composites/attempts/:id/snapshots  # teacher/admin
POST /api/composites/attempts/:id/reanalyze  # admin，显式 action
GET  /api/composites/attempts/:id/export     # 追加 analysis files/sheets
```

包授权沿用现有 MaterialGrant 管理 API 与合格教师校验；匿名 recovery、教师所有权、wrapper 403 和下载二次鉴权继续沿用，不另造权限体系。

### 10.4 主要代码落点

| 范围 | 预计位置 |
|---|---|
| ReportPackage + Domain/Evidence/内部 Analysis Definition | `server-version/backend/src/modules/cognitive-analysis/`（现有目录扩展） |
| Composite 冻结/报告/快照 | `server-version/backend/src/modules/composite/` |
| 数据模型 | `server-version/backend/prisma/schema.prisma` + 单次 migration |
| 新任务 schema/scorer/registry | `server-version/backend/src/modules/cognitive/` 现有结构 |
| 新任务 Runner | `server-version/frontend/src/modules/cognitive/tasks/` 现有结构 |
| 包目录/选择与包报告 UI | 现有 MaterialGrant 管理页、Composite 教师创建页、参与者结果页与教师结果页 |
| seed | 现有 cognitive seed 脚本；不另建任务专用 seed 系统 |
| 测试 | 现有 backend/frontend cognitive/composite suites，新增 package/grant/analysis/snapshot fixtures |

---

## 11. PR 顺序与依赖

```text
PR0–PR5（已合入）
文档/Registry/协议冻结基础 + 9 个 P0 新任务
  ↓
PR6A collection-only 单项报告与混合宽表基线
  ↓
PR6B 内置 ReportPackage + 管理员授权 + 固定实例化/冻结
  ↓
PR7  Cognitive Evidence + Domain Engine（仅包内调用）
  ↓
PR8  Package Analysis Snapshot
  ├──────────────┐
  ↓              ↓
PR9 包报告 API/UI  PR10 approved Scale Mapping + 跨来源包
  └──────┬───────┘
         ↓
PR11 建议与包分析导出

PR12/PR13 扩展任务保持单项/研究状态，不自动接入任何报告包
         ↓
PR14 Round 2 release gate
```

PR6A/PR6B 是本次确认新增的门禁；原 v1.0 的 PR6–PR13 顺延为 PR7–PR14。所有 PR 从最新本地 `dev` 切分支，各自完成 review → 必要修复 → re-review 后才 `--no-ff` 合回本地 `dev`；除非用户另行要求，不 push。

---

## 12. 可执行 PR 任务

### PR 0 — `docs(cognitive): lock round2 executable scope and evidence sources`

**内容**

- 入库本任务书；原 Round 2 文档保留为概念设计，并在顶部链接本任务书；
- 建立 `docs/cognitive-round2-evidence-sources.md`：记录每个新范式的文献、许可、刺激来源、适用年龄和不可声称内容；
- 记录任务优先级、协议版本和延期项，避免开发时把 Dot Probe/虚拟常模带回正式报告。

**测试/验收**

- 所有 P0 taskType、protocol key、Domain key 在文档中唯一；
- 每个 P0 任务有至少一条原始研究/官方来源和明确的自有刺激策略；
- 工程评审确认范围；内容/心理学审核可在 PR0 标记 pending，但必须在对应 stimulus/config 进入 PUBLISHED 前关闭，并由 PR14 Gate 复核。

### PR 1 — `feat(cognitive-analysis): add versioned domain evidence and protocol registries`

**内容**

- 新建有类型的静态 Registry：`domain.registry.ts`、`evidence-mapping.registry.ts`、`analysis-protocol.registry.ts`、`recommendation.registry.ts`；
- 定义 `EvidenceItem`、`DomainResult`、`CrossSourceFinding`、`CompositeReportV2`；
- 注册第 8 节的 6 个 cognitive-only 内部分析定义，初始状态 DRAFT/disabled；任务包、Domain Engine 和 Gate 通过后由 PR14 随外层 ReportPackage 一起提升；跨来源定义先 disabled；
- 显式列出精确版本，禁止 latest、模糊 testType fallback 和 runtime register API；
- catalog 对普通创建流程只列 PUBLISHED；管理员调试视图可见 DRAFT/disabled 及原因，不泄露量表内容。

**DoD**

- Registry 重复 key、未知 Domain、未知 metric、同一 primary metric 重复计数在启动/测试时失败；
- protocol contract test 验证 exact slots 和允许 Profile；
- 本 PR 不改数据库、不生成报告、不增加管理 UI。

**v1.1 解释**：本 PR 已合入的 AnalysisProtocol Registry 继续作为包内分析契约使用，不再作为所有教师可直接消费的顶层资源；ReportPackage 外层和 grant 边界由 PR6B 补齐。

### PR 2 — `feat(composite): select validate and freeze analysis protocol`

**内容**

- Prisma 增加 `CompositeAssessment` 的三个 nullable protocol 字段；
- Composite 创建/编辑页提供“仅收集”或 PUBLISHED 协议单选；选择协议与 standard/research 档位后，系统按精确版本创建/复用 Assignment、填入固定任务模块，并显示预计时长；
- 协议模式下必需模块不可删除、替换或混用 Profile；切回 collection-only 后才恢复自由编排；
- DRAFT 可换协议；publish 时精确匹配 slot/testType/profile/version/required/重复项；
- publish 写入 `analysisProtocolSnapshotEncrypted`；copy/ensure 原样复制，半套冻结 400；
- PUBLISHED 后 protocol 和 items 不可改变；历史 Composite 默认为 collection-only。

**DoD**

- arbitrary modules + collection-only 可发布；同样模块不自动得到协议；
- 缺一个任务、重复任务、experience、错误版本、错误 required 均拒绝；
- 复制后 protocol snapshot 内容一致；旧 Composite 回归。

**v1.1 调整**：本 PR 已合入的冻结、精确槽位和不可变逻辑继续复用，但“任何教师可选择所有 PUBLISHED protocol”的入口不作为最终产品。PR6B 必须把它收口为“仅能实例化本人获授权的 PUBLISHED ReportPackage”，并处理 `analysisProtocol*` 到 package 语义的迁移。

### PR 3 — `feat(cognitive): add processing and executive task pack`

新增：`patterncompare`、`flanker`、`cardsort`。

除统一任务 DoD 外：

- Pattern Comparison 用自有几何刺激，服务器可从 seed 重放 same/different；
- Flanker 保证 congruent/incongruent 平衡、方向/正确键平衡；
- Card Sort 包含 repeat/switch，perseveration 由当前冻结规则而非客户端标签推导；
- 所有 standard/research config 先 DRAFT pilot，审查后再 PUBLISHED。

### PR 4 — `feat(cognitive): add memory and learning task pack`

新增：`digitbackward`、`picturesequence`、`pairedassociate`。

除统一任务 DoD 外：

- Digit Backward 不修改 `memory`；评分明确完全倒序规则；
- Picture Sequence 使用 versioned 自有图片集，服务端计算 pair/position 分数；
- Paired Associate 记录每轮学习，不把延迟缺失写成 0；
- research 延迟阶段若 Composite 被中断，标记阶段未完成，不伪造 retention；
- 刺激集做 K7–K12 可理解性与文化内容审核。

### PR 5 — `feat(cognitive): add reasoning and planning task pack`

新增：`matrix`、`mentalrotation`、`tower`。

除统一任务 DoD 外：

- Matrix/Rotation item bank 含 `itemId/ruleFamily/difficulty/stimulusSetVersion`；服务端持有答案；
- Tower 每题存最短步数和允许状态，服务端重放 moves；
- 报告不显示 IQ、智力等级或“计划能力正常/异常”；
- 内容来源/许可不明的 item 不能进入 PUBLISHED seed。

### PR 6A — `fix(reporting): enforce collection-only unit reports and mixed wide export`

**目的**

先证明“没有报告包时，每项都有独立报告且后台能导出”，再建设任何综合引擎。此 PR 不产生 Evidence、Domain 或 Snapshot。

**内容**

- 定义 collection-only 顶层响应：只含容器元数据和有序 `unitReports[]`；Form 是背景值，Scale/Cognitive 各自保持独立报告语义；
- 抽取可复用的 Scale 单项报告 DTO/卡片，使 standalone Questionnaire、public Questionnaire 和 Composite 使用同一维度标签、level、解释与建议，不再在 Composite 里显示 JSON；
- 继续复用 `buildCognitiveSingleTaskReport`，不得由容器重算 score、reference 或质量结论；
- 停止普通多量表 Questionnaire 新生成和 API/UI 暴露 `averageScore`；把“聚合测评报告/整体评估”改为“各量表结果”；历史 `aggregateReport` 只读取其中 `scaleReports`，忽略旧 average；
- 固化混合 summary 宽表 contract：一行一个 Attempt，按固定 slot 展开 Scale dimension 与 Cognitive metrics/quality/Profile/version；使用冻结 label，区分 null 与 0；
- 保持现有 full/research-long、CSV/SAV/ZIP/XLSX 和教师强制匿名规则，不新建导出框架。

**DoD**

- 一个含 2 个 Scale + 2 个 Cognitive 的 fixture，参与者/教师均看到 4 张独立报告卡，顺序与容器一致且没有跨模块 headline；
- standalone 与 Composite 内同一 Scale 的 unit report contract 等价；同一 Cognitive 的 frozen single-task report 等价；
- collection-only JSON 和可见文本均不含 `averageScore`、`overallScore`、Domain、consistency、convergence 或综合建议；
- 普通/公开 Questionnaire 新完成路径不再计算任意量表平均，历史报告仍能逐量表查看；
- summary 宽表 fixture 覆盖 Scale+Cognitive、真实 0、null、质量失败、两个同类型槽位、Profile 和精确版本；
- 现有 standalone scale/cognitive export 与 full/research export 回归通过；不改历史密文。

### PR 6B — `feat(report-packages): add admin-granted built-in package resources`

**目的**

把“固定组合 + 专用报告”建立成独立、开发时定义、管理员授权的产品资源；本 PR 只完成包契约、权限和冻结，不生成 Domain 报告。

**内容**

- 新增静态 `ReportPackageRegistry`，包内引用现有 Domain/Evidence/Analysis 定义；第 8 节六个 cognitive-only 候选包继续保持 DRAFT/disabled；
- `MaterialResourceType` 增加 `REPORT_PACKAGE`，复用 MaterialGrant 的管理员列表、grant/revoke、合格教师校验和审计字段；
- 管理员可见所有包版本、槽位、状态和 disabled reason；教师目录只列本人获授权的 PUBLISHED 包；
- package grant 只授权固定包实例化。物化包内 Scale/Cognitive 时可使用包钉死资源，但教师不能把这些底层资源用于 collection-only；
- Composite 创建入口改为“仅收集”或“从获授权报告包创建”，删除面向教师的裸 `analysisProtocol` 选择；
- 把 PR2 已有 `analysisProtocol*` 外部语义迁移/包裹为 `reportPackage*`，内部 Analysis Definition 仍可复用；
- 发布时精确冻结 package、内部 analysis definition、槽位、Profile、task/scale/report versions；任意手工组合不能升级为包；
- 撤销 grant 只拦新实例化，历史冻结实例保持可用。

**DoD**

- 未授权教师看不到且不能通过直接 API key 实例化包；管理员和获授权教师分别通过；
- package grant 不会让教师在 collection-only 选择包内底层受限 Scale/Cognitive；
- 缺槽、重复槽、错误顺序/required/Profile/version、额外模块均拒绝发布；
- 相同模块的手工 collection-only 仍无 package key/snapshot；禁止“自动识别为包”；
- copy/ensure 原样复制冻结 package snapshot，半套冻结 400；撤销授权后历史报告不变；
- 没有 package definition 数据表、包编辑器、规则 DSL 或第二套授权系统；
- 本 PR 结束时仍不生成 Domain/跨来源结论。

### PR 7 — `feat(cognitive-analysis): build package-scoped cognitive evidence and domain reports`

**内容**

- 从已冻结的 single-task result/report provenance 转为 `EvidenceItem[]`；
- 质量失败的 evidence 保留引用但 `interpretable=false`，不进入综合结论；
- 实现 10 个正式 Domain/Facet 输出，并只允许第 8 节六个 cognitive-only 包的冻结内部 analysis definition 调用；
- 根据第 9 节规则产生 status/consistency/summary/caveats；
- 所有新任务初始 `referenceMode:none`，所以多数结果为 descriptive-only；有合法 reference 才产生方向分类。

**DoD**

- 不读取 raw trials 重新发明 scorer；只消费冻结 metrics/quality/provenance；
- 不计算跨任务平均、Domain score、overall score、percentile；
- 一个任务不生成 consistent；不同 Domain 不互相比一致性；
- 同一 metric 不重复增强证据；质量失败得到 partial/insufficient，而不是报告包降级；
- collection-only 无法调用 engine；golden report fixture 覆盖每个 package 的完整、部分质量失败、全部 descriptive-only。

### PR 8 — `feat(composite): persist immutable package analysis snapshots`

**内容**

- 新增 `CompositeAnalysisSnapshot` 与迁移；
- Attempt 完成事务中生成 completion snapshot；collection-only 不强制建分析快照；
- canonical input fingerprint + 幂等约束；payload 用现有加密信封；
- report 默认读取完成时 snapshot，不 live 重算；
- admin reanalysis 显式生成新 snapshot；不覆盖、不设 latest。

**DoD**

- 同输入/同版本重试只有一行；analysisVersion 或 input 改变产生新行；
- 更改 live Registry 后历史 report 不变；
- completion 失败不会留下“Attempt 完成但无必需 snapshot”的半状态；
- 不在日志输出 decrypted payload。

### PR 9 — `feat(composite-report): render package-based participant teacher and researcher reports`

**报告顺序**

```text
报告包范围/版本
→ 数据质量与缺失
→ 核心领域与分面
→ 行为任务证据
→ 单项模块报告
→ 建议
→ 限制与版本来源
```

**内容**

- 升级 report API：collection-only 返回 unitReports；包实例在相同单项报告之外返回冻结 `packageReport`；
- Participant：简洁、非诊断、隐藏 research-only metrics；
- Teacher：来源、质量、课堂观察建议、限制；
- Researcher/Admin：evidence refs、所有版本、snapshotId、export；
- 不用雷达图或彩色总分暗示不同 Domain 同尺度；优先使用 coverage/facet cards；
- 匿名 recovery 和教师所有权沿用现有鉴权。

**DoD**

- collection-only 永不出现综合标题/Domain；
- experience 单项 caveat 保留；
- `interpretable=false` 不显示正负 headline；
- student/teacher/researcher 字段白名单测试；
- 页面刷新、Registry 更新后仍读取同一 snapshot。

### PR 10 — `feat(composite-analysis): add approved scale mapping and cross-source packages`

**内容**

- 建立代码内 `ScaleConstructMappingRegistry`；
- 选定至少一个实际 PUBLISHED、已获许可量表，冻结 `scale.code + dimension.code + contentHash + score semantics`；
- 同时选定至少一个报告包完全匹配、来源可追溯的 cognitive criterion/reference；若需要年龄带，按第 9.3 节加入并冻结必填 `participant_age_band`，禁止使用 seed 默认带或内部模拟参考；
- 完成注意或执行领域的第一组 multisource report package，先保持 DRAFT，PR 14 审核后再 PUBLISHED；
- 行为/自评来源在数据结构和 UI 中分开；
- 实现 convergence/divergence/single-source/insufficient-quality；
- 任意自建 Scale、名称相似 Scale、内容 hash 不匹配 Scale 只能留在 modules。

**DoD**

- higher-more-difficulty 与 higher-more-strength 双向测试；
- 缺维度、逆向语义、hash 变化、未批准 Scale 不集成；
- descriptive-only 认知证据不能与量表生成 convergence；
- package/reference 不匹配、年龄带缺失或来源未审核时只能返回 unavailable/single-source；
- Form 不进入规则；
- 无真实获批 mapping 时，本 PR 不得以 fixture-only 方式宣称完成。

### PR 11 — `feat(composite-analysis): add traceable package recommendations and analysis export`

**内容**

- 根据冻结 package + Domain/CrossSource status 生成版本化建议；
- student/teacher/researcher 分别有白名单模板；
- export 增加 `analysis.json`、`domain_evidence.csv`、`cross_source_findings.csv`、`recommendations.csv` 和 README 方法说明；
- XLSX 增加 Analysis/DomainEvidence/Findings/Recommendations/Provenance sheets；
- 每条建议带 ruleId/version/evidenceRefs，不调用 LLM。

**DoD**

- 无足够证据不生成强建议；
- divergence 文案强调情境差异，不把任一来源判为错误；
- export 与画面来自同一 snapshotId；教师继续强制匿名；
- 旧 cognitive research export 格式回归不变。

### PR 12 — `feat(cognitive): add decision and visual-search research task pack`

新增：`trailmaking`、`reversallearning`、`bart`。

- 初始 `recommendedForCreate=false` 或 research-only；
- Trail Making 保存设备/指针信息并在报告提示 motor/device confound，但不建设设备指纹系统；
- Reversal Learning 记录 acquisition/reversal 分段、perseverative errors 和 trials-to-criterion；
- BART 记录 adjusted pumps、爆破数、现金化数；不输出好坏等级；
- 在 pilot 与可靠性审查前不加入任何已发布报告包。

### PR 13 — `feat(cognitive): add language and social cognition content-gated task pack`

新增：`wordlist`、`lexicaldecision`、`emotionrecognition`。

- 代码和 schema 可合入；只有内容 gate 通过的 stimulus set 才能 PUBLISHED/recommended；
- Word List 的输入方式、错别字 normalization、延迟阶段必须有 pilot 记录；不复制 CVLT/RAVLT 词表；
- Lexical Decision 记录词频带、字长和伪词生成版本；
- Emotion Recognition 使用有许可、自有或合成刺激，并完成年龄/文化/类别平衡审查；
- 初始仅单项/研究报告，不进入任何已发布报告包。

### PR 14 — `test(cognitive): round2 package report and task release gate`

**自动验收**

- 全部 P0/P1 新任务 schema、scorer golden fixtures、seed 重放、quality、report、export；
- 6 个 cognitive-only report package 的授权、实例化、发布和分析成功/失败矩阵；
- collection-only 混合容器的单项报告等价性与宽表 null/0 契约；
- collection-only 任意组合不生成综合报告；
- profile/version/slot mismatch 发布拒绝；
- snapshot 幂等、历史稳定、显式 reanalysis；
- scale mapping 正反方向、hash、质量和 descriptive-only 边界；
- student/teacher/researcher 权限与字段白名单；
- 无 overallScore、Domain 平均、percentile、IQ、诊断文案；
- backend/frontend `tsc --noEmit` 与相关/全量 vitest。

**浏览器 E2E**

至少覆盖：

1. 教师创建 collection-only 任意组合 → 学生完成 → 只见单项报告；
2. 未授权教师看不到 `attention_stability_v1`；管理员授权后，教师从包目录实例化 → 自动看到固定槽位 → 发布 → 学生完成 → package Domain report；
3. 任一任务质量失败 → 报告为部分/不足且保留单项；
4. `k12_core_profile_v1` 完整 start → history → report → research export；
5. approved multisource report package → 行为与自评分栏及 convergence/divergence；
6. 管理员 reanalysis → 新 snapshot 可选，参与者默认历史快照不变。

允许虚拟计时加速 E2E，但不能绕过 trial 数、practice gate、seed sequence 或服务端评分。

**发布 Gate**

- `Docker build` + backend/frontend smoke 必须通过并留报告；
- 至少一次 Chrome 实机 standard battery pilot，记录时长、触屏/键盘问题和中断恢复；
- 每个 PUBLISHED 新刺激集有来源/许可/内容审核记录；
- 跨来源报告包有实际量表审核签字；
- E2E 未完成不得以单元测试替代发布 gate。

Gate 通过后才把对应 task config 与 report package 从 DRAFT/disabled 提升为 PUBLISHED/recommended；不得在 pilot 前提前发布再原地修改。

---

## 13. 分阶段发布定义

### R2 Core 可发布

完成 PR0–PR11、P0 九个新任务、collection-only 单项/宽表基线、管理员授权的六个 cognitive-only report package、至少一个真实获批的跨来源包及 PR14 对应 gate。

### R2 Extended 可发布

在 R2 Core 后完成 PR12–PR13；通过内容/设备/pilot gate 的任务才设 `recommendedForCreate=true`。未通过的任务可保留 DRAFT，不影响 R2 Core 历史包报告。

不允许为了赶“任务数量”把 DRAFT 刺激或低信度结论暴露给参与者。

---

## 14. 最终验收清单

### 功能完整性

- [ ] Round 1 的 9 个任务与单任务报告无回归；
- [ ] Round 2 P0 新增 9 个任务，任务总数达到 18；
- [ ] collection-only 中每个 Scale/Cognitive 都有与 standalone 等价的独立报告，后台混合宽表可导出；
- [ ] 六个精确 cognitive-only report package 可被管理员授权，并生成各自专用的多领域/分面报告；
- [ ] 任意 Composite 仍可收集，但只能得到 unit reports；
- [ ] 至少一个获批 Scale mapping 支持真实跨来源报告；
- [ ] participant/teacher/researcher 三类报告与导出完成；
- [ ] Snapshot 历史稳定，显式 reanalysis 不覆盖。

### 科学与文案边界

- [ ] 不出现跨任务简单平均、综合认知指数、伪常模、伪百分位；
- [ ] descriptive-only 不被写成强弱/正常异常；
- [ ] 一个任务不冒充多任务一致；
- [ ] 行为、自评、Form 三种来源不混写；
- [ ] planning、risk、emotion、language 明确方法与内容限制；
- [ ] 不出现 IQ、临床诊断、因果或教育处分建议。

### 工程非冗余

- [ ] 仅一个 Analysis Snapshot 新表；报告包定义与 grant 分别复用代码 Registry 和 MaterialGrant；
- [ ] 无通用规则 DSL、插件系统、重复 Evidence 数据表；
- [ ] 新任务复用 Round 1 Registry/Runner/Trial/Scorer/Report/Export；
- [ ] 无 latest fallback、无 live Registry 改写历史；
- [ ] 不为延期任务预建无调用方的抽象层。

---

## 15. 主要风险与处理

| 风险 | 处理 |
|---|---|
| 新增任务多导致 PR 不可审 | 每 PR 三个同类任务；共享基础先在 PR1，任务包间可独立测试 |
| “综合报告”又变成任意组合总分 | ReportPackage 授权与发布冻结；collection-only 明确无综合；验收扫描 averageScore/overallScore/percentile |
| 新任务有范式但无效度 | 初始 referenceMode:none；先输出方法内描述；PUBLISHED stimulus/pilot gate |
| 执行功能领域重复计数 | primary/supporting mapping；同一 metric 一致性只计一次 |
| 量表名称相似就自动对齐 | exact code+dimension+contentHash+direction+mappingVersion；真实审核 gate |
| K12 全电池疲劳 | 提供 5 个短领域报告包；核心全电池显示预计 40–55 分钟并允许 Composite 分段 |
| 设备差异污染 RT | 保存已有必要设备/时序上下文并报告限制；不建设复杂设备指纹/校准平台 |
| 题库/图片许可不清 | stimulus provenance；不清楚即 DRAFT，不进入 recommended/PUBLISHED |
| 历史结论随代码变化 | 发布 package 冻结 + completion snapshot + 显式 reanalysis 新行 |

---

## 16. 与原 Round 2 文档的修订关系

本任务书保留原文的以下原则：

- quality gate → Evidence → Domain → cross-source → recommendation → snapshot；
- 量表和行为任务分源；
- 不做简单平均、伪常模和诊断；
- 报告按 participant/teacher/researcher 分层；
- 历史分析不可静默变化。

同时修订原文的六处不足：

1. 把“13 个候选 Domain”改为“10 个有任务支撑的正式领域 + 6 个扩展领域”；
2. 把任意 Composite 聚合改为显式、冻结且需管理员授权的 ReportPackage；内部 analysis protocol 不再直接暴露给教师；
3. 把抽象 Evidence/Rule 设计收敛为静态 Registry + 单张 Snapshot 表；
4. 先把 collection-only 收敛为“单项报告 + 宽表导出”，并删除任意多量表平均分的产品语义；
5. 把报告包授权建立在现有 MaterialGrant 上，不建设包编辑器或第二套权限系统；
6. 把 Round 1 延期的 P2/P3 与文献中常用任务重新筛选，形成 9 个核心任务、6 个扩展任务及明确排除项。

这意味着 Round 2 既扩充测验，也不会因为“任务数量更多”而放宽报告的科学边界。
