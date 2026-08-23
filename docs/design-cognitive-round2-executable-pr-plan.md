# Round 2：受控综合报告、证据快照与认知任务扩充——可执行 PR 任务书

**状态**：实施中（从 PR0 开始，完成状态以本地 `dev` 合并记录为准）

**版本**：v1.0

**前置基线**：Round 1 已完成 Profile、冻结 Registry、9 个认知任务、服务端评分、单任务报告和 research-long 导出

**设计来源**：`docs/design-cognitive-round2-report-composite-feedback.md`

**证据与刺激 Gate**：`docs/cognitive-round2-evidence-sources.md`

**实施仓库**：`/Users/Qiang/Documents/eduK12-dev`

---

## 1. 本任务书解决什么

原 Round 2 文档说明了证据整合、Domain、跨来源反馈和 Snapshot 的方向，但还不能直接按 PR 开发；它也把“未来可能测量的领域”与“当前任务已经能支持的领域”混在了一起。

本任务书把 Round 2 改成可独立评审、可测试、可回滚的 PR 顺序，并补上三项产品约束：

1. **完整但不过度工程化**：只增加静态版本化 Registry、发布冻结和一张分析快照表；不做通用规则 DSL、插件系统、工作流引擎或证据明细表群。
2. **综合报告必须受控**：Composite 仍可收集任意模块，但只有命中预先发布的 `analysisProtocol` 才能生成综合报告；任意组合只能显示单项报告。
3. **补齐任务覆盖**：Round 2 核心新增 9 个任务，使正式任务从 9 个增至 18 个；另有 6 个扩展任务进入后续 PR，但不让低信度或高内容风险任务阻塞核心报告。

Round 2 的最终输出不是“综合认知 72 分”，而是：

```text
分析协议与覆盖范围
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
| 导出 | summary/full/research，含 Registry 字典与 raw trials | Round 2 追加分析快照、证据引用和协议版本 |
| Composite | 任意添加 Scale/Cognitive/Form，报告只组装 modules | 增加“仅收集”与“受控综合协议”两种模式 |

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
- 没有正式本地样本与协议匹配时，不显示 percentile、z-score、正常/异常或 IQ。

---

## 4. 产品边界：任意收集不等于任意综合

### 4.1 两种 Composite 模式

| 模式 | 创建方式 | 允许内容 | 报告 |
|---|---|---|---|
| `collection_only` | 默认 | 现有任意 Scale / Cognitive / Form 组合 | 只显示各模块报告、完成度和质量，不显示 Domain、跨来源结论或综合建议 |
| `analysis_protocol` | 教师从 PUBLISHED 协议选择 | 必须精确满足协议的任务槽位、Profile、版本和可选量表映射 | 生成协议声明的领域报告、跨来源结果、建议和 Snapshot |

禁止根据当前模块集合“猜一个最接近的协议”。如果发布时不满足协议，直接 400，并列出缺失、重复或版本不匹配的槽位。

### 4.2 综合分析不自动降级

- 某任务质量失败：保留原协议，输出“部分可解释/证据不足”，不换成更短协议；
- 某模块未完成：attempt 不能完成，沿用现有 required 语义；
- 发布后协议或模块改变：拒绝修改；复制时原样复制协议冻结快照；
- experience Profile：可完成和查看单项报告，但不能满足任何 v1 综合协议；
- Form：默认只作为上下文显示，不进入方向判断或因果结论。

### 4.3 v1 不做的防御性工程

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

PR 6 按下表建立第一版 primary evidence；表中未列出的指标只能作为单任务 secondary/quality 信息，不能临时加入综合结论。

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

| testType | 用途 | 建议三档 | 进入综合报告的条件 |
|---|---|---|---|
| `trailmaking` | 视觉搜索、动作速度、set shifting | 短 A / A+B / A+B 多等价形式 | 先验证触屏/鼠标设备差异；初版单项报告 |
| `wordlist` | 言语学习、即时/延迟回忆 | 8×2 / 12×3 / 15×5+延迟 | 中文词频、年龄适宜性、输入方式 pilot 后才进入协议 |
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

## 8. 受控 Analysis Protocol

### 8.1 v1 协议清单

协议由代码内 `AnalysisProtocolRegistry` 发布，所有任务槽位都是精确且必需的；v1 不提供教师自定义协议。

教师选协议时再选一次协议档位（standard 或 research）；v1 同一协议内所有认知槽位使用同一档位，不允许混搭。选择后由系统按协议精确版本自动创建/复用 Cognitive Assignment 并填入固定模块，教师不能删除或替换必需槽位。

| protocol key | 精确必需任务 | 主要输出 | 预计 standard 时长 |
|---|---|---|---:|
| `attention_stability_v1` | reaction + cpt + patterncompare | processing speed、sustained attention/stability | 约 10–15 分钟 |
| `inhibitory_control_v1` | gonogo + sst + stroop + flanker | response inhibition、interference control；分面并列 | 约 18–25 分钟 |
| `working_memory_v1` | memory + digitbackward + corsi + nback | verbal storage、manipulation、visuospatial storage、updating | 约 18–25 分钟 |
| `executive_control_v1` | nback + sst + taskswitch + cardsort + tower | updating、inhibition、switching、planning；无执行总分 | 约 25–35 分钟 |
| `learning_reasoning_v1` | picturesequence + pairedassociate + matrix + mentalrotation | episodic learning、fluid reasoning、visuospatial reasoning | 约 25–35 分钟 |
| `k12_core_profile_v1` | patterncompare + cpt + flanker + gonogo + nback + digitbackward + cardsort + picturesequence + matrix + tower | K12 核心多领域画像；不生成单一综合分 | 约 40–55 分钟，可由 Composite 分段完成 |

`k12_core_profile_v1` 是预定义电池，不是“以上任务任选若干”。如果未来要用等价替代任务，发布一个新 protocolVersion，并为新版本单独验证和冻结。

### 8.2 跨来源协议

跨来源只增加两个协议族，不对任何量表自动开放：

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

当前仓库没有可直接声明为正式映射的内置量表。PR 9 必须选定至少一个已获许可、PUBLISHED、评分语义清楚的实际量表并完成内容/心理学审核；若没有，跨来源协议保持 disabled，不能用测试 fixture 冒充产品完成。

### 8.3 Protocol 发布校验

发布 Composite 时一次性校验并冻结：

- protocolKey / protocolVersion；
- 精确任务槽位、顺序、required；
- 每个 Cognitive Assignment 的 testType、Profile、engine/scoring/config/report definition versions；
- 每个 Scale 的 code、dimension、contentHash、direction 与 mappingVersion；
- audience、Domain 输出范围、recommendationRuleVersion；
- caveats 与 protocolDefinitionVersion。

Session/Attempt 只复制冻结内容，不重新匹配 live Registry。

---

## 9. Evidence 与综合报告规则

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
- `directionClass` 只能来自冻结的 criterion、协议匹配的文献/本地 reference，或量表已审核 band；
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

只有同一 protocol 中的精确 Scale mapping 才能产生：

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

Round 1 尚无参与者年龄/年级的 Session 级冻结，因此 Round 2 v1 不从 seed/config 猜测 K7–9，也不默认落入第一个 reference band。若某个获批 reference 必须按年龄/年级选择，protocol 要显式加入受控 `participant_age_band` Form 槽位并把答案冻结到分析输入；缺失或非法时 reference 为 unavailable。该字段只用于选择已批准 reference，不进入 convergence 或因果推断。

### 9.4 建议规则

建议由 protocol 内静态 `RecommendationRule` 生成，必须包含 ruleId、version、audience 和触发 evidenceRefs。v1 不做通用表达式 DSL；规则使用有类型的代码函数和固定模板。

---

## 10. 最小数据与接口改动

### 10.1 Prisma

`CompositeAssessment` 增加：

```text
analysisProtocolKey                 String?
analysisProtocolVersion             String?
analysisProtocolSnapshotEncrypted   String?
```

`null` 表示 `collection_only`，避免另建 mode 列。

新增一张表：

```text
CompositeAnalysisSnapshot
  id
  attemptId
  protocolKey
  protocolVersion
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
+ protocol / mapping / analysis versions
+ report schema / recommendation rule versions
```

不能 hash 随机化加密密文本身。相同输入与版本应幂等返回已有快照。

### 10.3 API

新增/升级：

```text
GET  /api/composites/analysis-protocols
POST /api/composites                         # 可选 protocolKey
POST /api/composites/:id/publish             # 精确校验并冻结
GET  /api/composites/attempts/:id/report     # collection-only 或 snapshot report
GET  /api/composites/attempts/:id/snapshots  # teacher/admin
POST /api/composites/attempts/:id/reanalyze  # admin，显式 action
GET  /api/composites/attempts/:id/export     # 追加 analysis files/sheets
```

沿用现有匿名 recovery、教师所有权、wrapper 403 和下载二次鉴权，不另造权限体系。

### 10.4 主要代码落点

| 范围 | 预计位置 |
|---|---|
| Domain/Evidence/Protocol | `server-version/backend/src/modules/cognitive-analysis/`（新目录） |
| Composite 冻结/报告/快照 | `server-version/backend/src/modules/composite/` |
| 数据模型 | `server-version/backend/prisma/schema.prisma` + 单次 migration |
| 新任务 schema/scorer/registry | `server-version/backend/src/modules/cognitive/` 现有结构 |
| 新任务 Runner | `server-version/frontend/src/components/cognitive/tasks/` 现有结构 |
| 协议选择与综合报告 UI | 现有 Composite 教师创建页、参与者结果页与教师结果页 |
| seed | 现有 cognitive seed 脚本；不另建任务专用 seed 系统 |
| 测试 | 现有 backend/frontend cognitive/composite suites，新增 protocol/snapshot fixtures |

---

## 11. PR 顺序与依赖

```text
PR0  文档/契约冻结
  ↓
PR1  Domain/Evidence/Protocol Registry
  ├──────────────┬──────────────┐
  ↓              ↓              ↓
PR2 协议选择冻结  PR3 任务包 A    PR4 任务包 B    PR5 任务包 C
  └──────────────┴──────┬───────┘
                         ↓
PR6 认知 Evidence + Domain Engine
  ↓
PR7 Analysis Snapshot
  ├──────────────┐
  ↓              ↓
PR8 报告 API/UI   PR9 Scale Mapping + 跨来源
  └──────┬───────┘
         ↓
PR10 建议与导出

PR11/PR12 扩展任务可在 PR1 后并行开发，但不提前接入正式协议
         ↓
PR13 Round 2 release gate
```

所有 PR 从最新本地 `dev` 切分支，测试通过后 `--no-ff` 合回本地 `dev`；除非用户另行要求，不 push。

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
- 工程评审确认范围；内容/心理学审核可在 PR0 标记 pending，但必须在对应 stimulus/config 进入 PUBLISHED 前关闭，并由 PR13 Gate 复核。

### PR 1 — `feat(cognitive-analysis): add versioned domain evidence and protocol registries`

**内容**

- 新建有类型的静态 Registry：`domain.registry.ts`、`evidence-mapping.registry.ts`、`analysis-protocol.registry.ts`、`recommendation.registry.ts`；
- 定义 `EvidenceItem`、`DomainResult`、`CrossSourceFinding`、`CompositeReportV2`；
- 注册第 8 节的 6 个 cognitive-only 协议，初始状态 DRAFT/disabled；任务包、Domain Engine 和 Gate 通过后由 PR 13 提升为 PUBLISHED；跨来源协议先 disabled；
- 显式列出精确版本，禁止 latest、模糊 testType fallback 和 runtime register API；
- catalog 对普通创建流程只列 PUBLISHED；管理员调试视图可见 DRAFT/disabled 及原因，不泄露量表内容。

**DoD**

- Registry 重复 key、未知 Domain、未知 metric、同一 primary metric 重复计数在启动/测试时失败；
- protocol contract test 验证 exact slots 和允许 Profile；
- 本 PR 不改数据库、不生成报告、不增加管理 UI。

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

### PR 6 — `feat(cognitive-analysis): build cognitive evidence and controlled domain reports`

**内容**

- 从已冻结的 single-task result/report provenance 转为 `EvidenceItem[]`；
- 质量失败的 evidence 保留引用但 `interpretable=false`，不进入综合结论；
- 实现 10 个正式 Domain/Facet 输出及 6 个 cognitive-only protocols；
- 根据第 9 节规则产生 status/consistency/summary/caveats；
- 所有新任务初始 `referenceMode:none`，所以多数结果为 descriptive-only；有合法 reference 才产生方向分类。

**DoD**

- 不读取 raw trials 重新发明 scorer；只消费冻结 metrics/quality/provenance；
- 不计算跨任务平均、Domain score、overall score、percentile；
- 一个任务不生成 consistent；不同 Domain 不互相比一致性；
- 同一 metric 不重复增强证据；质量失败得到 partial/insufficient，而不是协议降级；
- golden report fixture 覆盖每个 protocol 的完整、部分质量失败、全部 descriptive-only。

### PR 7 — `feat(composite): persist immutable analysis snapshots`

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

### PR 8 — `feat(composite-report): render protocol-based participant teacher and researcher reports`

**报告顺序**

```text
报告范围/协议
→ 数据质量与缺失
→ 核心领域与分面
→ 行为任务证据
→ 单项模块报告
→ 建议
→ 限制与版本来源
```

**内容**

- 升级 report API 为 `CompositeReportV2`；collection-only 返回 modules + 明确提示；
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

### PR 9 — `feat(composite-analysis): add approved scale mapping and cross-source findings`

**内容**

- 建立代码内 `ScaleConstructMappingRegistry`；
- 选定至少一个实际 PUBLISHED、已获许可量表，冻结 `scale.code + dimension.code + contentHash + score semantics`；
- 同时选定至少一个协议完全匹配、来源可追溯的 cognitive criterion/reference；若需要年龄带，按第 9.3 节加入并冻结必填 `participant_age_band`，禁止使用 seed 默认带或内部模拟参考；
- 完成注意或执行领域的第一组 multisource protocol，先保持 DRAFT，PR 13 审核后再 PUBLISHED；
- 行为/自评来源在数据结构和 UI 中分开；
- 实现 convergence/divergence/single-source/insufficient-quality；
- 任意自建 Scale、名称相似 Scale、内容 hash 不匹配 Scale 只能留在 modules。

**DoD**

- higher-more-difficulty 与 higher-more-strength 双向测试；
- 缺维度、逆向语义、hash 变化、未批准 Scale 不集成；
- descriptive-only 认知证据不能与量表生成 convergence；
- protocol/reference 不匹配、年龄带缺失或来源未审核时只能返回 unavailable/single-source；
- Form 不进入规则；
- 无真实获批 mapping 时，本 PR 不得以 fixture-only 方式宣称完成。

### PR 10 — `feat(composite-analysis): add traceable recommendations and analysis export`

**内容**

- 根据 protocol + Domain/CrossSource status 生成版本化建议；
- student/teacher/researcher 分别有白名单模板；
- export 增加 `analysis.json`、`domain_evidence.csv`、`cross_source_findings.csv`、`recommendations.csv` 和 README 方法说明；
- XLSX 增加 Analysis/DomainEvidence/Findings/Recommendations/Provenance sheets；
- 每条建议带 ruleId/version/evidenceRefs，不调用 LLM。

**DoD**

- 无足够证据不生成强建议；
- divergence 文案强调情境差异，不把任一来源判为错误；
- export 与画面来自同一 snapshotId；教师继续强制匿名；
- 旧 cognitive research export 格式回归不变。

### PR 11 — `feat(cognitive): add decision and visual-search research task pack`

新增：`trailmaking`、`reversallearning`、`bart`。

- 初始 `recommendedForCreate=false` 或 research-only；
- Trail Making 保存设备/指针信息并在报告提示 motor/device confound，但不建设设备指纹系统；
- Reversal Learning 记录 acquisition/reversal 分段、perseverative errors 和 trials-to-criterion；
- BART 记录 adjusted pumps、爆破数、现金化数；不输出好坏等级；
- 在 pilot 与可靠性审查前不加入核心 protocol。

### PR 12 — `feat(cognitive): add language and social cognition content-gated task pack`

新增：`wordlist`、`lexicaldecision`、`emotionrecognition`。

- 代码和 schema 可合入；只有内容 gate 通过的 stimulus set 才能 PUBLISHED/recommended；
- Word List 的输入方式、错别字 normalization、延迟阶段必须有 pilot 记录；不复制 CVLT/RAVLT 词表；
- Lexical Decision 记录词频带、字长和伪词生成版本；
- Emotion Recognition 使用有许可、自有或合成刺激，并完成年龄/文化/类别平衡审查；
- 初始仅单项/研究报告，不进入核心综合协议。

### PR 13 — `test(cognitive): round2 protocol report and task release gate`

**自动验收**

- 全部 P0/P1 新任务 schema、scorer golden fixtures、seed 重放、quality、report、export；
- 6 个 cognitive protocol 的成功/失败矩阵；
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
2. 教师选择 `attention_stability_v1` → 自动看到固定槽位 → 发布 → 学生完成 → Domain report；
3. 任一任务质量失败 → 报告为部分/不足且保留单项；
4. `k12_core_profile_v1` 完整 start → history → report → research export；
5. approved multisource protocol → 行为与自评分栏及 convergence/divergence；
6. 管理员 reanalysis → 新 snapshot 可选，参与者默认历史快照不变。

允许虚拟计时加速 E2E，但不能绕过 trial 数、practice gate、seed sequence 或服务端评分。

**发布 Gate**

- `Docker build` + backend/frontend smoke 必须通过并留报告；
- 至少一次 Chrome 实机 standard battery pilot，记录时长、触屏/键盘问题和中断恢复；
- 每个 PUBLISHED 新刺激集有来源/许可/内容审核记录；
- 跨来源协议有实际量表审核签字；
- E2E 未完成不得以单元测试替代发布 gate。

Gate 通过后才把对应 task config 与 protocol 从 DRAFT/disabled 提升为 PUBLISHED/recommended；不得在 pilot 前提前发布再原地修改。

---

## 13. 分阶段发布定义

### R2 Core 可发布

完成 PR 0–10、P0 九个新任务、六个 cognitive-only protocol、至少一个真实获批的跨来源协议及 PR 13 对应 gate。

### R2 Extended 可发布

在 R2 Core 后完成 PR 11–12；通过内容/设备/pilot gate 的任务才设 `recommendedForCreate=true`。未通过的任务可保留 DRAFT，不影响 R2 Core 历史协议。

不允许为了赶“任务数量”把 DRAFT 刺激或低信度结论暴露给参与者。

---

## 14. 最终验收清单

### 功能完整性

- [ ] Round 1 的 9 个任务与单任务报告无回归；
- [ ] Round 2 P0 新增 9 个任务，任务总数达到 18；
- [ ] 六个精确 cognitive-only protocol 可生成多领域/分面报告；
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

- [ ] 仅一个 Analysis Snapshot 新表；
- [ ] 无通用规则 DSL、插件系统、重复 Evidence 数据表；
- [ ] 新任务复用 Round 1 Registry/Runner/Trial/Scorer/Report/Export；
- [ ] 无 latest fallback、无 live Registry 改写历史；
- [ ] 不为延期任务预建无调用方的抽象层。

---

## 15. 主要风险与处理

| 风险 | 处理 |
|---|---|
| 新增任务多导致 PR 不可审 | 每 PR 三个同类任务；共享基础先在 PR1，任务包间可独立测试 |
| “综合报告”又变成任意组合总分 | protocol 发布冻结；collection-only 明确无综合；验收扫描 overallScore/percentile |
| 新任务有范式但无效度 | 初始 referenceMode:none；先输出方法内描述；PUBLISHED stimulus/pilot gate |
| 执行功能领域重复计数 | primary/supporting mapping；同一 metric 一致性只计一次 |
| 量表名称相似就自动对齐 | exact code+dimension+contentHash+direction+mappingVersion；真实审核 gate |
| K12 全电池疲劳 | 提供 5 个短领域协议；核心全电池显示预计 40–55 分钟并允许 Composite 分段 |
| 设备差异污染 RT | 保存已有必要设备/时序上下文并报告限制；不建设复杂设备指纹/校准平台 |
| 题库/图片许可不清 | stimulus provenance；不清楚即 DRAFT，不进入 recommended/PUBLISHED |
| 历史结论随代码变化 | 发布协议冻结 + completion snapshot + 显式 reanalysis 新行 |

---

## 16. 与原 Round 2 文档的修订关系

本任务书保留原文的以下原则：

- quality gate → Evidence → Domain → cross-source → recommendation → snapshot；
- 量表和行为任务分源；
- 不做简单平均、伪常模和诊断；
- 报告按 participant/teacher/researcher 分层；
- 历史分析不可静默变化。

同时修订原文的四处不足：

1. 把“13 个候选 Domain”改为“10 个有任务支撑的正式领域 + 6 个扩展领域”；
2. 把任意 Composite 聚合改为显式、冻结的 analysis protocol；
3. 把抽象 Evidence/Rule 设计收敛为静态 Registry + 单张 Snapshot 表；
4. 把 Round 1 延期的 P2/P3 与文献中常用任务重新筛选，形成 9 个核心任务、6 个扩展任务及明确排除项。

这意味着 Round 2 既扩充测验，也不会因为“任务数量更多”而放宽报告的科学边界。
