# Cognitive 认知测验全量审查基线｜2026-10-31

> **状态：静态源审查清单与行动方案；不是36项已完成科学审计、CI通过、正式入库或生产部署的证明。**
> 来源冻结：`main@9f135a2ce45f0223d39b48ea8797310a81a63970`；PR #368 head `1388d5db6f845b8d907f0e4090e4fd727aea8926`；#360 head `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`。生成器`fake`仅为测试夹具，不计测验。未经此次直接检查的独立科学效度、人群/语言、正式数据库状态，均留`pending`。

## 0. 范围与最小核验

- **冻结范围**：仅增加本审查文档，不改源码、刺激、计分、报告、schema、标签后端、权限、锁文件或现有历史证据。
- **改动→检查→唯一执行位置→证据→预算**：本Markdown新增→核36项目去重、固定来源commit、Markdown可读及没有假资格→GitHub精确源码与提交diff→本文件链接及生成注册表、#368分批原证据→仅一次静态核对；无需应用测试、镜像构建、CI、服务器运行。
- 后续实际代码修订必须重新冻结当时main/PR差异，按`AGENTS.md`与`docs/release/README.md`挑选受影响的唯一检查位置；只复用**输入与证据身份一致**的已有通过项。这里不自动授权PR激活、合并、正式发布或部署。

## 1. 现有代码：主干24项

本组来源为main后端`generated/identities.json`、`generated/catalog.ts`、`tasks/{id}/definitions.ts`以及前端`generated/runners.ts`。经逐项读取定义，全部**声明**`experience`、`research`、`standard`及基本报告定义；这不证明真实版本均已经创建/发布、全部说明已验收或个体有效性。

| # | id | 名称 | 构念/过程 | 定向审计重点（待核/待必要修订） | 拟对外归类（不是效度认证） |
|---:|---|---|---|---|---|
| 1 | `reaction` | 简单反应时 | 加工速度 | 复核反应时提前反应、遗漏和模拟参考标记 | 认知训练/速度；职业研究/速度与监控 |
| 2 | `memory` | 数字广度顺背 | 短时记忆 | 复核实际记忆跨度与协议上限区分 | 认知训练/记忆；教育/学习 |
| 3 | `stroop` | Stroop 色词 | 干扰控制 | 复核一致/不一致条件与速度、错误分母 | 认知训练/执行控制；职业研究/控制 |
| 4 | `gonogo` | Go/No-Go | 反应抑制 | 复核Go遗漏、No-Go误按及提前动作分开 | 认知训练/抑制；注意研究 |
| 5 | `cpt` | CPT-X 连续执行 | 持续注意 | 复核目标/非目标、误报/漏检、反应波动 | 认知训练/注意；职业研究/监控；注意研究 |
| 6 | `nback` | N-Back | 工作记忆更新 | 复核各难度命中/误报、d′修正和负值 | 认知训练/工作记忆；教育研究 |
| 7 | `corsi` | Corsi 视空间广度 | 视空间记忆 | 复核最大正确序列与有效试次计数 | 认知训练/记忆；教育研究 |
| 8 | `sst` | 停止信号 SST | 动作抑制 | 复核SSRT可用条件和短程隐藏、pRespondStop含义 | 认知训练/执行控制；注意研究 |
| 9 | `taskswitch` | Task Switching | 规则切换 | 复核切换与重复条件的分母、差值和顺序 | 认知训练/执行控制；职业研究/适应 |
| 10 | `patterncompare` | 图形模式比较 | 加工速度 | 复核正确率/用时/屏幕缩放的分离 | 认知训练/速度；职业研究/速度 |
| 11 | `flanker` | Flanker | 干扰控制 | 复核同向/冲突条件差值、误触和遗漏 | 认知训练/注意；教育研究 |
| 12 | `cardsort` | 规则卡片分类 | 规则学习与灵活性 | 复核反馈、坚持性错误和转规则记录 | 认知训练/灵活性；职业研究/学习 |
| 13 | `digitbackward` | 数字倒背 | 工作记忆操作 | 复核倒背次序严格判定、跨度与上限 | 认知训练/工作记忆；教育研究 |
| 14 | `picturesequence` | 图片序列学习 | 顺序学习 | 复核图片素材版本、回忆顺序和每轮分母 | 认知训练/记忆；教育研究 |
| 15 | `pairedassociate` | 图形—位置配对 | 联结记忆 | 复核配对正确、位置和学习轮次的计分 | 认知训练/记忆；教育研究 |
| 16 | `matrix` | 矩阵规则推理 | 流体推理 | 复核答案唯一性、题型差异和题本版权 | 认知训练/推理；职业研究/问题解决 |
| 17 | `mentalrotation` | 心理旋转 | 空间推理 | 复核镜像/旋转对称及设备几何 | 认知训练/空间；职业研究/空间 |
| 18 | `tower` | 塔式规划 | 计划能力 | 复核合法动作、最优步数与超时 | 认知训练/规划；职业研究/计划 |
| 19 | `trailmaking` | Trail Making | 视觉搜索与切换 | 复核轨迹、计时与遗漏/中断 | 认知训练/执行控制；注意研究 |
| 20 | `reversallearning` | 概率反转学习 | 反馈学习 | 复核反转点、随机收益与学习曲线 | 职业研究/反馈学习；认知训练/灵活性 |
| 21 | `bart` | BART 风险任务 | 风险选择 | 复核爆炸/已兑现分母、选择性指标 | 职业研究/决策；认知探索 |
| 22 | `wordlist` | 中文词表自由回忆 | 言语学习 | 复核中文归一化、拼写变体、轮次与延时 | 认知训练/言语记忆；教育研究 |
| 23 | `lexicaldecision` | 中文词汇判断 | 语言加工 | 复核真实/伪词平衡、速度和准确率 | 认知训练/语言；教育研究 |
| 24 | `emotionrecognition` | 六类情绪面孔分类 | 情绪线索分类 | 复核六类分母、素材文化适配与非共情解释 | SEL/情绪线索；职业研究/情绪信息 |

备注：主干已经存在科普杂志式报告、专业报告、`CognitiveReportVisual` SVG真实记录图、过程图、报告冻结和质量状态机制。不要因需要润色而新建平行报告引擎。旧`reaction`种子中存在`[INTERNAL PILOT]`和`referenceMode:simulated`，发布前必须明确展示/撤下模拟参考，不能当成真实同龄常模。报告已有源码≠全部最终视觉与内容验收通过。

## 2. PR #368：另外12项有代码的候选

下列12项按`content-candidates/`真实目录去重；它们不同于main24项。原#360的“35项目”是在11候选阶段；更新后为**24+12=36**。#368已记录候选双profile、计分器、报告和逐批隔离测试，但独立内容与正式运行状态不同。

| # | id | 名称 | 过程 | 当前可核阶段 | 部署前专项事项 |
|---:|---|---|---|---|---|
| 25 | `mot` | 多目标追踪 MOT | 视空间注意 | 认证独立 native；隔离草稿安装 | 帧记录、刷新差异及完整原件 |
| 26 | `enumeration` | 短时点数判断 | 视觉计数/精确度 | 认证独立 native；隔离草稿安装 | 物理几何、数点难度及指引 |
| 27 | `continuous-recognition` | 连续图像再认 | 识别记忆 | 源码候选；无可用正式素材/安装 | 科研+体验需184正式+6练习真实资产；体验至少74+6；还缺native宿主和归档 |
| 28 | `ant` | ANT/PANT 注意网络 | 警觉/定向/冲突 | 认证 native，隔离草稿安装 | 校准几何、条件分母、短版网络推断禁用 |
| 29 | `attentional-blink` | 注意瞬脱 | 时间性注意选择 | 认证 native，隔离草稿安装 | T2|T1正确的实际分母与UI按键映射 |
| 30 | `balloon-effort` | 气球努力 | 努力/收益选择 | 认证 native，隔离草稿安装 | 按条件比较与自由选择；不判勤奋等级 |
| 31 | `dual-arrow` | 双箭头 | 双任务干扰 | 认证 native，隔离草稿安装 | 两通道回应与练习中断恢复 |
| 32 | `gradcpt` | gradCPT | 持续注意/反应波动 | 认证 native，隔离草稿安装 | 无损wire/8MiB边界及闭合窗口口径 |
| 33 | `hearts-flowers` | 心与花 | 规则保持/抑制/转换 | 认证 native，隔离草稿安装 | 三规则分母、键盘token与不完整作答 |
| 34 | `horizon-exploration` | Horizon 探索 | 探索/利用决策 | 认证 native，隔离草稿安装 | 首次自由选择；偏好无对错 |
| 35 | `precision-working-memory` | 空间精度工作记忆 | 工作记忆精度 | 认证 native，隔离草稿安装 | 圆周角度/有符号差异、0与缺失 |
| 36 | `visual-search` | 两阶段视觉搜索 | 视觉搜索/定位 | 认证 native，隔离草稿安装 | 超时/提前/技术事件不混有效分母 |

历史：#368在旧批次完成11项目精确配置的**隔离**PostgreSQL DRAFT/GRANT安装，除连续图像再认外，新增9项接入认证 native，MOT/Enumeration有既有native路径。其测试和修复成果（包括视觉搜索分母、空间首响应、ANT几何、GradCPT无损高刷新传输）应复用经哈希核实的原证据。**#368整PR当前未形成正式最终CI/Ready/merge或生产发布资格。** 连续再认的`184+6`是已有设计要求，不是当前真实素材已取得的断言。

## 3. 不重复计数的其他来源

- PR #330：Simon 为`SOURCE/DESIGN_ONLY`，不能进入上述36个可执行项目；ANT已出现在#368，不再次计数。
- #360另列12项`RESEARCH_PLAN_ONLY`。其中 Hearts & Flowers 已在#368开发，仍有**11种待考虑新实现**：SART、PVT/PVT-B、信息采样、知觉判断＋信心、延迟选择、AX-CPT、ICAR言语/字母专项、单方资源分配、信任互惠、DCCS、原创岗位情境判断SJT。它们与现有任务有近邻但不是相同协议，优先复用而非改名重复计算。
- 不将数据库已安装、已授权、已发布、四入口可作答、生产部署等状态从源码推断出来。需逐次读取实际生产证据；本审查只读GitHub。

## 4. 双profile和报告修订的统一合同

| 核验项 | 体验版 experience | 科研版 research | 共通约束 |
|---|---|---|---|
| 任务说明 | 简短中英操作步骤、真人易懂示例、清楚的完成与保存确认 | 明示精确协议、试次/条件、设备要求及限制 | 练习不进正式分母；重练沿冻结规则；暂停/恢复保留记录 |
| 计分与质量 | 用本任务合法短协议和相同可靠score实现，仅描述本次 | 全条件数据与必要原件、冻结scorer/版本，科研导出可复核 | `0`、`null`、中断、limited、invalid不得混；速度/正确率条件分母可审计 |
| 报告与可视化 | 被试友好概览＋一张与公开指标相符的SVG数据图／准确次数表＋生活示意 | 后台正式构念、公式、质量与版本说明；仅依现有授权允许字段 | 从冻结公开投影作图，带可读文字替代；不能借报告读取raw/research_only |
| 判断边界 | 不生成个体智力、临床或招聘适合度结论 | 不虚构规范、效度、翻译等效或百分位 | 旧报告保持原版，任一质量撤下原因不抹去 |
| 标签 | 用途与交互/语言/设备/年龄证据状态 | 来源、版权、版本、科研协议/质量/样本适用性 | 标签不是权限/版权/科学审查门禁；作者联系可标pending |

不强制捏造第三个`standard`：main已有三个profile保留；候选只要明确的体验+科研两版且运行合同有效即可。每一个精确的`testType/configVersion/engineVersion/scoringVersion/reportVersion`不可在发布后静默改写。

**各任务的验收输出必须有**：版本/协议定位、原始刺激或材料版本、逐任务的演示说明/完整练习、合法计分条件+最小反例、三态报告及数据图（手机/宽屏/打印）、中英文与辅助可访问性边界、18维来源标签到受控目录的映射、拟对外分组、使用/版权/人群/成熟度状态、可复用的精确证据与唯一未完成项。尚未实际执行的验收标`PENDING`，不得用旧批次总PASS替代。

## 5. 对外使用的分类（一个源任务可以拥有多个用途标签）

### SEL · 社会情绪学习和社会决策
- **现有直接相关**：六类情绪面孔分类（仅情绪线索分类）；与自我调节有关的Stroop、Go/No-Go、Hearts & Flowers可作为执行过程补充，不能冒称同理心/情绪调节测量。
- **缺口**：自我情绪识别与调节的情境任务、社会线索多模态任务、资源分配/公平、信任与互惠、冲突情境决策。区分认知行为任务、问卷和SJT，不凭一轮行为推断人格/道德。
- **建议**：面向K12的SEL外部展示使用“情绪理解｜自我调节｜社会决策”子组，实质构念及证据独立标记。

### 职业行为与认知特长（仅评估/研究，不是当前可自动筛选人才）
- **注意与监控**：reaction、CPT-X、gradCPT、Flanker、ANT、MOT、视觉搜索。
- **学习与灵活性**：卡片分类、任务转换、反转学习、Horizon、N-back。
- **推理与计划**：matrix、mentalrotation、tower、patterncompare、trailmaking。
- **努力、风险与决策**：BART、balloon-effort、Horizon；未来信息采样、信心校准、延迟选择。
- **社会线索与合作**：emotionrecognition；未来分配和信任互惠。没有获得岗位效标效度前，不输出匹配职位或录用建议。
- 品牌Pymetrics/Harver仅为游戏化交互与业务形态参照，不复制其任务素材、专有匹配模型或预测性主张。

### 认知能力评估与练习（Lumosity式产品形态）
- **反应与加工速度**：reaction、patterncompare、lexicaldecision；
- **注意与执行控制**：CPT、gradCPT、ANT、Flanker、Stroop、Go/No-Go、SST、双箭头、注意瞬脱、视觉搜索、H&F；
- **工作记忆与学习**：memory、digitbackward、nback、corsi、pairedassociate、picturesequence、wordlist、MOT、空间精度、连续再认；
- **推理与规划**：matrix、mentalrotation、tower、cardsort、taskswitch、trailmaking；
- **决策与适应**：reversallearning、Horizon、BART、balloon-effort。
- **产品区分**：`assessment`仅一次测量；`practice`可重复练习；`adaptive_training`需要已实现的难度调节、反馈、追踪协议。重复施测不等于认知迁移或真实训练效果。

### 可额外开放的专题
- **K12学习与执行功能研究**：记忆、注意、认知灵活性、规则学习、推理；需单列年级/语言适配证据。
- **注意与警觉研究**：CPT-X、gradCPT、SST、ANT、Go/No-Go、H&F；未来SART、PVT、AX-CPT。不把网页任务作为ADHD诊断。
- **纵向科研与干预研究**：对精确同版协议重复施测，保留学习效应/设备差异/版本因素；不能把练习增长直接叫能力提升。
- **成人与老龄认知研究**：部分任务可作为研究协议候选；年龄有效性尚无证据时不可预标已验证。

## 6. 新增的建议顺序（保留原研究清单，不当作已实现）
1. **高优先**：信息采样＋信心校准（职业决策盲区），SART＋PVT（持续注意与警觉），延迟选择（努力/风险以外的时间权衡）。
2. **中优先**：儿童低龄DCCS、AX-CPT（目标保持与上下文）、单方分配及信任互惠（SEL/社会决策）。
3. **专项适配后再做**：ICAR指定言语题型（学术许可和真实材料）、原创岗位SJT（必须有岗位情境与计分效标，和纯认知任务分开）。

首批不重复开发已有心与花、不因名称不同重写Flanker/CPT已有引擎；优先补PR368剩余真实接入与报告。

## 7. 实际部署阻碍与唯一建议顺序

1. **内容静态审阅**：先逐项证据核实，修实有错误/文字/可视化，打版本和标签；主干24不重新造报告引擎，#368已修包不重复计分测试。
2. **接入与身份**：Training authenticated standalone/course已有定向证据；School/Teacher的Composite与Survey public是不同runtime和权限合同。需分别建立本域native准入、冻结运行事实、完成收据和原件端点；不能通过删除guard或借Training cookie绕过。
3. **图片等真实资产**：CRR必须有可加载且可冻结的正式+练习manifest；权利标签可pending，但不能把synthetic逻辑ID当图片。
4. **技术证据**：受影响的计分反例、runtime profile FINAL、原件重试、三态报告、移动端真实设备边界；复用输入相同旧证据而非重复全平台。完整正式门禁按最终head选择，当前没有执行。
5. **发行状态**：独立核目标正式数据库与真实管理员身份，preview→明确安装草稿→独立发布→受控分配；不得从代码中`PUBLISHED` seed断言数据库已激活。用户另行授权前不接生产/不部署。

## 8. 可核源

- [main当前生成任务注册表](https://github.com/caohuibj/eduK12-new-version/blob/9f135a2ce45f0223d39b48ea8797310a81a63970/server-version/backend/src/modules/cognitive/generated/identities.json)与[前端任务runner](https://github.com/caohuibj/eduK12-new-version/blob/9f135a2ce45f0223d39b48ea8797310a81a63970/server-version/frontend/src/modules/cognitive/generated/runners.ts)
- [#368候选逐包原始队列](https://github.com/caohuibj/eduK12-new-version/blob/feat/dot-cognitive-content-integration-20261028/docs/cognitive-library/onboarding-content-20261028/batch-queue.md)、[第二批报告与配置](https://github.com/caohuibj/eduK12-new-version/blob/feat/dot-cognitive-content-integration-20261028/docs/cognitive-library/onboarding-content-20261028/batch-2/README.md)、[第三批运行与归档](https://github.com/caohuibj/eduK12-new-version/blob/feat/dot-cognitive-content-integration-20261028/docs/cognitive-library/onboarding-content-20261028/batch-3/README.md)、[滚动独立复核](https://github.com/caohuibj/eduK12-new-version/blob/feat/dot-cognitive-content-integration-20261028/docs/cognitive-library/onboarding-content-20261028/parallel-review/README.md)
- [#360职业与注意研究备选](https://github.com/caohuibj/eduK12-new-version/blob/cognitive-next-three-core-20261026/docs/cognitive-library/scenario-roadmap-20261027/README.md)
- [主干已有被试/专业报告说明](https://github.com/caohuibj/eduK12-new-version/blob/main/docs/cognitive-report-audiences-implementation.md)
- [四入口实际缺口](https://github.com/caohuibj/eduK12-new-version/blob/feat/dot-cognitive-content-integration-20261028/docs/parallel-review/entry-adapters/README.md)
